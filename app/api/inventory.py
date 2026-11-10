"""Anagrafica server: ricerca e storico degli interventi."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.models import Server
from app.repositories import inventory as repo
from app.schemas.inventory import ServerChange, ServerDetail, ServerHistoryItem, ServerList, ServerSummary

router = APIRouter(tags=["anagrafica server"])
SessionDep = Annotated[Session, Depends(get_session)]


def _summary(item: dict) -> ServerSummary:
    s = item["server"]
    return ServerSummary(
        id=s.id, version=s.version, hostname=s.hostname, ip_address=s.ip_address,
        operating_system=s.operating_system, environment=s.environment, current_kernel=s.current_kernel,
        notes=s.notes, event_count=item["event_count"], last_event_date=item["last_event_date"],
        last_migration_status=item["last_migration_status"], next_event_date=item["next_event_date"],
    )


@router.get("/servers", response_model=ServerList)
def list_servers(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100, description="Hostname, IP, SO, ambiente, kernel o note")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> ServerList:
    """Tutti i server in anagrafica (anche quelli non più in nessun intervento), in ordine di hostname."""
    total, items = repo.list_servers(session, (q or "").strip() or None, limit, date.today())
    return ServerList(total=total, servers=[_summary(i) for i in items])


@router.get("/servers/{server_id}", response_model=ServerDetail)
def server_detail(session: SessionDep, server_id: int) -> ServerDetail:
    """Dati del server, storico degli interventi (dal più recente) e modifiche ai suoi dati."""
    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(404, "Server non trovato.")
    history = repo.server_history(session, server_id)
    today = date.today()
    past = [e.event_date for _, e, _, _ in history if e.event_date <= today]
    future = [e.event_date for _, e, _, _ in history if e.event_date > today]
    last = next(((row, e) for row, e, _, _ in history if e.event_date <= today), None)
    summary = ServerSummary(
        id=server.id, version=server.version, hostname=server.hostname, ip_address=server.ip_address,
        operating_system=server.operating_system, environment=server.environment,
        current_kernel=server.current_kernel, notes=server.notes, event_count=len(history),
        last_event_date=max(past) if past else None,
        last_migration_status=last[0].migration_status if last else None,
        next_event_date=min(future) if future else None,
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
