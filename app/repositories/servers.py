"""Scritture sulla tabella server di un intervento (righe event_servers e server collegati)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.i18n import tr
from app.models import Event, EventServer, EventUser, Project, Server, User, statuses
from app.schemas.edit import ROW_FIELDS, SERVER_FIELDS, ProjectCreate, ServerRowCreate


class ValidationProblem(Exception):
    """Dato non accettabile (→ HTTP 422)."""


class Conflict(Exception):
    """Il dato è cambiato o è in conflitto con altri (→ HTTP 409)."""


class Forbidden(Exception):
    """Operazione non permessa al ruolo dell'utente (→ HTTP 403)."""


def get_row(session: Session, row_id: int) -> EventServer | None:
    stmt = (
        select(EventServer)
        .where(EventServer.id == row_id)
        .options(selectinload(EventServer.server), selectinload(EventServer.assigned_user))
    )
    return session.scalars(stmt).one_or_none()


def find_server_by_hostname(session: Session, hostname: str) -> Server | None:
    return session.scalars(select(Server).where(func.lower(Server.hostname) == hostname.lower())).first()


def _check_user(session: Session, user_id: int | None) -> User | None:
    if user_id is None:
        return None
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise ValidationProblem(tr("users.invalid_technician"))
    return user


def _apply(obj: Any, values: dict[str, Any]) -> dict[str, tuple[Any, Any]]:
    """Assegna i valori e restituisce solo quelli effettivamente cambiati: {campo: (vecchio, nuovo)}."""
    changes = {}
    for field, new in values.items():
        old = getattr(obj, field)
        if old != new:
            setattr(obj, field, new)
            changes[field] = (old, new)
    return changes


def update_row(session: Session, row: EventServer, values: dict[str, Any]) -> None:
    """Applica una modifica parziale. Le versioni sono già state verificate dal chiamante."""
    server_values = {k: v for k, v in values.items() if k in SERVER_FIELDS}
    row_values = {k: v for k, v in values.items() if k in ROW_FIELDS}

    if "operating_system" in server_values:
        from app.repositories.oslist import check_server_os

        check_server_os(session, server_values["operating_system"], current=row.server.operating_system)
    if "hostname" in server_values:
        if server_values["hostname"] is None:
            raise ValidationProblem(tr("servers.hostname_required"))
        other = find_server_by_hostname(session, server_values["hostname"])
        if other is not None and other.id != row.server_id:
            raise ValidationProblem(tr("servers.hostname_taken"))
    if "check_status" in row_values and row_values["check_status"] is None:
        raise ValidationProblem(tr("servers.check_status_required"))
    if "migration_status" in row_values and row_values["migration_status"] is None:
        raise ValidationProblem(tr("servers.migration_status_required"))
    if "target_operating_system" in row_values:
        from app.repositories.oslist import check_server_os

        check_server_os(session, row_values["target_operating_system"], current=row.target_operating_system)
    if "assigned_user_id" in row_values:
        row.assigned_user = _check_user(session, row_values["assigned_user_id"])

    server_changes = _apply(row.server, server_values)
    row_changes = _apply(row, row_values)
    session.flush()  # qui SQLAlchemy verifica `version`: StaleDataError se qualcuno ha salvato prima

    if server_changes:
        audit.record(session, "update", "servers", row.server.id, server_changes, event_id=row.event_id)
    if row_changes:
        audit.record(session, "update", "event_servers", row.id, row_changes, event_id=row.event_id)


def known_locations(session: Session) -> list[str]:
    """Locations already used by servers, without duplicates (case-insensitive), alphabetical."""
    seen: dict[str, str] = {}
    for (loc,) in session.execute(select(Server.location).where(Server.location.is_not(None)).distinct()):
        seen.setdefault(loc.strip().lower(), loc.strip())
    return sorted(seen.values(), key=str.lower)


