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

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Customer, Event, EventServer, EventUser, Project, Server, User

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


def conflicts_on(session: Session, days: set[date]) -> dict[int, EventConflicts]:
    """Conflicts of every (non-cancelled) intervention on the given days, by event id."""
    if not days:
        return {}
    events = session.execute(
        select(Event.id, Event.event_date, Event.start_time, Event.end_time)
        .where(Event.event_date.in_(days), Event.status.not_in(IGNORED_STATUSES))
    ).all()
    if not events:
        return {}
    ids = [e.id for e in events]
    info = {e.id: (e.event_date, _window(e.start_time, e.end_time)) for e in events}

    servers: dict[int, set[int]] = defaultdict(set)   # event → servers
    people: dict[int, set[int]] = defaultdict(set)    # event → technicians
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

    by_day: dict[date, list[int]] = defaultdict(list)
    for event_id, (day, _) in info.items():
        by_day[day].append(event_id)

    result: dict[int, EventConflicts] = defaultdict(EventConflicts)
    for same_day in by_day.values():
        for i, a in enumerate(same_day):
            for b in same_day[i + 1:]:
                for server_id in servers[a] & servers[b]:
                    result[a].servers[server_id].add(b)
                    result[b].servers[server_id].add(a)
                if _overlap(info[a][1], info[b][1]):
                    for user_id in people[a] & people[b]:
                        result[a].users[user_id].add(b)
                        result[b].users[user_id].add(a)
    return {k: v for k, v in result.items() if v}


def describe(session: Session, event: Event) -> list[dict]:
    """Conflicts of one intervention, with the details shown in its card (other intervention,
    server hostname or technician name)."""
    if event.status in IGNORED_STATUSES:
        return []
    found = conflicts_on(session, {event.event_date}).get(event.id)
    if not found:
        return []
    other_ids = set().union(*found.servers.values(), *found.users.values())
    others = {
        row.id: row for row in session.execute(
            select(Event.id, Event.event_date, Event.start_time, Event.end_time, Event.title,
                   Project.name.label("project_name"), Customer.name.label("customer_name"))
            .join(Project, Project.id == Event.project_id)
            .outerjoin(Customer, Customer.id == Project.customer_id)
            .where(Event.id.in_(other_ids))
        )
    }
    hostnames = dict(session.execute(select(Server.id, Server.hostname).where(Server.id.in_(found.servers))).all())
    names = dict(session.execute(select(User.id, User.display_name).where(User.id.in_(found.users))).all())

    def other(eid: int) -> dict:
        o = others[eid]
        return {"id": o.id, "event_date": o.event_date, "start_time": o.start_time, "end_time": o.end_time,
                "title": o.title, "project_name": o.project_name, "customer_name": o.customer_name}

    items = [
        {"kind": "server", "ref_id": sid, "name": hostnames.get(sid, "?"), "other": other(eid)}
        for sid, eids in found.servers.items() for eid in sorted(eids)
    ] + [
        {"kind": "technician", "ref_id": uid, "name": names.get(uid, "?"), "other": other(eid)}
        for uid, eids in found.users.items() for eid in sorted(eids)
    ]
    return sorted(items, key=lambda c: (c["kind"] != "technician", c["name"].lower(), c["other"]["id"]))
