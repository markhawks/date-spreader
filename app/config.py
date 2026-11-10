"""Configurazione letta da variabili d'ambiente (con eventuale file .env)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Carica un file .env minimale (CHIAVE=valore) senza sovrascrivere l'ambiente."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _as_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str
    database_path: Path
    sqlite_busy_timeout_ms: int
    host: str
    port: int
    reload: bool
    session_hours: int = 12        # durata della sessione dall'ultima attività
    cookie_secure: bool = False    # True solo dietro HTTPS
    source_url: str = ""           # dove scaricare il codice sorgente (AGPL); vuoto = repository ufficiale

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path}"


def get_settings() -> Settings:
    _load_dotenv(PROJECT_ROOT / ".env")
    db_path = Path(os.environ.get("DATABASE_PATH", "data/datespreader.sqlite3"))
    if not db_path.is_absolute():
        db_path = PROJECT_ROOT / db_path
    return Settings(
        app_name=os.environ.get("APP_NAME", "Date Spreader"),
        database_path=db_path,
        sqlite_busy_timeout_ms=int(os.environ.get("SQLITE_BUSY_TIMEOUT_MS", "5000")),
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload=_as_bool(os.environ.get("RELOAD", "false")),
        session_hours=int(os.environ.get("SESSION_HOURS", "12")),
        cookie_secure=_as_bool(os.environ.get("COOKIE_SECURE", "false")),
        source_url=os.environ.get("SOURCE_URL", "").strip(),
    )
