from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import create_db_engine, make_session_factory
from app.main import create_app
from app.migrations import upgrade_database


@pytest.fixture(autouse=True)
def _english_locale(monkeypatch):
    """CLI messages follow the locale: tests run in English unless they choose otherwise."""
    for var in ("LC_ALL", "LC_MESSAGES"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("LANG", "C.UTF-8")


@pytest.fixture
def settings(tmp_path) -> Settings:
    """Ogni test usa un database SQLite temporaneo, mai quello di sviluppo."""
    return Settings(
        app_name="Date Spreader (test)",
        database_path=tmp_path / "test.sqlite3",
        sqlite_busy_timeout_ms=1000,
        host="127.0.0.1",
        port=0,
        reload=False,
    )


@pytest.fixture
def engine(settings):
    eng = create_db_engine(settings)
    upgrade_database(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine):
    return make_session_factory(engine)


def authed_app(settings):
    """App con utente amministratore fittizio, per i test sui dati.

    Il controllo d'accesso vero è verificato in test_auth.py con il client `anon`.
    """
    from app.auth import AuthUser, csrf_protect, require_user

    app = create_app(settings)
    app.dependency_overrides[require_user] = lambda: AuthUser(None, "Test", "admin")
    app.dependency_overrides[csrf_protect] = lambda: None
    return app


@pytest.fixture
def client(settings, engine) -> TestClient:
    with TestClient(authed_app(settings)) as c:
        yield c


@pytest.fixture
def anon(settings, engine) -> TestClient:
    """Client senza scorciatoie: deve fare login. Manda l'intestazione anti-CSRF come il frontend."""
    with TestClient(create_app(settings), headers={"X-Requested-With": "datespreader"}) as c:
        yield c
