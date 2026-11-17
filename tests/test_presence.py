"""Users connected now (app/presence.py, /api/presence) and the command line (who, wait-idle)."""

import json

import pytest
from fastapi.testclient import TestClient

from app import cli, presence
from app.auth import AuthUser, csrf_protect, require_user
from app.main import create_app


@pytest.fixture(autouse=True)
def clean():
    presence._pages.clear()
    presence.set_notice(None)
    presence._written = 0.0
    yield
    presence._pages.clear()
    presence.set_notice(None)


@pytest.fixture
def as_user(settings, engine):
    """A client whose user can be changed: as_user(id, name, role)."""
    current = {"user": AuthUser(1, "Anna Admin", "admin")}
    app = create_app(settings)
    app.dependency_overrides[require_user] = lambda: current["user"]
    app.dependency_overrides[csrf_protect] = lambda: None
    with TestClient(app) as c:
        def switch(uid, name, role="tecnico"):
            current["user"] = AuthUser(uid, name, role)
            return c
        yield switch


def ping(c, page, **kw):
    res = c.post("/api/presence", json={"page_id": page, **kw})
    assert res.status_code == 200, res.text
    return res.json()


def test_who_is_connected_and_what_they_do(as_user, settings):
    a = as_user(1, "Anna Admin", "admin")
    ping(a, "page-anna-1", activity="calendar")
    t = as_user(2, "Teo Tecnico")
    out = ping(t, "page-teo-1", activity="sheet", detail="Alfa Patch", editing=True)
    ping(t, "page-teo-2", activity="gantt", visible=False)
    assert out["count"] == 2

    users = as_user(1, "Anna Admin", "admin").get("/api/presence").json()["users"]
    teo = next(u for u in users if u["name"] == "Teo Tecnico")
    assert (teo["state"], teo["activity"], teo["detail"], teo["editing"], teo["pages"]) == ("active", "sheet", "Alfa Patch", True, 2)
    assert users[0]["name"] == "Teo Tecnico"          # editing first
    assert teo["ip"] is not None                      # administrators see browser and IP
    others = as_user(2, "Teo Tecnico").get("/api/presence").json()["users"]
    assert all(u["ip"] is None and u["user_agent"] is None for u in others)

    # the copy for the command line
    data = json.loads(presence.presence_file(settings.database_path).read_text())
    assert {u["name"] for u in data["users"]} == {"Anna Admin", "Teo Tecnico"}

    as_user(2, "Teo Tecnico").post("/api/presence/leave", json={"page_id": "page-teo-1"})
    as_user(2, "Teo Tecnico").post("/api/presence/leave", json={"page_id": "page-teo-2"})
    assert [u["name"] for u in as_user(1, "Anna Admin", "admin").get("/api/presence").json()["users"]] == ["Anna Admin"]


def test_states_and_expiry(as_user):
    c = as_user(3, "Bea")
    ping(c, "page-bea-01")
    presence._pages["page-bea-01"]["seen"] -= presence.ACTIVE_FOR + 1
    assert presence.snapshot()[0]["state"] == "background"
    presence._pages["page-bea-01"]["seen"] -= presence.PRESENT_FOR
    assert presence.snapshot() == []


def test_notice_to_everybody(as_user):
    admin = as_user(1, "Anna Admin", "admin")
    res = admin.put("/api/presence/notice", json={"message": "  The portal  restarts at 18:00 ", "minutes": 30})
    assert res.status_code == 200, res.text
    t = as_user(2, "Teo Tecnico")
    n = ping(t, "page-teo-01")["notice"]
    assert (n["message"], n["by"]) == ("The portal restarts at 18:00", "Anna Admin") and n["until"]
    assert t.put("/api/presence/notice", json={"message": "x"}).status_code == 403   # administrators only
    assert as_user(1, "Anna Admin", "admin").delete("/api/presence/notice").status_code == 204
    assert ping(as_user(2, "Teo Tecnico"), "page-teo-01")["notice"] is None


def test_command_line(as_user, settings, monkeypatch, capsys):
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    assert cli.main(["who"]) == 0
    assert "No information" in capsys.readouterr().out
    t = as_user(2, "Teo Tecnico")
    ping(t, "page-teo-01", activity="sheet", detail="Alfa Patch", editing=True)
    assert cli.main(["who"]) == 0
    out = capsys.readouterr().out
    assert "Teo Tecnico" in out and "EDITING" in out and "Alfa Patch" in out
    assert cli.main(["wait-idle", "--timeout", "0"]) == 2           # Teo is editing
    ping(t, "page-teo-01", activity="calendar", editing=False)
    presence.write_file(presence.presence_file(settings.database_path), force=True)
    assert cli.main(["wait-idle", "--timeout", "0"]) == 0
    assert cli.main(["wait-idle", "--timeout", "0", "--nobody"]) == 2   # still connected
