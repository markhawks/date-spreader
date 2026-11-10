"""Punto 6: indicatori per i filtri, stato intervento, ricerca, feed delle modifiche."""

from datetime import date

import pytest

from app.seed import seed

TODAY = date(2026, 11, 10)


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=TODAY)
    return client


def events(api, start="2026-10-01", end="2026-12-31"):
    return {e["event_date"]: e for e in api.get("/api/events", params={"start": start, "end": end}).json()}


def user_id(api, name):
    return next(u["id"] for u in api.get("/api/users").json() if u["display_name"] == name)


# --- indicatori per i filtri ----------------------------------------------------------


def test_event_summary_indicators(api):
    ev = events(api)
    beta = ev["2026-11-26"]
    assert (beta["server_count"], beta["check_ko"], beta["migration_failed"], beta["migrated"]) == (3, 1, 0, 0)
    alfa1 = ev["2026-10-18"]
    assert alfa1["migrated"] == 2


def test_event_summary_user_ids_include_participants_and_assignees(api):
    ev = events(api)
    # Beta: partecipante Giulia; tecnico assegnato Giulia
    assert ev["2026-11-26"]["user_ids"] == [user_id(api, "Giulia Gallo")]
    # Gamma: partecipanti Marco e Luca; tecnico Marco
    assert set(ev["2026-12-12"]["user_ids"]) == {user_id(api, "Marco Neri"), user_id(api, "Luca Bianchi")}


# --- stato intervento ---------------------------------------------------------------


def test_patch_event_status(api):
    ev = events(api)["2026-11-26"]
    detail = api.get(f"/api/events/{ev['id']}").json()
    res = api.patch(f"/api/events/{ev['id']}", json={"version": detail["version"], "status": "confermato"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "confermato"
    assert res.json()["version"] == detail["version"] + 1
    assert events(api)["2026-11-26"]["status"] == "confermato"


def test_patch_event_conflict(api):
    ev = events(api)["2026-11-26"]
    v = api.get(f"/api/events/{ev['id']}").json()["version"]
    assert api.patch(f"/api/events/{ev['id']}", json={"version": v, "notes": "A"}).status_code == 200
    res = api.patch(f"/api/events/{ev['id']}", json={"version": v, "status": "annullato"})
    assert res.status_code == 409
    assert res.json()["detail"]["current"]["notes"] == "A"
    assert res.json()["detail"]["current"]["status"] == "pianificato"


@pytest.mark.parametrize("payload", [{"status": "boh"}, {"status": None}, {"event_type": "trasloco"}, {"campo": 1}])
def test_patch_event_validation(api, payload):
    ev = events(api)["2026-11-26"]
    v = api.get(f"/api/events/{ev['id']}").json()["version"]
    assert api.patch(f"/api/events/{ev['id']}", json={"version": v, **payload}).status_code == 422


# --- ricerca ---------------------------------------------------------------------------


def test_search_by_hostname_finds_all_events(api):
    res = api.get("/api/search", params={"q": "DB01"}).json()
    hits = res["servers"]
    assert [h["hostname"] for h in hits] == ["alfa-db01.example.com"] * 2
    assert [h["event_date"] for h in hits] == ["2026-10-18", "2026-11-15"]
    assert hits[0]["migration_status"] == "rinviata"


def test_search_by_ip_and_os(api):
    assert [h["hostname"] for h in api.get("/api/search", params={"q": "203.0.113.4"}).json()["servers"]] == [
        "gamma-test01.example.com"
    ]
    assert len(api.get("/api/search", params={"q": "linux 7.9"}).json()["servers"]) == 3  # web02 + db01 ×2


def test_search_projects(api):
    res = api.get("/api/search", params={"q": "retail"}).json()
    assert [p["name"] for p in res["projects"]] == ["Gamma Retail"]


def test_search_like_wildcards_are_literal(api):
    """'%' e '_' non devono funzionare da jolly SQL."""
    assert api.get("/api/search", params={"q": "%%"}).json() == {"projects": [], "servers": []}
    assert api.get("/api/search", params={"q": "a_b"}).json()["servers"] == []


def test_search_needs_two_chars(api):
    assert api.get("/api/search", params={"q": "a"}).status_code == 422


# --- feed delle modifiche ----------------------------------------------------------------


def test_changes_feed(api):
    start = api.get("/api/changes").json()
    assert start["events"] == []
    since = start["last_id"]
    assert since == 0  # cronologia vuota dopo il seed
    assert api.get("/api/changes", params={"since": since}).json()["events"] == []

    beta = events(api)["2026-11-26"]
    row = api.get(f"/api/events/{beta['id']}").json()["servers"][0]
    api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "notes": "x"})

    res = api.get("/api/changes", params={"since": since}).json()
    assert res["last_id"] > since
    assert res["events"] == [{"id": beta["id"], "event_date": "2026-11-26"}]
    # nessuna novità dopo l'ultimo id
    assert api.get("/api/changes", params={"since": res["last_id"]}).json()["events"] == []


def test_changes_feed_server_field_touches_all_its_events(api):
    since = api.get("/api/changes").json()["last_id"]
    ev = events(api)
    detail = api.get(f"/api/events/{ev['2026-11-15']['id']}").json()
    row = next(r for r in detail["servers"] if r["hostname"].startswith("alfa-db01"))
    api.patch(
        f"/api/event-servers/{row['id']}",
        json={"version": row["version"], "server_version": row["server_version"], "ip_address": "192.0.2.99"},
    )
    dates = {e["event_date"] for e in api.get("/api/changes", params={"since": since}).json()["events"]}
    assert dates == {"2026-10-18", "2026-11-15"}  # alfa-db01 è in entrambi
