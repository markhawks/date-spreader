"""Password, token di sessione e limite ai tentativi di accesso. Solo libreria standard."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import string
import threading
import time

from app.i18n import tr

# scrypt: parametri raccomandati per l'uso interattivo (circa 50 ms, 16 MiB di memoria)
_N, _R, _P, _DKLEN = 2**14, 8, 1, 64
MIN_PASSWORD_LENGTH = 10


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Per le richieste con utente inesistente: stesso tempo di calcolo, così i tempi di
# risposta non rivelano quali utenti esistono.
DUMMY_HASH = hash_password(secrets.token_hex(8))


def password_problem(password: str, *, login_names: tuple[str | None, ...] = ()) -> str | None:
    """Messaggio d'errore se la password non è accettabile, altrimenti None."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return tr("password.too_short", min=MIN_PASSWORD_LENGTH)
    if password.strip() != password:
        return tr("password.spaces")
    low = password.lower()
    if any(n and n.lower() in low for n in login_names):
        return tr("password.contains_login")
    if len(set(password)) < 5:
        return tr("password.repetitive")
    return None


def temporary_password() -> str:
    """Password temporanea leggibile (niente caratteri ambigui come 0/O, 1/l)."""
    alphabet = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")
    raw = "".join(secrets.choice(alphabet) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginLimiter:
    """Dopo `max_failures` errori in `window` secondi per la stessa coppia (IP, login),
    blocca i tentativi per `lockout` secondi. In memoria: si azzera al riavvio."""

    def __init__(self, max_failures: int = 5, window: int = 300, lockout: int = 300):
        self.max_failures, self.window, self.lockout = max_failures, window, lockout
        self._failures: dict[tuple[str, str], list[float]] = {}
        self._blocked: dict[tuple[str, str], float] = {}
        self._lock = threading.Lock()

    def retry_after(self, ip: str, login: str) -> int:
        """Secondi di attesa residui (0 = si può provare)."""
        with self._lock:
            until = self._blocked.get((ip, login.lower()), 0)
            return max(0, int(until - time.monotonic()) + 1) if until > time.monotonic() else 0

    def failure(self, ip: str, login: str) -> None:
        key, now = (ip, login.lower()), time.monotonic()
        with self._lock:
            recent = [t for t in self._failures.get(key, []) if now - t < self.window] + [now]
            self._failures[key] = recent
            if len(recent) >= self.max_failures:
                self._blocked[key] = now + self.lockout
                self._failures[key] = []

    def success(self, ip: str, login: str) -> None:
        with self._lock:
            self._failures.pop((ip, login.lower()), None)
            self._blocked.pop((ip, login.lower()), None)
