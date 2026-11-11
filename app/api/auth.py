"""Accesso al portale: login, logout, utente corrente, cambio password."""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app import __version__
from app.api.deps import get_session
from app.auth import (
    COOKIE_NAME,
    AuthUser,
    csrf_protect,
    find_session,
    get_current_user,
    utcnow,
)
from app.i18n import tr
from app.models import AuthSession, User
from app.security import (
    DUMMY_HASH,
    LoginLimiter,
    hash_password,
    new_session_token,
    password_problem,
    token_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["accesso"], dependencies=[Depends(csrf_protect)])
SessionDep = Annotated[Session, Depends(get_session)]
limiter = LoginLimiter()

class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=255, description="Nome utente o email")
    password: str = Field(min_length=1, max_length=200)


class MeOut(BaseModel):
    id: int | None
    display_name: str
    role: str
    is_admin: bool
    must_change_password: bool
    username: str | None
    email: str | None
    version: str


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


def _me(user: AuthUser) -> MeOut:
    return MeOut(
        id=user.id, display_name=user.display_name, role=user.role, is_admin=user.is_admin,
        must_change_password=user.must_change_password, username=user.username, email=user.email,
        version=__version__,
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def find_user_by_login(db: Session, login: str) -> User | None:
    key = login.strip().lower()
    return db.scalars(
        select(User).where(or_(func.lower(User.username) == key, func.lower(User.external_id) == key))
    ).first()


@router.post("/login", response_model=MeOut)
def login(data: LoginIn, request: Request, response: Response, db: SessionDep) -> MeOut:
    ip = _client_ip(request)
    wait = limiter.retry_after(ip, data.login)
    if wait:
        raise HTTPException(
            429, {"message": tr("auth.too_many_attempts", seconds=wait), "code": "too_many_attempts"},
            headers={"Retry-After": str(wait)},
        )
    user = find_user_by_login(db, data.login)
    # Verifica sempre una password (anche finta): tempi uguali per utenti esistenti e no.
    ok = verify_password(data.password, user.password_hash if user and user.password_hash else DUMMY_HASH)
    if not (ok and user and user.can_login):
        limiter.failure(ip, data.login)
        raise HTTPException(401, {"message": tr("auth.invalid_credentials"), "code": "invalid_credentials"})
    limiter.success(ip, data.login)

    now = utcnow()
    hours = request.app.state.settings.session_hours
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= now))  # pulizia sessioni scadute
    token = new_session_token()
    db.add(AuthSession(
        token_hash=token_hash(token), user_id=user.id, created_at=now, last_seen_at=now,
        expires_at=now + timedelta(hours=hours), ip_address=ip,
        user_agent=(request.headers.get("user-agent") or "")[:300],
    ))
    # UPDATE diretto: "ultimo accesso" non deve cambiare la versione del record utente,
    # altrimenti un amministratore che lo sta modificando riceverebbe un conflitto falso.
    db.execute(update(User).where(User.id == user.id).values(last_login_at=now))
    db.commit()
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax", path="/",
        secure=request.app.state.settings.cookie_secure, max_age=7 * 24 * 3600,
    )
    return _me(AuthUser.from_user(user))


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: SessionDep) -> Response:
    sess = find_session(db, request.cookies.get(COOKIE_NAME))
    if sess is not None:
        db.delete(sess)
        db.commit()
    response.status_code = 204
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.get("/me", response_model=MeOut)
def me(user: Annotated[AuthUser, Depends(get_current_user)]) -> MeOut:
    """Utente corrente (401 se non autenticato). Funziona anche con cambio password in sospeso."""
    return _me(user)


@router.post("/change-password", response_model=MeOut)
def change_password(
    data: ChangePasswordIn,
    request: Request,
    db: SessionDep,
    current: Annotated[AuthUser, Depends(get_current_user)],
) -> MeOut:
    user = db.get(User, current.id)
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(422, tr("auth.wrong_current_password"))
    if data.new_password == data.current_password:
        raise HTTPException(422, tr("auth.same_password"))
    problem = password_problem(data.new_password, login_names=(user.username, current.email))
    if problem:
        raise HTTPException(422, problem)
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    user.password_changed_at = utcnow()
    # Chiude le altre sessioni dello stesso utente (es. su altri PC)
    db.execute(delete(AuthSession).where(
        AuthSession.user_id == user.id, AuthSession.id != request.state.auth_session_id
    ))
    db.commit()
    return _me(AuthUser.from_user(user))
