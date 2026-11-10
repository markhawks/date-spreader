"""Controllo d'accesso: sessione dal cookie, utente corrente, ruoli, protezione CSRF.

- Il cookie contiene un token casuale; nel database c'è solo il suo hash.
- La sessione scade dopo `SESSION_HOURS` di inattività e comunque dopo 7 giorni.
- Le richieste che modificano dati devono avere l'intestazione `X-Requested-With: datespreader`:
  un altro sito non può aggiungerla senza un permesso CORS, quindi non può far fare
  modifiche a nome dell'utente (CSRF).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.models import AuthSession, User
from app.security import token_hash

COOKIE_NAME = "datespreader_session"
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "datespreader"
ABSOLUTE_LIFETIME = timedelta(days=7)
TOUCH_EVERY = timedelta(minutes=5)  # aggiorna la scadenza al massimo ogni 5 minuti
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

ROLE_ADMIN = "admin"


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@dataclass(frozen=True)
class AuthUser:
    id: int | None
    display_name: str
    role: str
    must_change_password: bool = False
    username: str | None = None
    email: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @classmethod
    def from_user(cls, u: User) -> AuthUser:
        email = None if u.external_id.startswith("local:") else u.external_id
        return cls(u.id, u.display_name, u.role, u.must_change_password, u.username, email)


def _unauthorized(message: str = "Accesso richiesto.") -> HTTPException:
    return HTTPException(401, {"message": message, "code": "auth_required"})


def find_session(db: Session, token: str | None) -> AuthSession | None:
    if not token:
        return None
    return db.scalars(select(AuthSession).where(AuthSession.token_hash == token_hash(token))).first()


def get_current_user(request: Request, db: Session = Depends(get_session)) -> AuthUser:
    """Utente della sessione valida, oppure 401. Anche con cambio password in sospeso."""
    sess = find_session(db, request.cookies.get(COOKIE_NAME))
    now = utcnow()
    if sess is None:
        raise _unauthorized()
    if sess.expires_at <= now or not sess.user.can_login:
        db.delete(sess)
        db.commit()
        raise _unauthorized("Sessione scaduta: accedi di nuovo.")
    if now - sess.last_seen_at >= TOUCH_EVERY:
        hours = request.app.state.settings.session_hours
        sess.last_seen_at = now
        sess.expires_at = min(now + timedelta(hours=hours), sess.created_at + ABSOLUTE_LIFETIME)
        db.commit()
    db.info["user_id"] = sess.user_id  # per la cronologia (app.audit)
    request.state.auth_session_id = sess.id
    return AuthUser.from_user(sess.user)


def require_user(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    """Utente autenticato e senza cambio password in sospeso."""
    if user.must_change_password:
        raise HTTPException(
            403, {"message": "Devi cambiare la password prima di continuare.", "code": "password_change_required"}
        )
    return user


def require_admin(user: AuthUser = Depends(require_user)) -> AuthUser:
    if not user.is_admin:
        raise HTTPException(403, {"message": "Operazione riservata agli amministratori.", "code": "admin_required"})
    return user


def csrf_protect(request: Request) -> None:
    if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise HTTPException(403, {"message": "Richiesta non valida (manca l'intestazione di sicurezza).", "code": "csrf"})
