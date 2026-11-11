"""Applicazione e verifica delle migrazioni Alembic dal codice Python."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Connection, Engine

from app.config import PROJECT_ROOT


def alembic_config() -> Config:
    cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    return cfg


@contextmanager
def foreign_keys_off(conn: Connection) -> Iterator[None]:
    """Disattiva le chiavi esterne SQLite per la durata delle migrazioni.

    PERCHÉ: su SQLite Alembic modifica le tabelle ricreandole (copia, DROP, rinomina).
    Con le chiavi esterne attive, il DROP di una tabella "padre" (es. projects) esegue
    gli ON DELETE CASCADE e cancella tutti i record figli (interventi, righe server).
    Il PRAGMA funziona solo fuori da una transazione, quindi va dato prima di iniziarla.
    Alla fine si verifica l'integrità e si riattivano le chiavi esterne.
    """
    if conn.dialect.name != "sqlite":
        yield
        return
    conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
    conn.commit()
    try:
        yield
        problems = conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
        conn.commit()
        if problems:
            raise RuntimeError(f"Integrity violated after the migration: {problems[:5]}")
    finally:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.commit()


def _run(engine: Engine, action) -> None:
    cfg = alembic_config()
    with engine.connect() as conn, foreign_keys_off(conn):
        cfg.attributes["connection"] = conn
        action(cfg)
        conn.commit()


def upgrade_database(engine: Engine, revision: str = "head") -> None:
    _run(engine, lambda cfg: command.upgrade(cfg, revision))


def downgrade_database(engine: Engine, revision: str = "base") -> None:
    _run(engine, lambda cfg: command.downgrade(cfg, revision))


def schema_status(conn: Connection) -> dict:
    """Revisione attuale del database e se coincide con l'ultima migrazione disponibile."""
    current = MigrationContext.configure(conn).get_current_revision()
    head = ScriptDirectory.from_config(alembic_config()).get_current_head()
    return {"revision": current, "head": head, "up_to_date": current == head}
