"""Gestione dei tecnici e dei partecipanti degli interventi."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_session
import json

from app.models import User, UserPreferences
from app.schemas.preferences import Preferences, PreferencesPatch
from app.repositories import calendar as calendar_repo
from app.repositories import users as repo
from app.repositories.servers import Conflict, ValidationProblem
from app.schemas.calendar import UserRef
from app.auth import AuthUser, require_admin, require_user
from app.schemas.edit import (
    ParticipantsUpdate, TechnicianQuickCreate, TemporaryPassword, UserCreate, UserOut, UserPatch,
)

router = APIRouter(tags=["tecnici"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/users", response_model=list[UserOut])
def list_users(
    session: SessionDep,
    all: Annotated[bool, Query(description="Includi i tecnici disattivati")] = False,
) -> list[UserOut]:
    """Tecnici in ordine alfabetico; di default solo quelli attivi."""
    return [UserOut.from_user(u) for u in repo.list_users(session, include_inactive=all)]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_user(session: SessionDep, data: UserCreate) -> UserOut:
    try:
        user = repo.create_user(session, data)
        session.commit()
    except Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    return UserOut.from_user(user)


@router.post("/users/technicians", response_model=UserOut)
def add_technician(session: SessionDep, data: TechnicianQuickCreate, response: Response) -> UserOut:
    """Tecnico al volo (tutti gli utenti): riusa quello con lo stesso nome, altrimenti lo crea (201).

    Crea solo un nome con ruolo «tecnico», senza email né accesso al portale: ruoli e accessi
    restano agli amministratori (pulsante Utenti).
    """
    try:
        user, created = repo.find_or_create_technician(session, data.display_name)
        session.commit()
    except Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return UserOut.from_user(user)


def _user_conflict(session: Session, user_id: int) -> HTTPException:
    session.rollback()
    current = session.get(User, user_id)
    return HTTPException(
        409,
        {
            "message": "Il tecnico è stato modificato da un altro utente. Ecco i valori aggiornati.",
            "current": UserOut.from_user(current).model_dump(mode="json") if current else None,
        },
    )


@router.patch("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
def update_user(session: SessionDep, user_id: int, patch: UserPatch) -> UserOut:
    """Modifica nome, email, ruolo o stato attivo. Non si cancella: si disattiva."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Tecnico non trovato.")
    if patch.version != user.version:
        raise _user_conflict(session, user_id)
    try:
        repo.update_user(session, user, {f: getattr(patch, f) for f in patch.changed_fields()})
        session.commit()
    except StaleDataError:
        raise _user_conflict(session, user_id) from None
    except Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    except ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return UserOut.from_user(user)


@router.post(
    "/users/{user_id}/temporary-password",
    response_model=TemporaryPassword,
    dependencies=[Depends(require_admin)],
)
def temporary_password(session: SessionDep, user_id: int) -> TemporaryPassword:
    """Genera una password temporanea (da cambiare al primo accesso) e chiude le sessioni dell'utente.

    La password è mostrata solo in questa risposta: nel database resta solo il suo hash.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utente non trovato.")
    try:
        password = repo.set_temporary_password(session, user)
        session.commit()
    except ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return TemporaryPassword(password=password)


@router.put("/events/{event_id}/participants", response_model=list[UserRef])
def set_participants(session: SessionDep, event_id: int, data: ParticipantsUpdate) -> list[UserRef]:
    """Sostituisce l'elenco dei partecipanti di un intervento."""
    event = calendar_repo.get_event_detail(session, event_id)
    if event is None:
        raise HTTPException(404, "Intervento non trovato.")
    try:
        users = repo.set_participants(session, event, data.user_ids)
        session.commit()
    except ValidationProblem as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from None
    return [UserRef(id=u.id, display_name=u.display_name) for u in users]




# --- preferenze personali ----------------------------------------------------------------


def _load_prefs(session: Session, user_id: int) -> tuple[UserPreferences | None, Preferences]:
    row = session.get(UserPreferences, user_id)
    try:
        data = json.loads(row.data) if row else {}
    except ValueError:
        data = {}
    return row, Preferences.model_validate(data if isinstance(data, dict) else {})


def _require_real_user(user: AuthUser) -> int:
    if user.id is None:
        raise HTTPException(400, "Preferenze disponibili solo per utenti reali.")
    return user.id


@router.get("/me/preferences", response_model=Preferences)
def get_preferences(session: SessionDep, user: Annotated[AuthUser, Depends(require_user)]) -> Preferences:
    """Preferenze dell'utente corrente (valori di default per quelle mai impostate)."""
    return _load_prefs(session, _require_real_user(user))[1]


@router.patch("/me/preferences", response_model=Preferences)
def update_preferences(
    session: SessionDep, patch: PreferencesPatch, user: Annotated[AuthUser, Depends(require_user)]
) -> Preferences:
    user_id = _require_real_user(user)
    row, prefs = _load_prefs(session, user_id)
    merged = prefs.model_copy(update=patch.model_dump(exclude_unset=True, exclude_none=True))
    payload = merged.model_dump_json()
    if row is None:
        session.add(UserPreferences(user_id=user_id, data=payload))
    else:
        row.data = payload
    session.commit()
    return merged
