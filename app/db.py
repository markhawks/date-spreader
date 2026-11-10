"""Connessione al database.

Tutto l'accesso ai dati passa da qui e dai repository (app/repositories),
così un futuro passaggio a PostgreSQL tocca solo questo livello.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import Settings

# Nomi espliciti per i vincoli: servono ad Alembic per modificarli in modo affidabile
# (su SQLite le ALTER passano da una ricostruzione della tabella).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base comune per i modelli ORM (definiti in app/models)."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def create_db_engine(settings: Settings) -> Engine:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record) -> None:  # pragma: no cover - banale
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")  # letture concorrenti alle scritture
        cur.execute(f"PRAGMA busy_timeout={settings.sqlite_busy_timeout_ms}")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA synchronous=NORMAL")  # sicuro in modalità WAL
        cur.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Una sessione per richiesta: commit se va tutto bene, rollback in caso di errore."""
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
