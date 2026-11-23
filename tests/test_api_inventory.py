"""Anagrafica server: i server restano nel DB, si cercano e hanno uno storico."""

from datetime import date, timedelta

import pytest

from app.seed import seed

TODAY = date.today()


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=TODAY)
    return client


def find(api, q=None, **params):
    return api.get("/api/servers", params={"q": q, **params} if q else params).json()


def test_list_all_servers(api):
    res = find(api)
    assert res["total"] == 10 and len(res["servers"]) == 10
    assert [s["hostname"] for s in res["servers"]] == sorted(s["hostname"] for s in res["servers"])


def test_search_by_hostname_ip_os_env_kernel(api):
    assert [s["hostname"] for s in find(api, "DB01")["servers"]] == ["alfa-db01.example.com"]
    assert [s["hostname"] for s in find(api, "198.51.100.5")["servers"]] == ["beta-dev01.example.com"]
    assert find(api, "linux 7.9")["total"] == 2           # alfa-web02, alfa-db01
    assert find(api, "dev")["total"] >= 1                  # ambiente DEV
    assert find(api, "1160.119")["total"] == 2             # kernel attuale RHEL 7
    assert find(api, "%")["total"] == 0                    # nessun jolly SQL


def test_summary_counts_and_dates(api):
    db01 = find(api, "alfa-db01")["servers"][0]
    assert db01["event_count"] == 2
    # nel seed: un intervento il mese scorso (rinviato) e uno nel mese corrente
    assert db01["last_event_date"] is not None or db01["next_event_date"] is not None


def test_limit_and_total(api):
    res = find(api, limit=3)
    assert res["total"] == 10 and len(res["servers"]) == 3


def test_history_newest_first(api):
    db01 = find(api, "alfa-db01")["servers"][0]
    res = api.get(f"/api/servers/{db01['id']}")
    assert res.status_code == 200
    hist = res.json()["history"]
    assert [h["project_name"] for h in hist] == ["Alfa Logistica"] * 2
    assert hist[0]["event_date"] > hist[1]["event_date"]
    assert hist[1]["migration_status"] == "rinviata"
    assert hist[1]["assigned_user"] == "Marco Neri"


def test_server_stays_after_removal_from_all_events_with_history_of_changes(api):
    db01 = find(api, "alfa-db01")["servers"][0]
    # modifica dell'IP (finisce nello storico delle modifiche)
    ev = api.get(f"/api/servers/{db01['id']}").json()["history"][0]
    detail = api.get(f"/api/events/{ev['event_id']}").json()
    row = next(r for r in detail["servers"] if r["hostname"].startswith("alfa-db01"))
    api.patch(f"/api/event-servers/{row['id']}",
              json={"version": row["version"], "server_version": row["server_version"], "ip_address": "192.0.2.99"})
    # tolto da tutti gli interventi
    for h in api.get(f"/api/servers/{db01['id']}").json()["history"]:
        d = api.get(f"/api/events/{h['event_id']}").json()
        r = next(x for x in d["servers"] if x["id"] == h["row_id"])
        assert api.delete(f"/api/event-servers/{r['id']}", params={"version": r["version"]}).status_code == 204

    still = find(api, "alfa-db01")["servers"]
    assert len(still) == 1 and still[0]["event_count"] == 0 and still[0]["ip_address"] == "192.0.2.99"
    info = api.get(f"/api/servers/{db01['id']}").json()
    assert info["history"] == []
    assert [(c["field"], c["old_value"], c["new_value"]) for c in info["changes"]] == [
        ("ip_address", "192.0.2.31", "192.0.2.99")
    ]
    # e si può rimettere in un intervento futuro, con i suoi dati
    gamma = api.get("/api/events", params={"start": TODAY - timedelta(days=60), "end": TODAY + timedelta(days=60)}).json()
    target = next(e for e in gamma if e["project_name"] == "Gamma Retail")
    res = api.post(f"/api/events/{target['id']}/servers", json={"hostname": "alfa-db01.example.com"})
    assert res.status_code == 201 and res.json()["server_reused"] is True
    assert res.json()["ip_address"] == "192.0.2.99"


def test_unknown_server(api):
    assert api.get("/api/servers/9999").status_code == 404


# --- changes and deletion from the inventory ---------------------------------------------------

