"""Dati di esempio: caricamento, marcatura, rimozione senza toccare i dati reali."""

from datetime import date

import pytest
from sqlalchemy import func, inspect, select, text

from app import cli
from app.db import create_db_engine, make_session_factory
from app.migrations import upgrade_database
from app.models import Event, EventServer, EventUser, Project, Server, User
from app.seed import AlreadySeededError, plan_demo_removal, remove_demo, seed

TODAY = date(2026, 11, 10)


def count(s, model, *where):
    return s.scalar(select(func.count()).select_from(model).where(*where))


@pytest.fixture
def mixed(session_factory):
    """Esempio + dati reali, come su un'installazione in uso."""
    with session_factory.begin() as s:
        seed(s, today=TODAY)
        real_user = User(external_id="mario.reale@azienda.it", display_name="Mario Reale")
        real_server = Server(hostname="srv01.azienda.it")
        real = Project(name="Cliente Reale")
        ev = Event(project=real, event_date=date(2026, 11, 20))
        s.add_all([real_user, real_server, real, ev])
        s.add(EventServer(event=ev, server=real_server, assigned_user=real_user))
        s.add(EventUser(event=ev, user=real_user))
    return session_factory


def test_seed_twice_is_refused_but_allowed_next_to_real_data(session_factory):
    with session_factory.begin() as s:
        s.add(Project(name="Già presente"))
    with session_factory.begin() as s:
        seed(s, today=TODAY)  # dati reali presenti: l'esempio si carica comunque
    with session_factory.begin() as s, pytest.raises(AlreadySeededError):
        seed(s, today=TODAY)


def test_remove_demo_keeps_real_data(mixed):
    with mixed.begin() as s:
        plan = remove_demo(s)
    assert plan["progetti"] == ["Alfa Logistica", "Beta Assicurazioni", "Gamma Retail"]
    with mixed() as s:
        assert [p.name for p in s.scalars(select(Project))] == ["Cliente Reale"]
        assert count(s, Event) == 1
        assert [x.hostname for x in s.scalars(select(Server))] == ["srv01.azienda.it"]
        assert [u.display_name for u in s.scalars(select(User))] == ["Mario Reale"]
        assert count(s, EventServer) == 1 and count(s, EventUser) == 1


def test_demo_user_used_by_real_data_is_only_deactivated(mixed):
    with mixed.begin() as s:
        sara = s.scalars(select(User).where(User.display_name == "Sara Verdi")).one()
        real_ev = s.scalars(select(Event).join(Project).where(Project.name == "Cliente Reale")).one()
        s.add(EventUser(event=real_ev, user=sara))
    with mixed() as s:
        plan = plan_demo_removal(s)
    assert plan["tecnici_disattivati"] == ["Sara Verdi"]
    with mixed.begin() as s:
        remove_demo(s)
    with mixed() as s:
        sara = s.scalars(select(User).where(User.display_name == "Sara Verdi")).one()
        assert sara.is_active is False
        assert count(s, User) == 2  # Mario Reale + Sara (disattivata)


def test_demo_server_used_by_real_event_is_kept(mixed):
    with mixed.begin() as s:
        db01 = s.scalars(select(Server).where(Server.hostname == "alfa-db01.example.com")).one()
        real_ev = s.scalars(select(Event).join(Project).where(Project.name == "Cliente Reale")).one()
        s.add(EventServer(event=real_ev, server=db01, position=1))
    with mixed() as s:
        assert plan_demo_removal(s)["server_mantenuti"] == ["alfa-db01.example.com"]
    with mixed.begin() as s:
        remove_demo(s)
    with mixed() as s:
        db01 = s.scalars(select(Server).where(Server.hostname == "alfa-db01.example.com")).one()
        assert db01.is_demo is False  # ormai è un dato reale
        assert count(s, Server) == 2


def test_remove_demo_twice_and_reload(mixed):
    with mixed.begin() as s:
        remove_demo(s)
    with mixed.begin() as s:
        plan = remove_demo(s)
    assert not any(plan.values())
    with mixed.begin() as s:
        seed(s, today=TODAY)  # per una nuova demo
    with mixed() as s:
        assert count(s, Project, Project.is_demo) == 3


def test_api_exposes_demo_flag(client, mixed):
    projects = {p["name"]: p["is_demo"] for p in client.get("/api/projects").json()}
    assert projects == {"Alfa Logistica": True, "Beta Assicurazioni": True, "Gamma Retail": True, "Cliente Reale": False}
    users = {u["display_name"]: u["is_demo"] for u in client.get("/api/users").json()}
    assert users["Mario Reale"] is False and users["Luca Bianchi"] is True


def test_remove_demo_signals_clients(client, mixed):
    since = client.get("/api/changes").json()["last_id"]
    with mixed.begin() as s:
        remove_demo(s)
    res = client.get("/api/changes", params={"since": since}).json()
    assert res["projects_changed"] is True and res["users_changed"] is True


# --- migrazione: database creati prima del flag -----------------------------------------


