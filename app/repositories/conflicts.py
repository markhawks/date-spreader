"""Scheduling conflicts between interventions.

- **Server conflict**: the same server is in two interventions on the same day.
- **Technician conflict**: the same technician (participant, or assigned to a server row) is in two
  interventions on the same day whose time windows overlap. An intervention without a start time
  counts as the whole day; one without an end time lasts until the end of the day.

Cancelled interventions ("annullato") are ignored: they will not take place.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, time

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Customer, Event, EventCheckUser, EventServer, EventUser, Project, Server, User

IGNORED_STATUSES = ("annullato",)
DAY_START = 0
DAY_END = 24 * 60


def _minutes(t: time | None, default: int) -> int:
    return default if t is None else t.hour * 60 + t.minute


def _window(start: time | None, end: time | None) -> tuple[int, int]:
    if start is None:
        return DAY_START, DAY_END
    return _minutes(start, DAY_START), _minutes(end, DAY_END)


def _overlap(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


@dataclass
class EventConflicts:
    """Conflicts of one intervention: {server_id: {other event ids}}, {user_id: {other event ids}}."""

    servers: dict[int, set[int]] = field(default_factory=lambda: defaultdict(set))
    users: dict[int, set[int]] = field(default_factory=lambda: defaultdict(set))

    def __bool__(self) -> bool:
        return bool(self.servers or self.users)


EVENT, CHECK = "event", "check"   # an intervention on its day, and its pre-check on the check day


def conflicts_on(session: Session, days: set[date]) -> dict[tuple[int, str], EventConflicts]:
    """Conflicts on the given days, by (event id, EVENT or CHECK).

    Each non-cancelled intervention is busy on its day (its servers, participants and technicians of the
    rows, in its time window) and, if it has a pre-check, on the check day (only the technicians of the
    check, or its participants, in the check's window). The users/servers sets hold the other keys.
    """
    if not days:
        return {}
    rows = session.execute(
        select(Event.id, Event.event_date, Event.start_time, Event.end_time,
               Event.check_date, Event.check_start_time, Event.check_end_time)
        .where(or_(Event.event_date.in_(days), Event.check_date.in_(days)),
               Event.status.not_in(IGNORED_STATUSES))
    ).all()
    if not rows:
        return {}
    ids = [r.id for r in rows]
    servers: dict[int, set[int]] = defaultdict(set)   # event → servers
    people: dict[int, set[int]] = defaultdict(set)    # event → participants and technicians of the rows
    participants: dict[int, set[int]] = defaultdict(set)
    checkers: dict[int, set[int]] = defaultdict(set)
    for event_id, server_id in session.execute(
        select(EventServer.event_id, EventServer.server_id).where(EventServer.event_id.in_(ids))
    ):
        servers[event_id].add(server_id)
    for event_id, user_id in session.execute(
        select(EventServer.event_id, EventServer.assigned_user_id)
        .where(EventServer.event_id.in_(ids), EventServer.assigned_user_id.is_not(None))
    ):
        people[event_id].add(user_id)
    for event_id, user_id in session.execute(
        select(EventUser.event_id, EventUser.user_id).where(EventUser.event_id.in_(ids))
    ):
        people[event_id].add(user_id)
        participants[event_id].add(user_id)
    for event_id, user_id in session.execute(
        select(EventCheckUser.event_id, EventCheckUser.user_id).where(EventCheckUser.event_id.in_(ids))
    ):
        checkers[event_id].add(user_id)

    # occurrences: key → (day, window, people, servers)
    occ: dict[tuple[int, str], tuple] = {}
    for r in rows:
        if r.event_date in days:
            occ[(r.id, EVENT)] = (r.event_date, _window(r.start_time, r.end_time), people[r.id], servers[r.id])
        if r.check_date and r.check_date in days:
            occ[(r.id, CHECK)] = (r.check_date, _window(r.check_start_time, r.check_end_time),
                                  checkers[r.id] or participants[r.id], set())

    by_day: dict[date, list[tuple[int, str]]] = defaultdict(list)
    for key, (day, *_rest) in occ.items():
        by_day[day].append(key)

    result: dict[tuple[int, str], EventConflicts] = defaultdict(EventConflicts)
    for same_day in by_day.values():
        for i, a in enumerate(same_day):
            for b in same_day[i + 1:]:
                if a[0] == b[0]:
                    continue  # an intervention and its own check on the same day
                for server_id in occ[a][3] & occ[b][3]:
                    result[a].servers[server_id].add(b)
                    result[b].servers[server_id].add(a)
                if _overlap(occ[a][1], occ[b][1]):
                    for user_id in occ[a][2] & occ[b][2]:
                        result[a].users[user_id].add(b)
                        result[b].users[user_id].add(a)
    return {k: v for k, v in result.items() if v}


def describe(session: Session, event: Event) -> list[dict]:
    """Conflicts of one intervention and of its pre-check, with the details shown in its card (other
    intervention or check, server hostname or technician name)."""
    if event.status in IGNORED_STATUSES:
        return []
    days = {event.event_date} | ({event.check_date} if event.check_date else set())
    all_found = conflicts_on(session, days)
    mine = {kind: all_found.get((event.id, kind)) for kind in (EVENT, CHECK)}
    mine = {k: v for k, v in mine.items() if v}
    if not mine:
        return []
    other_keys = set()
    for found in mine.values():
        other_keys |= set().union(*found.servers.values(), *found.users.values())
    others = {
        row.id: row for row in session.execute(
            select(Event.id, Event.event_date, Event.start_time, Event.end_time, Event.title,
                   Event.check_date, Event.check_start_time, Event.check_end_time,
                   Project.name.label("project_name"), Customer.name.label("customer_name"))
            .join(Project, Project.id == Event.project_id)
            .outerjoin(Customer, Customer.id == Project.customer_id)
            .where(Event.id.in_({k[0] for k in other_keys}))
        )
    }
    server_ids = set().union(*(f.servers for f in mine.values()))
    user_ids = set().union(*(f.users for f in mine.values()))
    hostnames = dict(session.execute(select(Server.id, Server.hostname).where(Server.id.in_(server_ids))).all())
    names = dict(session.execute(select(User.id, User.display_name).where(User.id.in_(user_ids))).all())

    def other(key: tuple[int, str]) -> dict:
        o = others[key[0]]
        check = key[1] == CHECK
        return {"id": o.id, "event_date": o.check_date if check else o.event_date,
                "start_time": o.check_start_time if check else o.start_time,
                "end_time": o.check_end_time if check else o.end_time,
                "title": o.title, "project_name": o.project_name, "customer_name": o.customer_name,
                "is_check": check}

    items = []
    for kind, found in mine.items():
        items += [
            {"kind": "server", "ref_id": sid, "name": hostnames.get(sid, "?"), "other": other(k), "on_check": kind == CHECK}
            for sid, keys in found.servers.items() for k in sorted(keys)
        ] + [
            {"kind": "technician", "ref_id": uid, "name": names.get(uid, "?"), "other": other(k), "on_check": kind == CHECK}
            for uid, keys in found.users.items() for k in sorted(keys)
        ]
    return sorted(items, key=lambda c: (c["on_check"], c["kind"] != "technician", c["name"].lower(), c["other"]["id"]))