def test_edit_server_applies_to_its_interventions(api):
    db01 = find(api, "alfa-db01")["servers"][0]
    res = api.patch(f"/api/servers/{db01['id']}", json={
        "version": db01["version"], "hostname": "Alfa-DB11.example.com", "ip_address": "192.0.2.211",
        "environment": "TEST", "location": "Room 2",
    })
    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["hostname"], out["ip_address"], out["environment"], out["location"]) == (
        "alfa-db11.example.com", "192.0.2.211", "TEST", "Room 2")
    assert out["version"] > db01["version"] and out["event_count"] == db01["event_count"]
    # the interventions show the new values: the server is the same row
    detail = api.get(f"/api/servers/{db01['id']}").json()
    for h in detail["history"]:
        rows = api.get(f"/api/events/{h['event_id']}").json()["servers"]
        row = next(r for r in rows if r["id"] == h["row_id"])
        assert (row["hostname"], row["ip_address"]) == ("alfa-db11.example.com", "192.0.2.211")
    assert {c["field"] for c in detail["changes"]} >= {"hostname", "ip_address", "environment", "location"}


def test_edit_server_checks(api):
    servers = find(api)["servers"]
    a, b = servers[0], servers[1]
    url = f"/api/servers/{a['id']}"
    assert api.patch(url, json={"version": a["version"], "hostname": b["hostname"]}).status_code == 422
    assert api.patch(url, json={"version": a["version"], "ip_address": "not-an-ip"}).status_code == 422
    assert api.patch(url, json={"version": a["version"], "operating_system": "Plan 9"}).status_code == 422
    assert api.patch(url, json={"version": a["version"], "environment": "QA"}).status_code == 422
    stale = api.patch(url, json={"version": a["version"] - 1, "location": "x"})
    assert stale.status_code == 409 and stale.json()["detail"]["current"]["hostname"] == a["hostname"]
    assert api.patch("/api/servers/99999", json={"version": 1}).status_code == 404


def test_delete_only_servers_in_no_intervention(api):
    used = next(s for s in find(api)["servers"] if s["event_count"])
    res = api.delete(f"/api/servers/{used['id']}", params={"version": used["version"]})
    assert res.status_code == 409 and used["hostname"] in res.json()["detail"]["message"]

    # a server whose only intervention row has been removed: now it can be deleted
    detail = api.get(f"/api/servers/{used['id']}").json()
    for h in detail["history"]:
        rows = api.get(f"/api/events/{h['event_id']}").json()["servers"]
        row = next(r for r in rows if r["id"] == h["row_id"])
        assert api.delete(f"/api/event-servers/{row['id']}", params={"version": row["version"]}).status_code == 204
    fresh = find(api, used["hostname"])["servers"][0]
    assert fresh["event_count"] == 0
    assert api.delete(f"/api/servers/{fresh['id']}", params={"version": fresh["version"] + 1}).status_code == 409
    assert api.delete(f"/api/servers/{fresh['id']}", params={"version": fresh["version"]}).status_code == 204
    assert find(api, used["hostname"])["total"] == 0
    assert api.get(f"/api/servers/{fresh['id']}").status_code == 404


def test_customers_of_each_server_and_filter(api):
    servers = find(api)["servers"]
    assert all(isinstance(s["customers"], list) for s in servers)
    with_customer = [s for s in servers if s["customers"]]
    assert with_customer
    cust = with_customer[0]["customers"][0]
    only = find(api, customer_id=cust["id"])
    assert only["total"] == sum(1 for s in servers if any(c["id"] == cust["id"] for c in s["customers"]))
    assert all(any(c["id"] == cust["id"] for c in s["customers"]) for s in only["servers"])
    none = find(api, customer_id=0)
    assert all(not s["customers"] for s in none["servers"])
    assert api.get(f"/api/servers/{with_customer[0]['id']}").json()["server"]["customers"] == with_customer[0]["customers"]


def test_steamroller_inventory_is_a_server_field_with_known_values(api):
    db01 = find(api, "alfa-db01")["servers"][0]
    res = api.patch(f"/api/servers/{db01['id']}", json={"version": db01["version"], "steamroller_inventory": " Linux-Prod "})
    assert res.status_code == 200 and res.json()["steamroller_inventory"] == "Linux-Prod"
    # the same value in every intervention of the server, and proposed in the menus
    detail = api.get(f"/api/servers/{db01['id']}").json()
    for h in detail["history"]:
        row = next(r for r in api.get(f"/api/events/{h['event_id']}").json()["servers"] if r["id"] == h["row_id"])
        assert row["steamroller_inventory"] == "Linux-Prod"
    other = find(api, "beta-app01")["servers"][0]
    api.patch(f"/api/servers/{other['id']}", json={"version": other["version"], "steamroller_inventory": "linux-prod"})
    assert api.get("/api/options").json()["inventories"] == ["Linux-Prod"]        # no duplicates by case
    assert find(api, "linux-prod")["total"] == 2                                  # searchable
