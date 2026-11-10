"""API di modifica della tabella server di un intervento.

Controllo di concorrenza: ogni modifica porta la `version` letta dal client.
Se nel frattempo un altro utente ha salvato, la risposta è 409 con i valori attuali
in `detail.current`, così l'interfaccia può mostrarli senza sovrascriverli.

Il commit è esplicito prima della risposta: un errore di salvataggio non deve mai
arrivare al client come successo.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_session
from app.auth import AuthUser, require_user
from app.models import Event, statuses
from app.repositories import servers as repo
from app.repositories import calendar as calendar_repo
from app.models import Project
from app.schemas.calendar import EventDetail, ProjectSummary, ServerRow, project_summary
from app.schemas.edit import (
    SERVER_FIELDS,
    EventCreate,
    EventPatch,
    ProjectCreate,
    ProjectPatch,
    Options,
    ServerRowCreate,
    ServerRowCreated,
    ServerRowPatch,
)

router = APIRouter(tags=["tabella server"])
SessionDep = Annotated[Session, Depends(get_session)]

CONFLICT_MSG = "Questa riga è stata modificata da un altro utente. Ecco i valori aggiornati."


def _conflict(session: Session, row_id: int, message: str = CONFLICT_MSG) -> HTTPException:
    session.rollback()
    current = repo.get_row(session, row_id)
    return HTTPException(
        status.HTTP_409_CONFLICT,
        {"message": message, "current": ServerRow.from_link(current).model_dump(mode="json") if current else None},
    )


def _load_row(session: Session, row_id: int):
    row = repo.get_row(session, row_id)
    if row is None:
        raise HTTPException(404, "Riga non trovata: potrebbe essere stata rimossa da un altro utente.")
    return row


@router.patch("/event-servers/{row_id}", response_model=ServerRow)
def update_row(session: SessionDep, row_id: int, patch: ServerRowPatch) -> ServerRow:
    """Modifica uno o più campi di una riga (campi della riga e/o del server collegato)."""
    row = _load_row(session, row_id)
    fields = patch.changed_fields()
    touches_server = bool(fields & set(SERVER_FIELDS))

    if touches_server and patch.server_version is None:
        raise HTTPException(422, "server_version è obbligatorio per modificare i campi del server.")
    if patch.version != row.version or (touches_server and patch.server_version != row.server.version):
        raise _conflict(session, row_id)

    try:
        repo.update_row(session, row, {f: getattr(patch, f) for f in fields})
        session.commit()
    except StaleDataError:
        raise _conflict(session, row_id) from None
    except repo.ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None

    session.refresh(row)
    return ServerRow.from_link(row)


@router.post(
    "/events/{event_id}/servers",
    response_model=ServerRowCreated,
    status_code=status.HTTP_201_CREATED,
)
def add_row(session: SessionDep, event_id: int, data: ServerRowCreate) -> ServerRowCreated:
    """Aggiunge un server all'intervento (riusa il server se l'hostname esiste già)."""
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Intervento non trovato.")
    try:
        row, reused = repo.add_row(session, event, data)
        session.commit()
    except repo.Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    except repo.ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None
    row = repo.get_row(session, row.id)
    return ServerRowCreated(**ServerRow.from_link(row).model_dump(), server_reused=reused)


@router.delete("/event-servers/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_row(
    session: SessionDep,
    row_id: int,
    version: Annotated[int, Query(description="Versione della riga letta dal client")],
) -> Response:
    """Toglie il server dall'intervento (il server resta in anagrafica)."""
    row = _load_row(session, row_id)
    if version != row.version:
        raise _conflict(session, row_id, "La riga è stata modificata da un altro utente: controlla prima di eliminarla.")
    try:
        repo.delete_row(session, row)
        session.commit()
    except StaleDataError:
        raise _conflict(session, row_id) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/options", response_model=Options)
def options() -> Options:
    """Valori ammessi per le colonne a scelta della tabella."""
    return Options(
        check_statuses=list(statuses.CHECK_STATUSES),
        migration_statuses=list(statuses.MIGRATION_STATUSES),
        environments=list(statuses.ENVIRONMENTS),
        event_statuses=list(statuses.EVENT_STATUSES),
    )


def _event_conflict(session: Session, event_id: int) -> HTTPException:
    session.rollback()
    current = calendar_repo.get_event_detail(session, event_id)
    return HTTPException(
        status.HTTP_409_CONFLICT,
        {
            "message": "L'intervento è stato modificato da un altro utente. Ecco i valori aggiornati.",
            "current": EventDetail.from_event(current).model_dump(mode="json") if current else None,
        },
    )


