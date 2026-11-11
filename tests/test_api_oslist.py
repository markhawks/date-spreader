"""Elenco dei sistemi operativi: default, ordinamento, gestione admin, validazione sui server."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.seed import seed
from tests.test_auth import ADMIN_PW, TECH_PW, accounts, login  # noqa: F401  (fixture riusata)

RHEL = "Red Hat Enterprise Linux"


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def names(api, **params):
    return [o["name"] for o in api.get("/api/operating-systems", params=params).json()]


def test_defaults_from_migration(api):
    assert names(api) == [f"{RHEL} 7.9", f"{RHEL} 8.10", f"{RHEL} 9.8", f"{RHEL} 10.2"]


def test_new_versions_are_sorted_numerically(api):
    for major, minor in ((9, 9), (10, 3), (8, 6), (11, 0)):
        assert api.post("/api/operating-systems", json={"major": major, "minor": minor}).status_code == 201
    api.post("/api/operating-systems", json={"family": "Rocky Linux", "major": 9, "minor": 4})
    assert names(api) == [
        f"{RHEL} 7.9", f"{RHEL} 8.6", f"{RHEL} 8.10", f"{RHEL} 9.8", f"{RHEL} 9.9",
        f"{RHEL} 10.2", f"{RHEL} 10.3", f"{RHEL} 11.0", "Rocky Linux 9.4",
    ]


def test_duplicates_rejected(api):
    assert api.post("/api/operating-systems", json={"major": 9, "minor": 8}).status_code == 409
    assert api.post("/api/operating-systems", json={"family": "red hat enterprise linux", "major": 9, "minor": 8}).status_code == 409
    assert api.post("/api/operating-systems", json={"major": 12}).status_code == 201       # senza minor
    assert api.post("/api/operating-systems", json={"major": 12}).status_code == 409
    assert api.post("/api/operating-systems", json={"major": -1}).status_code == 422
    assert api.post("/api/operating-systems", json={"family": " ", "major": 1}).status_code == 422


def _beta_row(api):
    ev = api.get("/api/events", params={"start": "2026-11-26", "end": "2026-11-26"}).json()[0]
    return api.get(f"/api/events/{ev['id']}").json()["servers"][0]


def test_server_os_must_be_in_list(api):
    row = _beta_row(api)  # "Red Hat Enterprise Linux 8.8" (seed): non in elenco, ma resta
    url = f"/api/event-servers/{row['id']}"
    body = {"version": row["version"], "server_version": row["server_version"]}
    bad = api.patch(url, json={**body, "operating_system": "Windows 95"})
    assert bad.status_code == 422 and "is not in the operating system list" in bad.text
    ok = api.patch(url, json={**body, "operating_system": f"{RHEL} 9.8"})
    assert ok.status_code == 200 and ok.json()["operating_system"] == f"{RHEL} 9.8"
    # svuotare è sempre permesso
    ok2 = api.patch(url, json={"version": ok.json()["version"], "server_version": ok.json()["server_version"], "operating_system": ""})
    assert ok2.status_code == 200 and ok2.json()["operating_system"] is None


def test_new_server_with_os(api):
    ev = api.get("/api/events", params={"start": "2026-12-12", "end": "2026-12-12"}).json()[0]
    assert api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "n1.example.com", "operating_system": "Boh"}).status_code == 422
    assert api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "n1.example.com", "operating_system": f"{RHEL} 10.2"}).status_code == 201


def test_deactivate_hides_but_keeps_servers(api):
    row = _beta_row(api)
    api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "server_version": row["server_version"], "operating_system": f"{RHEL} 7.9"})
    item = next(o for o in api.get("/api/operating-systems").json() if o["name"] == f"{RHEL} 7.9")
    assert item["server_count"] == 3  # 2 server di esempio con RHEL 7.9 + quello appena modificato
    assert api.patch(f"/api/operating-systems/{item['id']}", json={"is_active": False}).json()["is_active"] is False
    assert f"{RHEL} 7.9" not in names(api) and f"{RHEL} 7.9" in names(api, all="true")
    assert _beta_row(api)["operating_system"] == f"{RHEL} 7.9"   # il server lo conserva
    # non si può più assegnare a un altro server, ma il valore attuale si può lasciare invariato
    row = _beta_row(api)
    same = api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "server_version": row["server_version"], "operating_system": f"{RHEL} 7.9", "ip_address": "198.51.100.200"})
    assert same.status_code == 200


def test_delete_only_unused(api):
    items = {o["name"]: o for o in api.get("/api/operating-systems").json()}
    row = _beta_row(api)
    api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "server_version": row["server_version"], "operating_system": f"{RHEL} 8.10"})
    assert api.delete(f"/api/operating-systems/{items[f'{RHEL} 8.10']['id']}").status_code == 409
    assert api.delete(f"/api/operating-systems/{items[f'{RHEL} 10.2']['id']}").status_code == 204
    assert f"{RHEL} 10.2" not in names(api, all="true")


def test_only_admins_manage_the_list(settings, engine, accounts):  # noqa: F811
    from app.main import create_app

    with TestClient(create_app(settings), headers={"X-Requested-With": "datespreader"}) as c:
        login(c, "tecnico1", TECH_PW)
        assert c.get("/api/operating-systems").status_code == 200
        assert c.post("/api/operating-systems", json={"major": 9, "minor": 9}).status_code == 403
        first = c.get("/api/operating-systems").json()[0]["id"]
        assert c.patch(f"/api/operating-systems/{first}", json={"is_active": False}).status_code == 403
        assert c.delete(f"/api/operating-systems/{first}").status_code == 403


# --- SO target (per riga d'intervento) ----------------------------------------------------


def test_target_os_per_row(api):
    row = _beta_row(api)
    url = f"/api/event-servers/{row['id']}"
    assert row["target_operating_system"] is None
    bad = api.patch(url, json={"version": row["version"], "target_operating_system": "Windows 11"})
    assert bad.status_code == 422
    ok = api.patch(url, json={"version": row["version"], "target_operating_system": f"{RHEL} 9.8"})
    assert ok.status_code == 200 and ok.json()["target_operating_system"] == f"{RHEL} 9.8"
    assert ok.json()["server_version"] == row["server_version"]  # dato della riga, non del server
    # nello storico del server
    hist = api.get(f"/api/servers/{row['server_id']}").json()["history"]
    assert hist[0]["target_operating_system"] == f"{RHEL} 9.8"


def test_target_os_on_new_row_and_usage_count(api):
    ev = api.get("/api/events", params={"start": "2026-12-12", "end": "2026-12-12"}).json()[0]
    bad = api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "t1.example.com", "target_operating_system": "Boh"})
    assert bad.status_code == 422
    res = api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "t1.example.com", "target_operating_system": f"{RHEL} 10.2"})
    assert res.status_code == 201 and res.json()["target_operating_system"] == f"{RHEL} 10.2"
    item = next(o for o in api.get("/api/operating-systems").json() if o["name"] == f"{RHEL} 10.2")
    assert item["server_count"] == 1  # usato come SO target: non eliminabile
    assert api.delete(f"/api/operating-systems/{item['id']}").status_code == 409


def test_new_minor_versions_selectable_as_target(api):
    for minor in (5, 6):
        assert api.post("/api/operating-systems", json={"major": 9, "minor": minor}).status_code == 201
    assert names(api)[2:5] == [f"{RHEL} 9.5", f"{RHEL} 9.6", f"{RHEL} 9.8"]
    row = _beta_row(api)
    res = api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "target_operating_system": f"{RHEL} 9.6"})
    assert res.status_code == 200