def add_row(session: Session, event: Event, data: ServerRowCreate) -> tuple[EventServer, bool]:
    """Aggiunge un server all'intervento. Restituisce (riga, server_già_esistente)."""
    server = find_server_by_hostname(session, data.hostname)
    reused = server is not None
    from app.repositories.oslist import check_server_os

    check_server_os(session, data.target_operating_system)
    if server is None:
        check_server_os(session, data.operating_system)
        server = Server(**{f: getattr(data, f) for f in SERVER_FIELDS})
        session.add(server)
        session.flush()
        audit.record(session, "create", "servers", server.id, event_id=event.id)
    elif any(link.event_id == event.id for link in server.event_links):
        raise Conflict(tr("servers.already_in_event", hostname=server.hostname))

    position = session.scalar(
        select(func.coalesce(func.max(EventServer.position), -1)).where(EventServer.event_id == event.id)
    ) + 1
    row = EventServer(
        event=event,
        server=server,
        position=position,
        target_kernel=data.target_kernel,
        target_operating_system=data.target_operating_system,
        check_status=data.check_status,
        migration_status=data.migration_status,
        planned_date=data.planned_date or event.event_date,
        executed_date=data.executed_date,
        assigned_user=_check_user(session, data.assigned_user_id),
        notes=data.notes,
    )
    session.add(row)
    session.flush()
    audit.record(session, "create", "event_servers", row.id, {"server": (None, server.hostname)}, event_id=event.id)
    return row, reused


def delete_row(session: Session, row: EventServer) -> None:
    """Toglie il server dall'intervento. Il server resta in anagrafica (può essere in altri interventi)."""
    hostname = row.server.hostname
    row_id, event_id = row.id, row.event_id
    session.delete(row)
    session.flush()
    audit.record(session, "delete", "event_servers", row_id, {"server": (hostname, None)}, event_id=event_id)


def update_event(session: Session, event: Event, values: dict[str, Any]) -> None:
    """Modifica un intervento (versione già verificata dal chiamante).

    Se cambia la data, le righe server con la data prevista uguale alla vecchia data la seguono.
    """
    for field in ("status", "event_date", "event_type"):
        if field in values and values[field] is None:
            raise ValidationProblem(tr(f"events.{field}_required"))
    start = values.get("start_time", event.start_time)
    end = values.get("end_time", event.end_time)
    if start and end and end <= start:
        raise ValidationProblem(tr("events.end_before_start"))
    old_date = event.event_date
    changes = _apply(event, values)
    if "event_date" in changes:
        for link in event.server_links:
            if link.planned_date == old_date:
                link.planned_date = event.event_date
    session.flush()
    if changes:
        audit.record(session, "update", "events", event.id, changes, event_id=event.id)


def add_event(session: Session, project: Project, data) -> Event:
    """Nuovo intervento in un progetto esistente (data: EventCreate)."""
    if data.start_time and data.end_time and data.end_time <= data.start_time:
        raise ValidationProblem(tr("events.end_before_start"))
    event = Event(
        project=project, event_date=data.event_date, title=data.title, event_type=data.event_type,
        status=data.status, start_time=data.start_time, end_time=data.end_time, notes=data.notes,
    )
    session.add(event)
    if data.participant_ids:
        from app.repositories.users import add_participants_to_new_event

        add_participants_to_new_event(session, event, data.participant_ids)
    session.flush()
    audit.record(session, "create", "events", event.id, {"event_date": (None, event.event_date)}, event_id=event.id)
    return event


def duplicate_event(session: Session, source: Event, data) -> Event:
    """Copia un intervento in un'altra data dello stesso progetto (data: EventDuplicate).

    Si copiano titolo, tipo, orario, note e partecipanti attivi; con `include_servers` anche
    la tabella server: stessi server, target, tecnico e note di riga, ma con gli stati azzerati
    (check «da fare», migrazione «pianificata», senza data di esecuzione). Il nuovo intervento
    è «pianificato».
    """
    start, end = (source.start_time, source.end_time) if data.keep_times else (data.start_time, data.end_time)
    if start and end and end <= start:
        raise ValidationProblem(tr("events.end_before_start"))
    event = Event(
        project=source.project, event_date=data.event_date, title=source.title, event_type=source.event_type,
        status=statuses.EVENT_STATUSES[0], start_time=start, end_time=end, notes=source.notes,
    )
    session.add(event)
    for p in source.participants:
        if p.user.is_active:
            event.participants.append(EventUser(user=p.user))
    session.flush()
    copied = 0
    if data.include_servers:
        for link in sorted(source.server_links, key=lambda link: link.position):
            session.add(EventServer(
                event=event,
                server=link.server,
                position=link.position,
                target_kernel=link.target_kernel,
                target_operating_system=link.target_operating_system,
                check_status=statuses.CHECK_STATUSES[0],
                migration_status=statuses.MIGRATION_STATUSES[0],
                planned_date=event.event_date,
                executed_date=None,
                assigned_user=link.assigned_user if link.assigned_user and link.assigned_user.is_active else None,
                notes=link.notes,
            ))
            copied += 1
        session.flush()
    audit.record(
        session, "create", "events", event.id,
        {"event_date": (None, event.event_date), "copiato_da": (None, source.id), "server": (None, copied)},
        event_id=event.id,
    )
    return event