@router.patch("/events/{event_id}", response_model=EventDetail)
def update_event(session: SessionDep, event_id: int, patch: EventPatch) -> EventDetail:
    """Modifica stato e/o note di un intervento, con controllo della versione."""
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Intervento non trovato.")
    if patch.version != event.version:
        raise _event_conflict(session, event_id)
    try:
        repo.update_event(session, event, {f: getattr(patch, f) for f in patch.changed_fields()})
        session.commit()
    except StaleDataError:
        raise _event_conflict(session, event_id) from None
    except repo.ValidationProblem as exc:
        raise HTTPException(422, str(exc)) from None
    return EventDetail.from_event(calendar_repo.get_event_detail(session, event_id))


@router.post("/projects", response_model=ProjectSummary, status_code=status.HTTP_201_CREATED)
def create_project(session: SessionDep, data: ProjectCreate) -> ProjectSummary:
    """Crea un progetto, con il primo intervento facoltativo. 409 se il nome esiste già."""
    try:
        project = repo.create_project(session, data)
        session.commit()
    except repo.Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    except repo.ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return project_summary(calendar_repo.load_project(session, project.id))


def _project_conflict(session: Session, project_id: int) -> HTTPException:
    session.rollback()
    current = calendar_repo.load_project(session, project_id)
    return HTTPException(
        status.HTTP_409_CONFLICT,
        {
            "message": "Il progetto è stato modificato da un altro utente. Ecco i valori aggiornati.",
            "current": project_summary(current).model_dump(mode="json") if current else None,
        },
    )


@router.patch("/projects/{project_id}", response_model=ProjectSummary)
def update_project(session: SessionDep, project_id: int, patch: ProjectPatch) -> ProjectSummary:
    """Modifica nome, descrizione e stato di un progetto, con controllo della versione."""
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Progetto non trovato.")
    if patch.version != project.version:
        raise _project_conflict(session, project_id)
    try:
        repo.update_project(session, project, {f: getattr(patch, f) for f in patch.changed_fields()})
        session.commit()
    except StaleDataError:
        raise _project_conflict(session, project_id) from None
    except repo.Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    except repo.ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return project_summary(calendar_repo.load_project(session, project_id))


@router.post("/projects/{project_id}/events", response_model=EventDetail, status_code=status.HTTP_201_CREATED)
def add_event(session: SessionDep, project_id: int, data: EventCreate) -> EventDetail:
    """Nuovo intervento in un progetto esistente."""
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Progetto non trovato.")
    try:
        event = repo.add_event(session, project, data)
        session.commit()
    except repo.ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return EventDetail.from_event(calendar_repo.get_event_detail(session, event.id))


# Ruoli che possono eliminare progetti e interventi che contengono server
CAN_DELETE_ALL = {"admin", "coordinatore"}


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    session: SessionDep,
    event_id: int,
    version: Annotated[int, Query(description="Versione dell'intervento letta dal client")],
    user: Annotated[AuthUser, Depends(require_user)],
) -> Response:
    """Elimina un intervento con le sue righe server (i server restano in anagrafica).

    Un intervento che contiene server può essere eliminato solo da coordinatori e amministratori.
    """
    event = calendar_repo.get_event_detail(session, event_id)
    if event is None:
        raise HTTPException(404, "Intervento non trovato.")
    if version != event.version:
        raise _event_conflict(session, event_id)
    try:
        repo.delete_event(session, event, allow_with_servers=user.role in CAN_DELETE_ALL)
        session.commit()
    except repo.Forbidden as exc:
        session.rollback()
        raise HTTPException(403, {"message": str(exc), "code": "forbidden"}) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    session: SessionDep,
    project_id: int,
    version: Annotated[int, Query(description="Versione del progetto letta dal client")],
    user: Annotated[AuthUser, Depends(require_user)],
) -> Response:
    """Elimina il progetto con tutti i suoi interventi (solo coordinatori e amministratori).

    Il cliente e i server restano; la cronologia registra cosa è stato eliminato e da chi.
    """
    if user.role not in CAN_DELETE_ALL:
        raise HTTPException(403, {"message": "Solo coordinatori e amministratori possono eliminare un progetto.",
                                  "code": "forbidden"})
    project = calendar_repo.load_project(session, project_id)
    if project is None:
        raise HTTPException(404, "Progetto non trovato.")
    if version != project.version:
        raise _project_conflict(session, project_id)
    for event in project.events:  # carica i server per la cronologia
        _ = [link.server.hostname for link in event.server_links]
    repo.delete_project(session, project)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
