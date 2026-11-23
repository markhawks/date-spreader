"""Anagrafica server: ricerca su tutti i server (anche se non sono in nessun intervento) e storico."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Customer, Event, EventServer, Project, Server, User
from app.repositories.calendar import _like


def _filters(q: str | None):
    if not q:
        return []
    pattern = _like(q)
    cols = (Server.hostname, Server.ip_address, Server.operating_system, Server.environment,
            Server.current_kernel, Server.location, Server.steamroller_inventory, Server.notes)
    return [or_(*(func.lower(func.coalesce(c, "")).like(pattern, escape="\\") for c in cols))]


def list_servers(session: Session, q: str | None, limit: int, today: date,
                 ids: list[int] | None = None, customer_id: int | None = None) -> tuple[int, list[dict]]:
    """Servers with their counters and customers. customer_id: only the servers of that customer's
    interventions (0 = servers in no intervention of any customer)."""
    where = _filters(q) + ([Server.id.in_(ids)] if ids is not None else [])
    if customer_id is not None:
        of_customer = (
            select(EventServer.server_id)
            .join(Event, Event.id == EventServer.event_id)
            .join(Project, Project.id == Event.project_id)
        )
        if customer_id:
            where.append(Server.id.in_(of_customer.where(Project.customer_id == customer_id)))
        else:
            where.append(Server.id.not_in(of_customer.where(Project.customer_id.is_not(None))))
    total = session.scalar(select(func.count()).select_from(Server).where(*where))
    servers = list(session.scalars(select(Server).where(*where).order_by(Server.hostname).limit(limit)))
    ids = [s.id for s in servers]

    # Interventi di questi server, in ordine di data: l'ultimo passato e il prossimo futuro.
    stats: dict[int, dict] = {i: {"event_count": 0, "last_event_date": None, "last_migration_status": None,
                                  "next_event_date": None, "customers": {}} for i in ids}
    if ids:
        rows = session.execute(
            select(EventServer.server_id, Event.event_date, EventServer.migration_status, Customer.id, Customer.name)
            .join(Event, Event.id == EventServer.event_id)
            .join(Project, Project.id == Event.project_id)
            .outerjoin(Customer, Customer.id == Project.customer_id)
            .where(EventServer.server_id.in_(ids))
            .order_by(Event.event_date)
        )
        for server_id, day, migration, cust_id, cust_name in rows:
            st = stats[server_id]
            if cust_id is not None:
                st["customers"][cust_id] = cust_name
            st["event_count"] += 1
            if day <= today:
                st["last_event_date"], st["last_migration_status"] = day, migration
            elif st["next_event_date"] is None:
                st["next_event_date"] = day
    for st in stats.values():
        st["customers"] = [{"id": i, "name": n} for i, n in sorted(st["customers"].items(), key=lambda x: x[1].lower())]
    return total, [{"server": s, **stats[s.id]} for s in servers]


def server_history(session: Session, server_id: int) -> list[tuple]:
    return [
        tuple(r)
        for r in session.execute(
            select(EventServer, Event, Project, User.display_name)
            .join(Event, Event.id == EventServer.event_id)
            .join(Project, Project.id == Event.project_id)
            .outerjoin(User, User.id == EventServer.assigned_user_id)
            .where(EventServer.server_id == server_id)
            .order_by(Event.event_date.desc(), Event.id.desc())
        )
    ]


def server_changes(session: Session, server_id: int, limit: int = 200) -> list[AuditLog]:
    return list(
        session.scalars(
            select(AuditLog)
            .where(AuditLog.table_name == "servers", AuditLog.record_id == server_id)
            .order_by(AuditLog.id.desc())
            .limit(limit)
        )
    )