def _audit_event_deletion(session: Session, event: Event) -> None:
    """Cronologia: l'intervento eliminato e i server che conteneva (i server restano in anagrafica)."""
    hosts = sorted(link.server.hostname for link in event.server_links)
    changes = {"event_date": (event.event_date, None)}
    if hosts:
        changes["server"] = (", ".join(hosts), None)
    audit.record(session, "delete", "events", event.id, changes, event_id=event.id)


def delete_event(session: Session, event: Event, *, allow_with_servers: bool) -> None:
    """Elimina un intervento con le sue righe server e i partecipanti (i server restano in anagrafica).

    `allow_with_servers`: se False, un intervento che contiene server non si elimina
    (i tecnici possono eliminare solo interventi vuoti).
    """
    if event.server_links and not allow_with_servers:
        raise Forbidden(
            tr("events.delete_forbidden")
        )
    _audit_event_deletion(session, event)
    session.delete(event)  # a cascata: righe server e partecipanti
    session.flush()


def delete_project(session: Session, project: Project) -> dict[str, int]:
    """Elimina il progetto con tutti i suoi interventi. Cliente e server restano."""
    summary = {"interventi": len(project.events), "righe_server": sum(len(e.server_links) for e in project.events)}
    for event in project.events:
        _audit_event_deletion(session, event)
    audit.record(session, "delete", "projects", project.id, {"name": (project.name, None)})
    session.delete(project)  # a cascata: interventi, righe server, partecipanti
    session.flush()
    return summary


def update_project(session: Session, project: Project, values: dict[str, Any]) -> None:
    for field in ("name", "status"):
        if field in values and values[field] is None:
            raise ValidationProblem(tr("projects.name_status_required"))
    if "customer_id" in values:
        from app.repositories.customers import check_customer

        check_customer(session, values["customer_id"])
    if "name" in values:
        other = session.scalar(
            select(Project.id).where(func.lower(Project.name) == values["name"].lower(), Project.id != project.id)
        )
        if other is not None:
            raise Conflict(tr("projects.name_taken"))
    changes = _apply(project, values)
    session.flush()
    if changes:
        audit.record(session, "update", "projects", project.id, changes)


def create_project(session: Session, data: ProjectCreate) -> Project:
    """Crea un progetto ed eventualmente il suo primo intervento."""
    exists = session.scalar(select(Project.id).where(func.lower(Project.name) == data.name.lower()))
    if exists is not None:
        raise Conflict(tr("projects.name_taken"))
    from app.repositories.customers import check_customer

    check_customer(session, data.customer_id)
    project = Project(name=data.name, description=data.description, status=data.status, customer_id=data.customer_id)
    session.add(project)
    session.flush()
    audit.record(session, "create", "projects", project.id, {"name": (None, project.name)})

    if data.first_event is not None:
        fe = data.first_event
        event = Event(
            project=project,
            event_date=fe.event_date,
            title=fe.title,
            event_type=fe.event_type,
            status=fe.status,
            start_time=fe.start_time,
            end_time=fe.end_time,
            notes=fe.notes,
        )
        session.add(event)
        if fe.participant_ids:
            from app.repositories.users import add_participants_to_new_event

            add_participants_to_new_event(session, event, fe.participant_ids)
        session.flush()
        audit.record(session, "create", "events", event.id, {"event_date": (None, event.event_date)}, event_id=event.id)
    return project