def test_migration_marks_existing_demo_data_only(settings):
    """Situazione reale: esempio caricato prima del flag, più dati veri aggiunti dagli utenti."""
    engine = create_db_engine(settings)
    upgrade_database(engine, "3199f10d0e07")  # revisione precedente al flag is_demo
    with engine.begin() as c:
        c.execute(text("INSERT INTO projects (name, status, version) VALUES "
                       "('Alfa Logistica','attivo',1), ('Delta - Update','attivo',1)"))
        c.execute(text("INSERT INTO servers (hostname, version) VALUES "
                       "('alfa-db01.example.com',1), ('delta-bck02.example.net',1)"))
        c.execute(text("INSERT INTO users (external_id, display_name, role, is_active, version) VALUES "
                       "('luca.bianchi@example.com','Luca Bianchi','tecnico',1,1), "
                       "('paolo.neri@azienda.it','Paolo Neri','tecnico',1,1)"))
    upgrade_database(engine)
    assert "is_demo" in {c["name"] for c in inspect(engine).get_columns("projects")}
    with engine.connect() as c:
        flags = lambda sql: dict(c.execute(text(sql)).all())  # noqa: E731
        assert flags("SELECT name, is_demo FROM projects") == {"Alfa Logistica": 1, "Delta - Update": 0}
        assert flags("SELECT hostname, is_demo FROM servers") == {"alfa-db01.example.com": 1, "delta-bck02.example.net": 0}
        assert flags("SELECT display_name, is_demo FROM users") == {"Luca Bianchi": 1, "Paolo Neri": 0}
    engine.dispose()


# --- riga di comando ---------------------------------------------------------------------


@pytest.fixture
def cli_db(tmp_path, monkeypatch):
    path = tmp_path / "cli.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    return path


def _factory(path):
    from app.config import Settings

    eng = create_db_engine(Settings("t", path, 1000, "127.0.0.1", 0, False))
    return eng, make_session_factory(eng)


def test_cli_init_without_demo_is_empty(cli_db, capsys):
    assert cli.main(["init"]) == 0
    eng, f = _factory(cli_db)
    with f() as s:
        assert count(s, Project) == 0
    eng.dispose()


def test_cli_demo_cycle(cli_db, capsys, monkeypatch):
    monkeypatch.setenv("LANG", "it_IT.UTF-8")  # CLI messages in Italian, from the locale
    assert cli.main(["init", "--demo"]) == 0
    assert cli.main(["demo", "load"]) == 0
    assert "già presenti" in capsys.readouterr().out
    # senza terminale interattivo e senza --yes non cancella nulla
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert cli.main(["demo", "remove"]) == 1
    eng, f = _factory(cli_db)
    with f() as s:
        assert count(s, Project) == 3
    assert cli.main(["demo", "remove", "--yes"]) == 0
    out = capsys.readouterr().out
    assert "Progetti da cancellare (3)" in out and "Dati di esempio rimossi" in out
    with f() as s:
        assert count(s, Project) == 0 and count(s, User) == 0 and count(s, Server) == 0
    eng.dispose()


def test_cli_messages_follow_the_locale(cli_db, capsys, monkeypatch):
    assert cli.language_from_env({"LANG": "it_IT.UTF-8"}) == "it"
    assert cli.language_from_env({"LC_ALL": "en_US.UTF-8", "LANG": "it_IT.UTF-8"}) == "en"
    assert cli.language_from_env({"LC_MESSAGES": "it_IT", "LANG": "C"}) == "it"
    assert cli.language_from_env({}) == "en"
    assert cli.main(["init"]) == 0
    assert "Migrations applied." in capsys.readouterr().out
    monkeypatch.setenv("LC_ALL", "it_IT.UTF-8")
    assert cli.main(["demo", "remove"]) == 0
    assert "Nessun dato di esempio presente." in capsys.readouterr().out


def test_demo_database_is_current_and_clean():
    """demo/datespreader-demo.sqlite3 (nel repository): schema aggiornato e soli dati di esempio.

    Se fallisce dopo una nuova migrazione: .venv/bin/python scripts/make_demo_db.py
    """
    import sqlite3

    from alembic.script import ScriptDirectory

    from app.config import PROJECT_ROOT
    from app.migrations import alembic_config

    path = PROJECT_ROOT / "demo" / "datespreader-demo.sqlite3"
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        head = ScriptDirectory.from_config(alembic_config()).get_current_head()
        assert con.execute("SELECT version_num FROM alembic_version").fetchone()[0] == head
        assert con.execute("SELECT count(*) FROM projects WHERE is_demo = 0").fetchone()[0] == 0
        assert con.execute("SELECT count(*) FROM servers WHERE is_demo = 0").fetchone()[0] == 0
        # unico utente non "esempio": l'amministratore demo, con cambio password obbligatorio
        assert con.execute(
            "SELECT username, must_change_password FROM users WHERE is_demo = 0").fetchall() == [("admin", 1)]
        assert con.execute("SELECT count(*) FROM auth_sessions").fetchone()[0] == 0
    finally:
        con.close()
