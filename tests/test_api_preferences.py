"""Preferenze personali (Impostazioni → Aspetto)."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import User, UserPreferences
from tests.test_auth import ADMIN_PW, TECH_PW, accounts, login  # noqa: F401  (fixture riusata)


def test_defaults_and_partial_update(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    assert anon.get("/api/me/preferences").json() == {
        "detail_position": "right", "bottom_panel_height": 45, "theme": "system",
        "sidebar_width": 280, "project_view": "grid", "project_sort": "name", "project_group": "none",
        "time_format": "24h", "gmail_account": "", "gmail_choose_account": False, "calendar_zoom": 1.0, "calendar_view": "month", "topbar_clock": "date_time", "language": "auto", "calendar_days": "all",
    }
    res = anon.patch("/api/me/preferences", json={"detail_position": "bottom"})
    assert res.status_code == 200 and res.json()["detail_position"] == "bottom" and res.json()["theme"] == "system"
    anon.patch("/api/me/preferences", json={"theme": "dark", "bottom_panel_height": 60})
    got = anon.get("/api/me/preferences").json()
    assert (got["detail_position"], got["bottom_panel_height"], got["theme"]) == ("bottom", 60, "dark")
    anon.patch("/api/me/preferences", json={"sidebar_width": 420, "project_view": "list", "project_sort": "date"})
    got = anon.get("/api/me/preferences").json()
    assert (got["sidebar_width"], got["project_view"], got["project_sort"], got["theme"]) == (420, "list", "date", "dark")


def test_validation(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    for bad in ({"detail_position": "left"}, {"theme": "viola"}, {"bottom_panel_height": 5}, {"sconosciuta": 1},
                {"sidebar_width": 100}, {"sidebar_width": 2000}, {"project_view": "tabella"}, {"project_sort": "colore"},
                {"time_format": "ampm"}, {"gmail_account": "non-una-email"}, {"gmail_account": "a b@c.it"},
                {"calendar_zoom": 0.2}, {"calendar_zoom": 5}, {"calendar_view": "day"}, {"topbar_clock": "analog"}, {"language": "de"}, {"calendar_days": "weekend"}):
        assert anon.patch("/api/me/preferences", json=bad).status_code == 422, bad


def test_preferences_are_per_user(settings, engine, accounts):  # noqa: F811
    hdr = {"X-Requested-With": "datespreader"}
    with TestClient(create_app(settings), headers=hdr) as a, TestClient(create_app(settings), headers=hdr) as b:
        login(a, "tecnico1", TECH_PW)
        login(b, "admin@azienda.it", ADMIN_PW)
        a.patch("/api/me/preferences", json={"detail_position": "bottom"})
        assert b.get("/api/me/preferences").json()["detail_position"] == "right"


def test_requires_login(anon, accounts):  # noqa: F811
    assert anon.get("/api/me/preferences").status_code == 401


def test_unknown_stored_keys_are_ignored(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    with accounts.begin() as s:
        uid = s.scalars(select(User.id).where(User.username == "tecnico1")).one()
        s.add(UserPreferences(user_id=uid, data='{"theme": "light", "vecchia_opzione": true}'))
    assert anon.get("/api/me/preferences").json()["theme"] == "light"


def test_gmail_account(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    got = anon.patch("/api/me/preferences", json={"gmail_account": "mario@azienda.it", "gmail_choose_account": True}).json()
    assert (got["gmail_account"], got["gmail_choose_account"]) == ("mario@azienda.it", True)
    got = anon.patch("/api/me/preferences", json={"gmail_account": ""}).json()  # vuoto = email del profilo
    assert (got["gmail_account"], got["gmail_choose_account"]) == ("", True)


def test_calendar_zoom(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    assert anon.patch("/api/me/preferences", json={"calendar_zoom": 1.75}).json()["calendar_zoom"] == 1.75
    assert anon.get("/api/me/preferences").json()["calendar_zoom"] == 1.75


def test_calendar_view(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    assert anon.patch("/api/me/preferences", json={"calendar_view": "week"}).json()["calendar_view"] == "week"
    assert anon.get("/api/me/preferences").json()["calendar_view"] == "week"


def test_topbar_clock(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    for value in ("date", "time", "off", "date_time_seconds", "date_time"):
        assert anon.patch("/api/me/preferences", json={"topbar_clock": value}).json()["topbar_clock"] == value


def test_language(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    for value in ("it", "en", "auto"):
        assert anon.patch("/api/me/preferences", json={"language": value}).json()["language"] == value


def test_calendar_days(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    assert anon.patch("/api/me/preferences", json={"calendar_days": "workweek"}).json()["calendar_days"] == "workweek"
    assert anon.get("/api/me/preferences").json()["calendar_days"] == "workweek"
