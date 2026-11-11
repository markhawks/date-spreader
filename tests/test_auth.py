"""Accesso: login, sessioni, ruoli, CSRF, password, ultimo amministratore, cronologia con autore."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import __version__, cli
from app.api.auth import limiter
from app.auth import COOKIE_NAME, utcnow
from app.main import create_app
from app.models import AuditLog, AuthSession, User
from app.security import hash_password, verify_password

ADMIN_PW = "Admin-Password-2026"
TECH_PW = "Tecnico-Password-2026"


@pytest.fixture(autouse=True)
def _reset_limiter():
    limiter._failures.clear()
    limiter._blocked.clear()


@pytest.fixture
def accounts(session_factory):
    with session_factory.begin() as s:
        s.add_all([
            User(external_id="admin@azienda.it", display_name="Ada Admin", role="admin",
                 password_hash=hash_password(ADMIN_PW)),
            User(external_id="tec@azienda.it", username="tecnico1", display_name="Tito Tecnico",
                 role="tecnico", password_hash=hash_password(TECH_PW)),
            User(external_id="local:nopw", display_name="Senza Password", role="tecnico"),
        ])
    return session_factory


def login(c, who, pw):
    return c.post("/api/auth/login", json={"login": who, "password": pw})


def uid(sf, name):
    with sf() as s:
        return s.scalars(select(User.id).where(User.display_name == name)).one()


# --- login, logout, sessione -----------------------------------------------------------


def test_data_requires_login(anon, accounts):
    assert anon.get("/api/projects").status_code == 401
    assert anon.get("/api/auth/me").json()["detail"]["code"] == "auth_required"
    # pubblici
    assert anon.get("/api/health").status_code == 200
    info = anon.get("/api/version").json()
    assert info["version"] == __version__ and info["license"] == "AGPL-3.0-only" and info["source_url"].startswith("https://")
    assert "## [0.9.0]" in anon.get("/api/changelog").json()["markdown"]
    assert anon.get("/").status_code == 200  # la pagina (con il form di login)


def test_login_with_email_or_username_case_insensitive(anon, accounts):
    res = login(anon, "ADMIN@azienda.it", ADMIN_PW)
    assert res.status_code == 200 and res.json()["is_admin"] is True
    cookie = res.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert anon.get("/api/projects").status_code == 200
    anon.post("/api/auth/logout")
    assert login(anon, "Tecnico1", TECH_PW).json()["display_name"] == "Tito Tecnico"


@pytest.mark.parametrize(("who", "pw"), [
    ("admin@azienda.it", "sbagliata"), ("nessuno@azienda.it", ADMIN_PW), ("local:nopw", "qualsiasi"),
])
def test_bad_credentials_same_message(anon, accounts, who, pw):
    res = login(anon, who, pw)
    assert res.status_code == 401
    assert res.json()["detail"]["message"] == "Credenziali non valide."


def test_logout_invalidates_session(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    token = anon.cookies.get(COOKIE_NAME)
    assert anon.post("/api/auth/logout").status_code == 204
    anon.cookies.set(COOKIE_NAME, token)  # riusare il vecchio token non funziona
    assert anon.get("/api/projects").status_code == 401


def test_token_is_stored_hashed(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    token = anon.cookies.get(COOKIE_NAME)
    with accounts() as s:
        stored = s.scalars(select(AuthSession.token_hash)).one()
    assert stored != token and len(stored) == 64


def test_expired_session(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    with accounts.begin() as s:
        for sess in s.scalars(select(AuthSession)):
            sess.expires_at = utcnow() - timedelta(minutes=1)
    res = anon.get("/api/projects")
    assert res.status_code == 401 and "scaduta" in res.json()["detail"]["message"]


def test_rate_limit(anon, accounts):
    for _ in range(5):
        assert login(anon, "admin@azienda.it", "sbagliata").status_code == 401
    res = login(anon, "admin@azienda.it", ADMIN_PW)  # anche quella giusta, durante il blocco
    assert res.status_code == 429 and int(res.headers["retry-after"]) > 0


def test_inactive_user_cannot_login_and_is_logged_out(anon, accounts):
    login(anon, "tecnico1", TECH_PW)
    with accounts.begin() as s:
        s.scalars(select(User).where(User.username == "tecnico1")).one().is_active = False
    assert anon.get("/api/projects").status_code == 401
    assert login(anon, "tecnico1", TECH_PW).status_code == 401


# --- CSRF e ruoli ---------------------------------------------------------------------


def test_csrf_header_required_for_changes(settings, engine, accounts):
    with TestClient(create_app(settings)) as c:  # senza intestazione
        assert login(c, "admin@azienda.it", ADMIN_PW).status_code == 403
        c.headers["X-Requested-With"] = "datespreader"
        assert login(c, "admin@azienda.it", ADMIN_PW).status_code == 200
        del c.headers["X-Requested-With"]
        assert c.get("/api/projects").status_code == 200  # le letture non ne hanno bisogno
        assert c.post("/api/projects", json={"name": "X"}).status_code == 403


def test_technician_can_edit_data_but_not_users(anon, accounts):
    login(anon, "tecnico1", TECH_PW)
    assert anon.post("/api/projects", json={"name": "Progetto del tecnico"}).status_code == 201
    assert anon.get("/api/users").status_code == 200
    assert anon.post("/api/users", json={"display_name": "Nuovo"}).status_code == 403
    me = uid(accounts, "Tito Tecnico")
    assert anon.patch(f"/api/users/{me}", json={"version": 1, "role": "admin"}).status_code == 403
    assert anon.post(f"/api/users/{me}/temporary-password").status_code == 403
    # ma può aggiungere al volo un tecnico (solo nome, ruolo tecnico, nessun accesso)
    added = anon.post("/api/users/technicians", json={"display_name": "Tecnico Esterno"})
    assert added.status_code == 201 and added.json()["role"] == "tecnico" and added.json()["has_password"] is False


# --- password ----------------------------------------------------------------------


def test_temporary_password_forces_change(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    tid = uid(accounts, "Senza Password")
    temp = anon.post(f"/api/users/{tid}/temporary-password").json()["password"]
    version = next(u["version"] for u in anon.get("/api/users").json() if u["id"] == tid)
    assert anon.patch(f"/api/users/{tid}", json={"version": version, "username": "senzapw"}).status_code == 200
    anon.post("/api/auth/logout")

    me = login(anon, "senzapw", temp).json()
    assert me["must_change_password"] is True
    blocked = anon.get("/api/projects")
    assert blocked.status_code == 403 and blocked.json()["detail"]["code"] == "password_change_required"
    assert anon.get("/api/auth/me").status_code == 200

    bad = anon.post("/api/auth/change-password", json={"current_password": temp, "new_password": "corta"})
    assert bad.status_code == 422
    ok = anon.post("/api/auth/change-password", json={"current_password": temp, "new_password": "Nuova-Password-99"})
    assert ok.status_code == 200 and ok.json()["must_change_password"] is False
    assert anon.get("/api/projects").status_code == 200


def test_change_password_checks(anon, accounts):
    login(anon, "tecnico1", TECH_PW)
    cp = lambda cur, new: anon.post("/api/auth/change-password", json={"current_password": cur, "new_password": new})  # noqa: E731
    assert cp("sbagliata", "Valida-Password-1").status_code == 422
    assert cp(TECH_PW, TECH_PW).status_code == 422
    assert cp(TECH_PW, "tecnico1-segreto").status_code == 422  # contiene il nome utente
    assert cp(TECH_PW, "Valida-Password-1").status_code == 200
    with accounts() as s:
        u = s.scalars(select(User).where(User.username == "tecnico1")).one()
        assert verify_password("Valida-Password-1", u.password_hash)


def test_change_password_closes_other_sessions(settings, engine, accounts):
    hdr = {"X-Requested-With": "datespreader"}
    with TestClient(create_app(settings), headers=hdr) as pc1, TestClient(create_app(settings), headers=hdr) as pc2:
        login(pc1, "tecnico1", TECH_PW)
        login(pc2, "tecnico1", TECH_PW)
        pc1.post("/api/auth/change-password", json={"current_password": TECH_PW, "new_password": "Valida-Password-1"})
        assert pc1.get("/api/projects").status_code == 200
        assert pc2.get("/api/projects").status_code == 401


# --- amministratori ---------------------------------------------------------------------


def test_last_admin_cannot_be_demoted_or_deactivated(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    aid = uid(accounts, "Ada Admin")
    for change in ({"role": "tecnico"}, {"is_active": False}):
        res = anon.patch(f"/api/users/{aid}", json={"version": 1, **change})
        assert res.status_code == 409 and "almeno un amministratore" in res.json()["detail"]["message"]
    # con un secondo amministratore si può
    tid = uid(accounts, "Tito Tecnico")
    assert anon.patch(f"/api/users/{tid}", json={"version": 1, "role": "admin"}).status_code == 200
    assert anon.patch(f"/api/users/{aid}", json={"version": 1, "role": "tecnico"}).status_code == 200


def test_login_does_not_bump_user_version(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    before = next(u for u in anon.get("/api/users").json() if u["display_name"] == "Tito Tecnico")
    login(anon, "tecnico1", TECH_PW)
    login(anon, "admin@azienda.it", ADMIN_PW)
    after = next(u for u in anon.get("/api/users").json() if u["display_name"] == "Tito Tecnico")
    assert after["version"] == before["version"] and after["last_login_at"]


def test_user_list_shows_login_info(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    users = {u["display_name"]: u for u in anon.get("/api/users").json()}
    assert users["Ada Admin"]["has_password"] is True and users["Ada Admin"]["last_login_at"]
    assert users["Senza Password"]["has_password"] is False
    assert "password_hash" not in users["Ada Admin"]


def test_username_validation_and_uniqueness(anon, accounts):
    login(anon, "admin@azienda.it", ADMIN_PW)
    assert anon.post("/api/users", json={"display_name": "A", "username": "Con Spazi"}).status_code == 422
    assert anon.post("/api/users", json={"display_name": "B", "username": "TECNICO1"}).status_code == 409
    assert anon.post("/api/users", json={"display_name": "C", "username": "Nuovo.Utente"}).json()["username"] == "nuovo.utente"


# --- cronologia con autore ---------------------------------------------------------------


def test_audit_records_author(anon, accounts):
    login(anon, "tecnico1", TECH_PW)
    anon.post("/api/projects", json={"name": "Con autore"})
    with accounts() as s:
        entry = s.scalars(select(AuditLog).where(AuditLog.table_name == "projects")).one()
        assert entry.user_id == uid(accounts, "Tito Tecnico")


# --- riga di comando ------------------------------------------------------------------------


@pytest.fixture
def cli_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "cli.sqlite3"))
    cli.main(["init"])
    return tmp_path / "cli.sqlite3"


def test_cli_create_admin_temporary(cli_db, capsys):
    assert cli.main(["users", "create-admin", "--name", "Capo", "--email", "capo@azienda.it", "--temporary"]) == 0
    out = capsys.readouterr().out
    assert "Password temporanea" in out
    temp = out.strip().split(": ")[-1]
    from app.db import create_db_engine, make_session_factory
    from app.config import Settings

    eng = create_db_engine(Settings("t", cli_db, 1000, "127.0.0.1", 0, False))
    with make_session_factory(eng)() as s:
        u = s.scalars(select(User)).one()
        assert u.role == "admin" and u.must_change_password and verify_password(temp, u.password_hash)
    eng.dispose()
    # di nuovo con la stessa email: rifiuta e suggerisce "users admin"
    assert cli.main(["users", "create-admin", "--name", "Capo2", "--email", "capo@azienda.it", "--temporary"]) == 1


def test_cli_promote_existing_user(cli_db, capsys, monkeypatch):
    from app.api.users import create_user  # noqa: F401  (assicura l'import del modulo)

    cli.main(["users", "create-admin", "--name", "Primo", "--email", "primo@azienda.it", "--temporary"])
    assert cli.main(["users", "admin", "nessuno@azienda.it", "--temporary"]) == 1
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert cli.main(["users", "admin", "primo@azienda.it"]) == 1  # senza terminale serve --temporary
    assert cli.main(["users", "admin", "PRIMO@azienda.it", "--temporary"]) == 0
    assert cli.main(["users", "list"]) == 0
    assert "accesso" in capsys.readouterr().out
