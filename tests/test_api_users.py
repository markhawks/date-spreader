"""Gestione tecnici e partecipanti degli interventi."""

from datetime import date

import pytest

from app.seed import seed


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def names(api, **params):
    return [u["display_name"] for u in api.get("/api/users", params=params).json()]


def event_on(api, day):
    eid = api.get("/api/events", params={"start": day, "end": day}).json()[0]["id"]
    return api.get(f"/api/events/{eid}").json()


# --- tecnici ------------------------------------------------------------------------


def test_create_user(api):
    res = api.post("/api/users", json={"display_name": "  Paolo   Rossi ", "email": "Paolo.Rossi@Example.com"})
    assert res.status_code == 201, res.text
    u = res.json()
    assert (u["display_name"], u["email"], u["role"], u["is_active"]) == (
        "Paolo Rossi", "paolo.rossi@example.com", "tecnico", True
    )
    assert "Paolo Rossi" in names(api)


def test_create_user_without_email(api):
    u = api.post("/api/users", json={"display_name": "Anna Blu"}).json()
    assert u["email"] is None
    # due tecnici senza email non vanno in conflitto
    assert api.post("/api/users", json={"display_name": "Bruno Grigi"}).status_code == 201


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"display_name": "sara verdi"}, 409),            # nome già presente
        ({"display_name": "X", "email": "luca.bianchi@example.com"}, 409),  # email già usata
        ({"display_name": "  "}, 422),
        ({"display_name": "X", "email": "non-una-email"}, 422),
        ({"display_name": "X", "role": "capo"}, 422),
    ],
)
def test_create_user_validation(api, payload, code):
    assert api.post("/api/users", json=payload).status_code == code


def test_deactivate_user_hides_it_from_menus(api):
    u = next(x for x in api.get("/api/users").json() if x["display_name"] == "Giulia Gallo")
    res = api.patch(f"/api/users/{u['id']}", json={"version": u["version"], "is_active": False})
    assert res.status_code == 200
    assert "Giulia Gallo" not in names(api)
    assert "Giulia Gallo" in names(api, all="true")
    # resta visibile dove era già assegnata
    row = next(r for r in event_on(api, "2026-11-26")["servers"] if r["assigned_user"])
    assert row["assigned_user"]["display_name"] == "Giulia Gallo"


def test_rename_user_and_conflict(api):
    u = next(x for x in api.get("/api/users").json() if x["display_name"] == "Marco Neri")
    url = f"/api/users/{u['id']}"
    ok = api.patch(url, json={"version": u["version"], "display_name": "Marco Neri Jr", "role": "coordinatore"})
    assert ok.status_code == 200
    assert ok.json()["version"] == u["version"] + 1
    stale = api.patch(url, json={"version": u["version"], "display_name": "Altro"})
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["display_name"] == "Marco Neri Jr"
    dup = api.patch(url, json={"version": ok.json()["version"], "display_name": "Sara Verdi"})
    assert dup.status_code == 409


def test_cannot_assign_inactive_user_to_row(api):
    u = api.post("/api/users", json={"display_name": "Temporaneo"}).json()
    api.patch(f"/api/users/{u['id']}", json={"version": u["version"], "is_active": False})
    row = event_on(api, "2026-11-26")["servers"][0]
    res = api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "assigned_user_id": u["id"]})
    assert res.status_code == 422


# --- partecipanti -------------------------------------------------------------------


def test_set_participants(api):
    ev = event_on(api, "2026-11-26")
    users = {u["display_name"]: u["id"] for u in api.get("/api/users").json()}
    res = api.put(f"/api/events/{ev['id']}/participants", json={"user_ids": [users["Sara Verdi"], users["Luca Bianchi"], users["Sara Verdi"]]})
    assert res.status_code == 200, res.text
    assert [p["display_name"] for p in res.json()] == ["Luca Bianchi", "Sara Verdi"]  # senza doppioni
    assert [p["display_name"] for p in event_on(api, "2026-11-26")["participants"]] == ["Luca Bianchi", "Sara Verdi"]
    # il filtro per tecnico del calendario vede i nuovi partecipanti
    summary = api.get("/api/events", params={"start": "2026-11-26", "end": "2026-11-26"}).json()[0]
    assert users["Luca Bianchi"] in summary["user_ids"]


