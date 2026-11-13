"""Gantt report: the interventions of a period (optionally of one customer), grouped by commessa,
then by project, with hours, man-hours, technicians, machines and statuses.

Hours of an intervention:
- "worked": the hours actually worked, when entered on the intervention (Event.worked_hours);
- "times": otherwise end − start (an end at 23:59 counts as midnight);
- "missing": no worked hours and no complete times → 0 hours, flagged.
Cancelled and postponed interventions count 0 hours unless worked hours were entered.
Man-hours = hours × technicians of the intervention (participants and technicians assigned to its
server rows).

Used by the Gantt view (JSON) and by its Excel export.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Event, EventServer, EventUser, Project

NOT_WORKED = ("annullato", "rinviato")
END_OF_DAY = time(23, 59)


def event_hours(e: Event) -> tuple[float, str]:
    """(hours, source) with source "worked" | "times" | "missing" | "not_worked"."""
    if e.worked_hours is not None:
        return round(float(e.worked_hours), 2), "worked"
    if e.status in NOT_WORKED:
        return 0.0, "not_worked"
    if e.start_time and e.end_time:
        start = datetime.combine(e.event_date, e.start_time)
        end = datetime.combine(e.event_date, e.end_time)
        if e.end_time == END_OF_DAY:
            end += timedelta(minutes=1)
        return round(max((end - start).total_seconds(), 0) / 3600, 2), "times"
    return 0.0, "missing"


def _totals() -> dict:
    return {"events": 0, "servers": set(), "hours": 0.0, "man_hours": 0.0, "statuses": Counter(),
            "missing_hours": 0, "no_technicians": 0, "first": None, "last": None, "tech_hours": {}}


def _add(tot: dict, ev: dict) -> None:
    tot["events"] += 1
    tot["servers"].update(ev["server_ids"])
    tot["hours"] += ev["hours"]
    tot["man_hours"] += ev["man_hours"]
    tot["statuses"][ev["status"]] += 1
    tot["missing_hours"] += ev["hours_source"] == "missing"
    tot["no_technicians"] += not ev["technician_ids"]
    d = ev["event_date"]
    tot["first"] = d if tot["first"] is None or d < tot["first"] else tot["first"]
    tot["last"] = d if tot["last"] is None or d > tot["last"] else tot["last"]
    for uid, name in zip(ev["technician_ids"], ev["technicians"]):
        t = tot["tech_hours"].setdefault(uid, {"id": uid, "name": name, "hours": 0.0, "events": 0})
        t["hours"] += ev["hours"]
        t["events"] += 1


def _out(tot: dict) -> dict:
    return {
        "events": tot["events"], "servers": len(tot["servers"]),
        "hours": round(tot["hours"], 2), "man_hours": round(tot["man_hours"], 2),
        "statuses": dict(tot["statuses"]), "missing_hours": tot["missing_hours"],
        "no_technicians": tot["no_technicians"], "first": tot["first"], "last": tot["last"],
        "technicians": sorted(
            ({**t, "hours": round(t["hours"], 2)} for t in tot["tech_hours"].values()),
            key=lambda t: (-t["hours"], t["name"].lower()),
        ),
    }


def build_gantt(session: Session, start: date, end: date, customer_id: int | None = None) -> dict:
    stmt = (
        select(Event)
        .join(Event.project)
        .where(Event.event_date >= start, Event.event_date <= end)
        .options(
            selectinload(Event.project).selectinload(Project.customer),
            selectinload(Event.order),
            selectinload(Event.participants).selectinload(EventUser.user),
            selectinload(Event.server_links).selectinload(EventServer.assigned_user),
        )
    )
    if customer_id is not None:
        stmt = stmt.where(Project.customer_id == customer_id)
    events = list(session.scalars(stmt))
    events.sort(key=lambda e: (e.event_date, e.start_time or time.min, e.id))

    total = _totals()
    groups: dict[tuple, dict] = {}
    for e in events:
        techs = {p.user.id: p.user.display_name for p in e.participants}
        for link in e.server_links:
            if link.assigned_user is not None:
                techs.setdefault(link.assigned_user.id, link.assigned_user.display_name)
        tech_items = sorted(techs.items(), key=lambda kv: kv[1].lower())
        hours, source = event_hours(e)
        ev = {
            "id": e.id, "event_date": e.event_date, "start_time": e.start_time, "end_time": e.end_time,
            "title": e.title, "event_type": e.event_type, "status": e.status,
            "hours": hours, "hours_source": source, "man_hours": round(hours * len(tech_items), 2),
            "worked_hours": e.worked_hours,
            "technician_ids": [k for k, _ in tech_items], "technicians": [v for _, v in tech_items],
            "server_ids": {link.server_id for link in e.server_links},
            "servers": len(e.server_links),
            "migrated": sum(1 for link in e.server_links if link.migration_status == "completata"),
        }
        customer = e.project.customer
        key = (customer.name.lower() if customer else "￿", customer.id if customer else None,
               e.order.code if e.order else None)
        g = groups.get(key)
        if g is None:
            g = groups[key] = {
                "customer_id": customer.id if customer else None,
                "customer_name": customer.name if customer else None,
                "order_id": e.order_id, "order_code": e.order.code if e.order else None,
                "tot": _totals(), "projects": {},
            }
        p = g["projects"].get(e.project_id)
        if p is None:
            p = g["projects"][e.project_id] = {"id": e.project_id, "name": e.project.name, "tot": _totals(), "events": []}
        p["events"].append(ev)
        for tot in (total, g["tot"], p["tot"]):
            _add(tot, ev)

    def order_key(item):
        (cust, _cid, code), _g = item
        return (cust, code is None, (code or "").lower())

    orders = []
    for _key, g in sorted(groups.items(), key=order_key):
        projects = sorted(g["projects"].values(), key=lambda p: (p["tot"]["first"], p["name"].lower()))
        orders.append({
            "customer_id": g["customer_id"], "customer_name": g["customer_name"],
            "order_id": g["order_id"], "order_code": g["order_code"], "totals": _out(g["tot"]),
            "projects": [
                {"id": p["id"], "name": p["name"], "totals": _out(p["tot"]),
                 "events": [{k: v for k, v in ev.items() if k != "server_ids"} for ev in p["events"]]}
                for p in projects
            ],
        })
    return {"start": start, "end": end, "customer_id": customer_id, "totals": _out(total), "orders": orders}
