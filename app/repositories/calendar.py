"""Letture per la home: progetti con le date degli interventi ed eventi in un intervallo."""

from __future__ import annotations

from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import AuditLog, Customer, CustomerOrder, Event, EventServer, EventUser, Project, Server


def load_project(session: Session, project_id: int) -> Project | None:
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.events).selectinload(Event.server_links), selectinload(Project.customer))
    )
    return session.scalars(stmt).one_or_none()


def list_projects_with_events(session: Session) -> list[Project]:
    stmt = (
        select(Project)
        .options(selectinload(Project.events).selectinload(Event.server_links), selectinload(Project.customer))
        .order_by(Project.name)
    )
    return list(session.scalars(stmt))


def list_events_between(session: Session, start: date, end: date) -> list[dict]:
    """Eventi con data in [start, end], con nome progetto e indicatori per i filtri.

    Per ogni evento: numero di server, check KO, migrazioni fallite/completate,
    id dei partecipanti e dei tecnici assegnati alle righe.
    """
    es = EventServer
    counts = (
        select(
            es.event_id,
            func.count().label("n"),
            func.sum(case((es.check_status == "ko", 1), else_=0)).label("ko"),
            func.sum(case((es.migration_status == "fallita", 1), else_=0)).label("failed"),
            func.sum(case((es.migration_status == "completata", 1), else_=0)).label("done"),
            func.sum(case((es.executed_date.is_not(None), 1), else_=0)).label("executed"),
        )
        .group_by(es.event_id)
        .subquery()
    )
    stmt = (
        select(
            Event,
            Project.name,
            Project.customer_id,
            Customer.name,
            Customer.color,
            func.coalesce(counts.c.n, 0),
            func.coalesce(counts.c.ko, 0),
            func.coalesce(counts.c.failed, 0),
            func.coalesce(counts.c.done, 0),
            func.coalesce(counts.c.executed, 0),
            CustomerOrder.code,
        )
        .join(Project, Project.id == Event.project_id)
        .outerjoin(Customer, Customer.id == Project.customer_id)
        .outerjoin(CustomerOrder, CustomerOrder.id == Event.order_id)
        .outerjoin(counts, counts.c.event_id == Event.id)
        .where(Event.event_date.between(start, end))
        .order_by(Event.event_date, Event.start_time, Project.name)
    )
    rows = session.execute(stmt).all()
    ids = [r[0].id for r in rows]

    people: dict[int, set[int]] = {i: set() for i in ids}
    if ids:
        for event_id, user_id in session.execute(
            select(EventUser.event_id, EventUser.user_id).where(EventUser.event_id.in_(ids))
        ):
            people[event_id].add(user_id)
        for event_id, user_id in session.execute(
            select(es.event_id, es.assigned_user_id).where(
                es.event_id.in_(ids), es.assigned_user_id.is_not(None)
            )
        ):
            people[event_id].add(user_id)

    return [
        {
            "event": e,
            "project_name": name,
            "server_count": n,
            "check_ko": ko,
            "migration_failed": failed,
            "migrated": done,
            "executed": executed,
            "order_code": order_code,
            "user_ids": sorted(people[e.id]),
            "customer_id": customer_id,
            "customer_name": customer_name,
            "customer_color": customer_color,
        }
        for e, name, customer_id, customer_name, customer_color, n, ko, failed, done, executed, order_code in rows
    ]


def _detail_options():
    return (
        selectinload(Event.project).selectinload(Project.customer),
        selectinload(Event.order),
        selectinload(Event.participants).selectinload(EventUser.user),
        selectinload(Event.server_links).selectinload(EventServer.server),
        selectinload(Event.server_links).selectinload(EventServer.assigned_user),
    )


def get_event_detail(session: Session, event_id: int) -> Event | None:
    stmt = select(Event).where(Event.id == event_id).options(*_detail_options())
    return session.scalars(stmt).one_or_none()


def list_event_details_on(session: Session, day: date) -> list[Event]:
    stmt = (
        select(Event)
        .join(Project, Project.id == Event.project_id)
        .where(Event.event_date == day)
        .options(*_detail_options())
        .order_by(Event.start_time, Project.name)
    )
    return list(session.scalars(stmt))


def _like(q: str) -> str:
    escaped = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search(session: Session, q: str, limit: int = 50) -> tuple[list[Project], list[tuple]]:
    """Progetti per nome/descrizione e righe server per hostname, IP o sistema operativo."""
    pattern = _like(q)
    projects = list(
        session.scalars(
            select(Project)
            .where(
                func.lower(Project.name).like(pattern, escape="\\")
                | func.lower(func.coalesce(Project.description, "")).like(pattern, escape="\\")
            )
            .order_by(Project.name)
            .limit(limit)
        )
    )
    rows = session.execute(
        select(EventServer, Server, Event, Project)
        .join(Server, Server.id == EventServer.server_id)
        .join(Event, Event.id == EventServer.event_id)
        .join(Project, Project.id == Event.project_id)
        .where(
            func.lower(Server.hostname).like(pattern, escape="\\")
            | func.lower(func.coalesce(Server.ip_address, "")).like(pattern, escape="\\")
            | func.lower(func.coalesce(Server.operating_system, "")).like(pattern, escape="\\")
        )
        .order_by(Server.hostname, Event.event_date)
        .limit(limit)
    ).all()
    return projects, [tuple(r) for r in rows]


def last_change_id(session: Session) -> int:
    return session.scalar(select(func.coalesce(func.max(AuditLog.id), 0)))


def changes_since(session: Session, since: int) -> tuple[int, list[Event], bool, bool, list[date]]:
    """Ultimo id della cronologia e interventi toccati dalle modifiche successive a `since`.

    Una modifica a un server riguarda tutti gli interventi in cui compare.
    """
    last = last_change_id(session)
    if since >= last:
        return last, [], False, False, []
    entries = session.execute(
        select(AuditLog.table_name, AuditLog.record_id, AuditLog.event_id).where(AuditLog.id > since)
    ).all()
    event_ids = {e for _, _, e in entries if e is not None}
    server_ids = {r for t, r, _ in entries if t == "servers"}
    if server_ids:
        event_ids |= set(
            session.scalars(select(EventServer.event_id).where(EventServer.server_id.in_(server_ids)))
        )
    events = list(session.scalars(select(Event).where(Event.id.in_(event_ids)))) if event_ids else []
    # Un nuovo intervento o progetto cambia anche l'elenco dei progetti nella sidebar.
    kinds = session.execute(
        select(AuditLog.table_name, AuditLog.action, AuditLog.field, AuditLog.old_value).where(AuditLog.id > since)
    ).all()
    # Interventi creati, eliminati o spostati cambiano anche la sidebar (date dei progetti).
    projects_changed = any(
        t in ("projects", "customers") or (t == "events" and (a in ("create", "delete") or f == "event_date"))
        for t, a, f, _ in kinds
    )
    users_changed = any(t == "users" for t, *_ in kinds)
    # Vecchie date di interventi spostati o eliminati: anche quei mesi vanno ridisegnati.
    old_dates = sorted({
        date.fromisoformat(old) for t, _, f, old in kinds if t == "events" and f == "event_date" and old
    })
    return last, events, projects_changed, users_changed, old_dates
