from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

from app.db import Base, create_db_engine
from app.migrations import downgrade_database, upgrade_database

EXPECTED_TABLES = {
    "projects",
    "events",
    "servers",
    "event_servers",
    "users",
    "event_users",
    "audit_log",
    "custom_field_definitions",
    "custom_field_values",
}


def test_upgrade_creates_all_tables(engine):
    assert EXPECTED_TABLES <= set(inspect(engine).get_table_names())


def test_models_match_migrations(engine):
    """Se fallisce, è cambiato un modello senza creare la migrazione corrispondente."""
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        assert compare_metadata(ctx, Base.metadata) == []


def test_downgrade_and_upgrade_again(settings):
    eng = create_db_engine(settings)
    upgrade_database(eng)
    downgrade_database(eng)
    assert not EXPECTED_TABLES & set(inspect(eng).get_table_names())
    upgrade_database(eng)
    assert EXPECTED_TABLES <= set(inspect(eng).get_table_names())
    eng.dispose()


def test_migrations_do_not_cascade_delete_children(settings):
    """Regressione: su SQLite Alembic ricrea le tabelle (DROP + rinomina). Con le chiavi esterne
    attive, il DROP di `projects` cancellava a cascata tutti gli interventi e le righe server."""
    from sqlalchemy import text

    engine = create_db_engine(settings)
    upgrade_database(engine, "3199f10d0e07")  # prima della migrazione che ricrea projects/servers/users
    with engine.begin() as c:
        c.execute(text("INSERT INTO projects (id, name, status, version) VALUES (1, 'Reale', 'attivo', 1)"))
        c.execute(text("INSERT INTO events (id, project_id, event_date, event_type, status, version) "
                       "VALUES (1, 1, '2026-11-10', 'migrazione', 'pianificato', 1)"))
        c.execute(text("INSERT INTO servers (id, hostname, version) VALUES (1, 'srv.azienda.it', 1)"))
        c.execute(text("INSERT INTO users (id, external_id, display_name, role, is_active, version) "
                       "VALUES (1, 'a@azienda.it', 'A', 'tecnico', 1, 1)"))
        c.execute(text("INSERT INTO event_servers (id, event_id, server_id, position, check_status, "
                       "migration_status, assigned_user_id, version) VALUES (1, 1, 1, 0, 'ok', 'pianificata', 1, 1)"))
        c.execute(text("INSERT INTO event_users (event_id, user_id) VALUES (1, 1)"))

    upgrade_database(engine)

    with engine.connect() as c:
        counts = {t: c.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                  for t in ("projects", "events", "servers", "users", "event_servers", "event_users")}
        assert counts == dict.fromkeys(counts, 1), counts
        assert c.execute(text("SELECT assigned_user_id FROM event_servers")).scalar() == 1
        assert c.execute(text("PRAGMA foreign_keys")).scalar() == 1  # riattivate dopo la migrazione
    engine.dispose()


def test_alembic_refuses_to_run_with_foreign_keys_on(engine):
    """Rete di sicurezza in env.py: niente migrazioni con le chiavi esterne attive."""
    import pytest
    from alembic import command

    from app.migrations import alembic_config

    cfg = alembic_config()
    with engine.connect() as conn:
        cfg.attributes["connection"] = conn
        with pytest.raises(RuntimeError, match="chiavi esterne"):
            command.downgrade(cfg, "-1")