def test_participants_keep_inactive_but_reject_new_inactive(api):
    ev = event_on(api, "2026-11-26")  # partecipante: Giulia
    giulia = ev["participants"][0]
    g = next(u for u in api.get("/api/users").json() if u["id"] == giulia["id"])
    api.patch(f"/api/users/{g['id']}", json={"version": g["version"], "is_active": False})
    other = next(u for u in api.get("/api/users").json() if u["display_name"] == "Sara Verdi")
    # Giulia (disattivata) può restare
    assert api.put(f"/api/events/{ev['id']}/participants", json={"user_ids": [g["id"], other["id"]]}).status_code == 200
    # ma non si può aggiungere a un altro intervento
    ev2 = event_on(api, "2026-12-12")
    assert api.put(f"/api/events/{ev2['id']}/participants", json={"user_ids": [g["id"]]}).status_code == 422


def test_clear_participants_and_unknown_ids(api):
    ev = event_on(api, "2026-11-15")
    assert api.put(f"/api/events/{ev['id']}/participants", json={"user_ids": []}).json() == []
    assert api.put(f"/api/events/{ev['id']}/participants", json={"user_ids": [9999]}).status_code == 422
    assert api.put("/api/events/9999/participants", json={"user_ids": []}).status_code == 404


def test_new_project_with_participants(api):
    users = {u["display_name"]: u["id"] for u in api.get("/api/users").json()}
    res = api.post("/api/projects", json={
        "name": "Delta", "first_event": {"event_date": "2026-11-20", "participant_ids": [users["Marco Neri"]]},
    })
    assert res.status_code == 201, res.text
    assert [p["display_name"] for p in event_on(api, "2026-11-20")["participants"]] == ["Marco Neri"]
    bad = api.post("/api/projects", json={"name": "Eps", "first_event": {"event_date": "2026-11-21", "participant_ids": [999]}})
    assert bad.status_code == 422
    assert "Eps" not in [p["name"] for p in api.get("/api/projects").json()]  # nessun progetto a metà


def test_changes_feed_signals_users(api):
    since = api.get("/api/changes").json()["last_id"]
    api.post("/api/users", json={"display_name": "Nuovo Tecnico"})
    res = api.get("/api/changes", params={"since": since}).json()
    assert res["users_changed"] is True and res["projects_changed"] is False

    since = res["last_id"]
    ev = event_on(api, "2026-11-26")
    api.put(f"/api/events/{ev['id']}/participants", json={"user_ids": []})
    res = api.get("/api/changes", params={"since": since}).json()
    assert res["users_changed"] is False
    assert [e["event_date"] for e in res["events"]] == ["2026-11-26"]


# --- tecnico al volo dal menu dei partecipanti ------------------------------------------


def test_add_technician_creates_or_reuses(api):
    res = api.post("/api/users/technicians", json={"display_name": "  Elena   Conti "})
    assert res.status_code == 201, res.text
    new = res.json()
    assert (new["display_name"], new["role"], new["email"], new["is_active"]) == ("Elena Conti", "tecnico", None, True)
    assert "Elena Conti" in names(api)
    # stesso nome (maiuscole e spazi diversi): riusa quello esistente, niente doppioni
    again = api.post("/api/users/technicians", json={"display_name": "elena conti"})
    assert again.status_code == 200 and again.json()["id"] == new["id"]
    assert names(api, all=True).count("Elena Conti") == 1
    # un tecnico già presente nei dati di esempio
    assert api.post("/api/users/technicians", json={"display_name": "Marco Neri"}).status_code == 200
    # il nuovo tecnico si può subito aggiungere ai partecipanti
    ev = event_on(api, "2026-11-26")
    ids = [p["id"] for p in ev["participants"]] + [new["id"]]
    res = api.put(f"/api/events/{ev['id']}/participants", json={"user_ids": ids})
    assert res.status_code == 200, res.text


def test_add_technician_validation_and_inactive(api):
    assert api.post("/api/users/technicians", json={"display_name": "   "}).status_code == 422
    assert api.post("/api/users/technicians", json={"display_name": "X", "role": "admin"}).status_code == 422
    u = api.post("/api/users/technicians", json={"display_name": "Ugo Ferri"}).json()
    api.patch(f"/api/users/{u['id']}", json={"version": u["version"], "is_active": False})
    res = api.post("/api/users/technicians", json={"display_name": "UGO FERRI"})
    assert res.status_code == 409 and "deactivated" in res.json()["detail"]["message"]
