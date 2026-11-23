"""Anagrafica server: ricerca e storico degli interventi."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_session
from app.i18n import tr
from app.models import Server
from app.repositories import inventory as repo
from app.repositories import servers as servers_repo
from app.schemas.edit import ServerPatch
from app.schemas.inventory import ServerChange, ServerDetail, ServerHistoryItem, ServerList, ServerSummary

router = APIRouter(tags=["anagrafica server"])
SessionDep = Annotated[Session, Depends(get_session)]


def _summary(item: dict) -> ServerSummary:
    s = item["server"]
    return ServerSummary(
        id=s.id, version=s.version, hostname=s.hostname, ip_address=s.ip_address,
        operating_system=s.operating_system, environment=s.environment, current_kernel=s.current_kernel,
        location=s.location, steamroller_inventory=s.steamroller_inventory, notes=s.notes, event_count=item["event_count"], last_event_date=item["last_event_date"],
        last_migration_status=item["last_migration_status"], next_event_date=item["next_event_date"],
        customers=item["customers"],
    )


@router.get("/servers", response_model=ServerList)
def list_servers(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100, description="Hostname, IP, SO, ambiente, kernel o note")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
    customer_id: Annotated[int | None, Query(ge=0, description="Only the servers of this customer (0 = of no customer)")] = None,
) -> ServerList:
    """Tutti i server in anagrafica (anche quelli non più in nessun intervento), in ordine di hostname."""
    total, items = repo.list_servers(session, (q or "").strip() or None, limit, date.today(), customer_id=customer_id)
    return ServerList(total=total, servers=[_summary(i) for i in items])


@router.get("/servers/{server_id}", response_model=ServerDetail)
def server_detail(session: SessionDep, server_id: int) -> ServerDetail:
    """Dati del server, storico degli interventi (dal più recente) e modifiche ai suoi dati."""
    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(404, tr("inventory.server_not_found"))
    history = repo.server_history(session, server_id)
    today = date.today()
    past = [e.event_date for _, e, _, _ in history if e.event_date <= today]
    future = [e.event_date for _, e, _, _ in history if e.event_date > today]
    last = next(((row, e) for row, e, _, _ in history if e.event_date <= today), None)
    summary = ServerSummary(
        id=server.id, version=server.version, hostname=server.hostname, ip_address=server.ip_address,
        operating_system=server.operating_system, environment=server.environment,
        current_kernel=server.current_kernel, location=server.location,
        steamroller_inventory=server.steamroller_inventory, notes=server.notes, event_count=len(history),
        last_event_date=max(past) if past else None,
        last_migration_status=last[0].migration_status if last else None,
        next_event_date=min(future) if future else None,
        customers=repo.list_servers(session, None, 1, today, ids=[server_id])[1][0]["customers"],
    )
    return ServerDetail(
        server=summary,
        history=[
            ServerHistoryItem(
                row_id=row.id, event_id=e.id, event_date=e.event_date, event_title=e.title,
                event_status=e.status, event_type=e.event_type, project_id=p.id, project_name=p.name,
                target_kernel=row.target_kernel, target_operating_system=row.target_operating_system,
                check_status=row.check_status,
                migration_status=row.migration_status, executed_date=row.executed_date,
                assigned_user=user_name, notes=row.notes,
            )
            for row, e, p, user_name in history
        ],
        changes=[
            ServerChange(at=a.at, field=a.field, old_value=a.old_value, new_value=a.new_value, action=a.action)
            for a in repo.server_changes(session, server_id)
        ],
    )


def _current(session: Session, server_id: int) -> dict | None:
    server = session.get(Server, server_id)
    if server is None:
        return None
    total, items = repo.list_servers(session, None, 1, date.today(), ids=[server_id])
    return _summary(items[0]).model_dump(mode="json") if items else None


def _server_conflict(session: Session, server_id: int, message: str) -> HTTPException:
    session.rollback()
    return HTTPException(status.HTTP_409_CONFLICT, {"message": message, "current": _current(session, server_id)})


def _load(session: Session, server_id: int) -> Server:
    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(404, tr("inventory.server_not_found"))
    return server


@router.patch("/servers/{server_id}", response_model=ServerSummary)
def update_server(session: SessionDep, server_id: int, patch: ServerPatch) -> ServerSummary:
    """Changes hostname, IP, OS, environment, location, SteamRoller inventory or kernel of a server.

    The change applies to every intervention the server is part of (past and future).
    """
    server = _load(session, server_id)
    if patch.version != server.version:
        raise _server_conflict(session, server_id, tr("inventory.server_conflict"))
    fields = patch.changed_fields()
    try:
        servers_repo.update_server(session, server, {f: getattr(patch, f) for f in fields})
        session.commit()
    except StaleDataError:
        raise _server_conflict(session, server_id, tr("inventory.server_conflict")) from None
    except servers_repo.ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return ServerSummary.model_validate(_current(session, server_id))


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(
    session: SessionDep,
    server_id: int,
    version: Annotated[int, Query(description="Version of the server read by the client")],
) -> Response:
    """Deletes a server from the inventory. Refused (409) if it is in any intervention, past or future."""
    server = _load(session, server_id)
    if version != server.version:
        raise _server_conflict(session, server_id, tr("inventory.server_conflict"))
    try:
        servers_repo.delete_server(session, server)
        session.commit()
    except servers_repo.Conflict as exc:
        raise _server_conflict(session, server_id, str(exc)) from None
    except StaleDataError:
        raise _server_conflict(session, server_id, tr("inventory.server_conflict")) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
