"""Ambiente Alembic.

Usa lo stesso motore dell'applicazione (stessi PRAGMA SQLite). Si può passare una
connessione già aperta tramite config.attributes["connection"] (usato dai test e da
app.cli per migrare un database specifico).
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401  registra tutte le tabelle su Base.metadata
from app.config import get_settings
from app.db import Base, create_db_engine

config = context.config
target_metadata = Base.metadata

# Log di Alembic solo da riga di comando, per non toccare il logging di app e test.
if config.config_file_name is not None and "connection" not in config.attributes:
    fileConfig(config.config_file_name)


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        render_as_batch=True,  # necessario per le ALTER TABLE su SQLite
        compare_type=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    _configure(url=get_settings().database_url, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _check_foreign_keys_off(conn) -> None:
    """Rete di sicurezza: mai migrare SQLite con le chiavi esterne attive (vedi app.migrations)."""
    if conn.dialect.name == "sqlite" and conn.exec_driver_sql("PRAGMA foreign_keys").scalar():
        raise RuntimeError(
            "Migrazione interrotta: chiavi esterne SQLite attive. Ricreando le tabelle, "
            "i DELETE a cascata cancellerebbero i dati. Usare app.migrations.upgrade_database."
        )


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _check_foreign_keys_off(connection)
        _configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
        return

    # Avvio da riga di comando (alembic ...): stessa protezione.
    from app.migrations import foreign_keys_off

    engine = create_db_engine(get_settings())
    with engine.connect() as conn, foreign_keys_off(conn):
        _check_foreign_keys_off(conn)
        _configure(connection=conn)
        with context.begin_transaction():
            context.run_migrations()
        conn.commit()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
