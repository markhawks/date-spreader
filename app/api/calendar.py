from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.i18n import tr
from app.repositories import calendar as repo
from app.repositories import conflicts as conflicts_repo
from app.schemas.calendar import (
    ChangedEvent,
    Conflict,
    Changes,
    EventDetail,
    EventSummary,
    ProjectRef,
    ProjectSummary,
    SearchResult,
    SearchServerHit,
    project_summary,
)

router = APIRouter(tags=["calendario"])


def event_detail(session: Session, event) -> EventDetail:
    """EventDetail with its scheduling conflicts."""
    detail = EventDetail.from_event(event)
    detail.conflicts = [Conflict.model_validate(c) for c in conflicts_repo.describe(session, event)]
    return detail

MAX_RANGE_DAYS = 400

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/projects", response_model=list[ProjectSummary])
def list_projects(session: SessionDep) -> list[ProjectSummary]:
    """Tutti i progetti, ognuno con le date dei propri interventi (in ordine)."""
    return [project_summary(p) for p in repo.list_projects_with_events(session)]


@router.get("/events", response_model=list[EventSummary])
def list_events(
    session: SessionDep,
    start: Annotated[date, Query(description="Prima data inclusa (YYYY-MM-DD)")],
    end: Annotated[date, Query(description="Ultima data inclusa (YYYY-MM-DD)")],
) -> list[EventSummary]:
    """Interventi con data compresa tra `start` ed `end` (inclusi)."""
    if end < start:
        raise HTTPException(422, tr("calendar.end_before_start"))
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(422, tr("calendar.max_range", days=MAX_RANGE_DAYS))
    rows = repo.list_events_between(session, start, end)
    found = conflicts_repo.conflicts_on(session, {r["event"].event_date for r in rows})
    return [
        EventSummary(
            id=r["event"].id,
            project_id=r["event"].project_id,
            project_name=r["project_name"],
            title=r["event"].title,
            event_date=r["event"].event_date,
            start_time=r["event"].start_time,
            end_time=r["event"].end_time,
            event_type=r["event"].event_type,
            status=r["event"].status,
            server_count=r["server_count"],
            check_ko=r["check_ko"],
            migration_failed=r["migration_failed"],
            migrated=r["migrated"],
            executed=r["executed"],
            user_ids=r["user_ids"],
            customer_id=r["customer_id"],
            customer_name=r["customer_name"],
            customer_color=r["customer_color"],
            order_code=r["order_code"],
            conflict_users=sorted(found[r["event"].id].users) if r["event"].id in found else [],
            conflict_servers=len(found[r["event"].id].servers) if r["event"].id in found else 0,
        )
        for r in rows
    ]


@router.get("/events/{event_id}", response_model=EventDetail)
def get_event(session: SessionDep, event_id: int) -> EventDetail:
    """Dettaglio di un intervento con partecipanti e tabella server."""
    event = repo.get_event_detail(session, event_id)
    if event is None:
        raise HTTPException(404, tr("events.not_found"))
    return event_detail(session, event)


@router.get("/days/{day}", response_model=list[EventDetail])
def get_day(session: SessionDep, day: date) -> list[EventDetail]:
    """Tutti gli interventi di un giorno, con dettaglio (lista vuota se non ce ne sono)."""
    return [event_detail(session, e) for e in repo.list_event_details_on(session, day)]


@router.get("/search", response_model=SearchResult)
def search(
    session: SessionDep,
    q: Annotated[str, Query(min_length=2, max_length=100, description="Testo da cercare (almeno 2 caratteri)")],
) -> SearchResult:
    """Cerca progetti (nome, descrizione) e server (hostname, IP, sistema operativo) negli interventi."""
    projects, rows = repo.search(session, q.strip())
    return SearchResult(
        projects=[ProjectRef(id=p.id, name=p.name) for p in projects],
        servers=[
            SearchServerHit(
                row_id=link.id,
                event_id=event.id,
                event_date=event.event_date,
                project_id=project.id,
                project_name=project.name,
                hostname=server.hostname,
                ip_address=server.ip_address,
                operating_system=server.operating_system,
                check_status=link.check_status,
                migration_status=link.migration_status,
            )
            for link, server, event, project in rows
        ],
    )


@router.get("/changes", response_model=Changes)
def changes(
    session: SessionDep,
    since: Annotated[int | None, Query(ge=0, description="Ultimo id di modifica già visto dal client")] = None,
) -> Changes:
    """Feed delle modifiche: i client lo interrogano periodicamente per aggiornare la vista.

    Senza `since` restituisce solo `last_id` (punto di partenza), senza elenco.
    """
    if since is None:
        return Changes(last_id=repo.last_change_id(session), events=[])
    last, events, projects_changed, users_changed, old_dates = repo.changes_since(session, since)
    return Changes(
        last_id=last,
        events=[ChangedEvent(id=e.id, event_date=e.event_date) for e in events],
        projects_changed=projects_changed,
        users_changed=users_changed,
        dates=old_dates,
    )
