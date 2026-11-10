"""Modifica del progetto, nuovi interventi, spostamento ed eliminazione di interventi."""

from datetime import date

import pytest

from app.seed import seed


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def project(api, name):
    return next(p for p in api.get("/api/projects").json() if p["name"] == name)


def event_on(api, day):
    eid = api.get("/api/events", params={"start": day, "end": day}).json()[0]["id"]
    return api.get(f"/api/events/{eid}").json()


# --- progetto -------------------------------------------------------------------------


def test_edit_project(api):
    p = project(api, "Gamma Retail")
    res = api.patch(f"/api/projects/{p['id']}", json={
        "version": p["version"], "name": "Gamma Retail Italia", "description": "Nuova descrizione", "status": "sospeso",
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["name"], body["description"], body["status"]) == ("Gamma Retail Italia", "Nuova descrizione", "sospeso")
    assert body["version"] == p["version"] + 1
    assert body["events"][0]["server_count"] == 3


def test_edit_project_conflicts_and_validation(api):
    p = project(api, "Gamma Retail")
    url = f"/api/projects/{p['id']}"
    assert api.patch(url, json={"version": p["version"], "name": "beta assicurazioni"}).status_code == 409  # nome usato
    assert api.patch(url, json={"version": p["version"], "name": "  "}).status_code == 422
    assert api.patch(url, json={"version": p["version"], "status": "boh"}).status_code == 422
    assert api.patch(url, json={"version": p["version"], "description": "A"}).status_code == 200
    stale = api.patch(url, json={"version": p["version"], "description": "B"})
    assert stale.status_code == 409 and stale.json()["detail"]["current"]["description"] == "A"
    assert api.patch("/api/projects/9999", json={"version": 1, "name": "X"}).status_code == 404


# --- nuovo intervento --------------------------------------------------------------------


def test_add_event_to_existing_project(api):
    p = project(api, "Gamma Retail")
    users = {u["display_name"]: u["id"] for u in api.get("/api/users").json()}
    res = api.post(f"/api/projects/{p['id']}/events", json={
        "event_date": "2027-01-20", "title": "Gamma – seconda finestra", "event_type": "upgrade",
        "start_time": "20:00", "end_time": "23:00", "participant_ids": [users["Marco Neri"]],
    })
    assert res.status_code == 201, res.text
    ev = res.json()
    assert (ev["project"]["name"], ev["event_type"], ev["status"]) == ("Gamma Retail", "upgrade", "pianificato")
    assert [x["display_name"] for x in ev["participants"]] == ["Marco Neri"]
    assert [e["event_date"] for e in project(api, "Gamma Retail")["events"]] == ["2026-12-12", "2027-01-20"]


@pytest.mark.parametrize("payload", [
    {}, {"event_date": "non-data"}, {"event_date": "2027-01-20", "start_time": "22:00", "end_time": "21:00"},
    {"event_date": "2027-01-20", "event_type": "trasloco"}, {"event_date": "2027-01-20", "participant_ids": [999]},
])
def test_add_event_validation(api, payload):
    p = project(api, "Gamma Retail")
    assert api.post(f"/api/projects/{p['id']}/events", json=payload).status_code == 422
    assert api.post("/api/projects/9999/events", json={"event_date": "2027-01-20"}).status_code == 404


# --- modifica intervento ------------------------------------------------------------------


def test_move_event_date_moves_rows_planned_date(api):
    ev = event_on(api, "2026-12-12")
    res = api.patch(f"/api/events/{ev['id']}", json={
        "version": ev["version"], "event_date": "2026-12-19", "title": "Gamma – rinviata", "start_time": "21:00",
    })
    assert res.status_code == 200, res.text
    moved = res.json()
    assert moved["event_date"] == "2026-12-19" and moved["title"] == "Gamma – rinviata"
    assert {r["planned_date"] for r in moved["servers"]} == {"2026-12-19"}
    assert api.get("/api/events", params={"start": "2026-12-12", "end": "2026-12-12"}).json() == []


def test_event_times_checked_against_existing_values(api):
    ev = event_on(api, "2026-11-26")  # 18:30–22:00
    res = api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "end_time": "17:00"})
    assert res.status_code == 422
    res = api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "start_time": "", "end_time": ""})
    assert res.status_code == 200 and res.json()["start_time"] is None


# --- eliminazione ---------------------------------------------------------------------------


def test_admin_deletes_event_with_servers_servers_stay(api):
    ev = event_on(api, "2026-11-26")
    hosts = {r["hostname"] for r in ev["servers"]}
    assert api.delete(f"/api/events/{ev['id']}", params={"version": ev["version"] + 5}).status_code == 409  # versione vecchia
    assert api.delete(f"/api/events/{ev['id']}", params={"version": ev["version"]}).status_code == 204
    assert api.get(f"/api/events/{ev['id']}").status_code == 404
    remaining = {s["hostname"] for s in api.get("/api/servers").json()["servers"]}
    assert hosts <= remaining  # i server restano in anagrafica
    assert api.delete("/api/events/9999", params={"version": 1}).status_code == 404


# --- feed per gli altri utenti -----------------------------------------------------------------


def test_changes_feed_for_moved_and_deleted_events(api):
    since = api.get("/api/changes").json()["last_id"]
    ev = event_on(api, "2026-12-12")
    api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "event_date": "2027-01-09"})
    res = api.get("/api/changes", params={"since": since}).json()
    assert res["projects_changed"] is True
    assert [e["event_date"] for e in res["events"]] == ["2027-01-09"]  # nuova data
    assert res["dates"] == ["2026-12-12"]                              # vecchia data da ridisegnare

    since = res["last_id"]
    p = project(api, "Beta Assicurazioni")
    new = api.post(f"/api/projects/{p['id']}/events", json={"event_date": "2027-02-01"}).json()
    api.delete(f"/api/events/{new['id']}", params={"version": new["version"]})
    res = api.get("/api/changes", params={"since": since}).json()
    assert res["projects_changed"] is True and "2027-02-01" in res["dates"]


def test_status_change_does_not_reload_projects(api):
    since = api.get("/api/changes").json()["last_id"]
    ev = event_on(api, "2026-11-26")
    api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "status": "confermato"})
    assert api.get("/api/changes", params={"since": since}).json()["projects_changed"] is False
