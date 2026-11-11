"""Tecnici (tabella users) e partecipanti degli interventi."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import audit
from app.models import AuthSession, Event, EventUser, User
from app.security import hash_password, temporary_password
from app.repositories.servers import Conflict, ValidationProblem
from app.schemas.edit import UserCreate


def list_users(session: Session, include_inactive: bool = False) -> list[User]:
    stmt = select(User).order_by(User.display_name)
    if not include_inactive:
        stmt = stmt.where(User.is_active)
    return list(session.scalars(stmt))


def _check_unique(
    session: Session, name: str | None, email: str | None, exclude_id: int | None = None, username: str | None = None
) -> None:
    if username is not None:
        q = select(User.id).where(func.lower(User.username) == username.lower())
        if exclude_id:
            q = q.where(User.id != exclude_id)
        if session.scalar(q) is not None:
            raise Conflict("Questo nome utente è già usato.")
    if name is not None:
        q = select(User.id).where(func.lower(User.display_name) == name.lower())
        if exclude_id:
            q = q.where(User.id != exclude_id)
        if session.scalar(q) is not None:
            raise Conflict("Esiste già un tecnico con questo nome.")
    if email is not None:
        q = select(User.id).where(func.lower(User.external_id) == email.lower())
        if exclude_id:
            q = q.where(User.id != exclude_id)
        if session.scalar(q) is not None:
            raise Conflict("Questa email è già usata da un altro tecnico.")


def create_user(session: Session, data: UserCreate) -> User:
    _check_unique(session, data.display_name, data.email, username=data.username)
    # external_id è l'identità aziendale (email); senza email un identificativo locale.
    user = User(
        external_id=data.email or f"local:{uuid.uuid4().hex[:12]}",
        display_name=data.display_name,
        username=data.username,
        role=data.role,
        is_active=True,
    )
    session.add(user)
    session.flush()
    audit.record(session, "create", "users", user.id, {"display_name": (None, user.display_name)})
    return user


def find_or_create_technician(session: Session, name: str) -> tuple[User, bool]:
    """Tecnico con questo nome (maiuscole ignorate), creato se manca. Restituisce (tecnico, creato)."""
    existing = session.scalar(select(User).where(func.lower(User.display_name) == name.lower()))
    if existing is not None:
        if not existing.is_active:
            raise Conflict(f"«{existing.display_name}» esiste ma è disattivato: un amministratore può riattivarlo da Utenti.")
        return existing, False
    return create_user(session, UserCreate(display_name=name, role="tecnico")), True


def update_user(session: Session, user: User, values: dict[str, Any]) -> None:
    if "display_name" in values and values["display_name"] is None:
        raise ValidationProblem("Il nome è obbligatorio.")
    if "role" in values and values["role"] is None:
        raise ValidationProblem("Il ruolo è obbligatorio.")
    if "is_active" in values and values["is_active"] is None:
        raise ValidationProblem("Indica se il tecnico è attivo.")
    _check_unique(session, values.get("display_name"), values.get("email"), exclude_id=user.id,
                  username=values.get("username"))
    _protect_last_admin(session, user, values)

    changes = {}
    if "email" in values:
        new_ext = values["email"] or (user.external_id if user.external_id.startswith("local:") else f"local:{uuid.uuid4().hex[:12]}")
        if new_ext != user.external_id:
            changes["email"] = (user.external_id, new_ext)
            user.external_id = new_ext
    for field in ("display_name", "username", "role", "is_active"):
        if field not in values:
            continue
        if getattr(user, field) != values[field]:
            changes[field] = (getattr(user, field), values[field])
            setattr(user, field, values[field])
    if "is_active" in changes and not user.is_active:
        revoke_sessions(session, user.id)  # disattivato: esce subito da tutte le sessioni
    # (il ruolo invece viene riletto a ogni richiesta: nessun bisogno di chiudere le sessioni)
    session.flush()
    if changes:
        audit.record(session, "update", "users", user.id, changes)


def _is_working_admin(u: User) -> bool:
    return u.role == "admin" and u.is_active and bool(u.password_hash)


def _protect_last_admin(session: Session, user: User, values: dict[str, Any]) -> None:
    """Impedisce di restare senza amministratori in grado di accedere."""
    if not _is_working_admin(user):
        return
    loses_admin = values.get("role", "admin") != "admin" or values.get("is_active", True) is False
    if not loses_admin:
        return
    others = session.scalar(
        select(func.count()).select_from(User).where(
            User.id != user.id, User.role == "admin", User.is_active, User.password_hash.is_not(None)
        )
    )
    if not others:
        raise Conflict("Deve restare almeno un amministratore attivo con accesso al portale.")


def revoke_sessions(session: Session, user_id: int) -> None:
    session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))


def set_temporary_password(session: Session, user: User) -> str:
    """Nuova password casuale da cambiare al primo accesso; chiude le sessioni aperte."""
    if not user.is_active:
        raise ValidationProblem("L'utente è disattivato: riattivalo prima di dargli una password.")
    password = temporary_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    revoke_sessions(session, user.id)
    session.flush()
    audit.record(session, "update", "users", user.id, {"password": ("***", "temporanea")})
    return password


def _resolve(session: Session, user_ids: list[int], allowed_inactive: set[int] = frozenset()) -> list[User]:
    ids = list(dict.fromkeys(user_ids))  # senza doppioni, ordine mantenuto
    users = {u.id: u for u in session.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    for uid in ids:
        u = users.get(uid)
        if u is None or (not u.is_active and uid not in allowed_inactive):
            raise ValidationProblem("Tecnico non valido o disattivato.")
    return [users[i] for i in ids]


def set_participants(session: Session, event: Event, user_ids: list[int]) -> list[User]:
    """Sostituisce i partecipanti. Un tecnico disattivato può restare se c'era già."""
    current = {p.user_id: p for p in event.participants}
    users = _resolve(session, user_ids, allowed_inactive=set(current))
    old_names = sorted(p.user.display_name for p in event.participants)
    wanted = {u.id for u in users}
    for uid, link in current.items():
        if uid not in wanted:
            event.participants.remove(link)
    for u in users:
        if u.id not in current:
            event.participants.append(EventUser(user=u))
    session.flush()
    new_names = sorted(u.display_name for u in users)
    if old_names != new_names:
        audit.record(
            session, "update", "event_users", event.id,
            {"partecipanti": (", ".join(old_names) or None, ", ".join(new_names) or None)},
            event_id=event.id,
        )
    return sorted(users, key=lambda u: u.display_name)


def add_participants_to_new_event(session: Session, event: Event, user_ids: list[int]) -> None:
    for u in _resolve(session, user_ids):
        event.participants.append(EventUser(user=u))
