"""Creazione di un nuovo progetto (con primo intervento facoltativo)."""

from datetime import date

import pytest

from app.seed import seed


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def test_create_project_without_event(api):
    res = api.post("/api/projects", json={"name": "  Delta   Energia ", "description": "Nuovo cliente"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Delta Energia"  # spazi normalizzati
    assert body["status"] == "attivo"
    assert body["events"] == []
    names = [p["name"] for p in api.get("/api/projects").json()]
    assert "Delta Energia" in names


def test_create_project_with_first_event(api):
    res = api.post(
        "/api/projects",
        json={
            "name": "Epsilon Banca",
            "first_event": {
                "event_date": "2026-11-20",
                "title": "Epsilon – migrazione RHEL 8",
                "event_type": "migrazione",
                "start_time": "21:00",
                "end_time": "23:30",
            },
        },
    )
    assert res.status_code == 201, res.text
    ev = res.json()["events"]
    assert [(e["event_date"], e["status"]) for e in ev] == [("2026-11-20", "pianificato")]
    cal = api.get("/api/events", params={"start": "2026-11-20", "end": "2026-11-20"}).json()
    assert cal[0]["project_name"] == "Epsilon Banca"
    assert cal[0]["start_time"] == "21:00:00"
    assert cal[0]["server_count"] == 0


def test_duplicate_name_is_rejected_case_insensitive(api):
    res = api.post("/api/projects", json={"name": "alfa logistica"})
    assert res.status_code == 409
    assert "esiste già" in res.json()["detail"]["message"].lower()


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   "},
        {"name": "X", "status": "boh"},
        {"name": "X", "first_event": {"title": "senza data"}},
        {"name": "X", "first_event": {"event_date": "2026-11-20", "start_time": "22:00", "end_time": "21:00"}},
        {"name": "X", "first_event": {"event_date": "2026-11-20", "event_type": "trasloco"}},
        {"name": "X", "campo": 1},
    ],
)
def test_create_project_validation(api, payload):
    assert api.post("/api/projects", json=payload).status_code == 422


def test_empty_times_are_accepted(api):
    res = api.post("/api/projects", json={"name": "Zeta", "first_event": {"event_date": "2026-12-01", "start_time": "", "end_time": ""}})
    assert res.status_code == 201, res.text


def test_changes_feed_signals_new_projects(api):
    since = api.get("/api/changes").json()["last_id"]
    api.post("/api/projects", json={"name": "Eta"})
    res = api.get("/api/changes", params={"since": since}).json()
    assert res["projects_changed"] is True
    assert res["events"] == []

    since = res["last_id"]
    api.post("/api/projects", json={"name": "Theta", "first_event": {"event_date": "2026-11-30"}})
    res = api.get("/api/changes", params={"since": since}).json()
    assert res["projects_changed"] is True
    assert [e["event_date"] for e in res["events"]] == ["2026-11-30"]


def test_row_edit_does_not_signal_projects(api):
    since = api.get("/api/changes").json()["last_id"]
    ev = api.get("/api/events", params={"start": "2026-11-26", "end": "2026-11-26"}).json()[0]
    row = api.get(f"/api/events/{ev['id']}").json()["servers"][0]
    api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "notes": "x"})
    assert api.get("/api/changes", params={"since": since}).json()["projects_changed"] is False
