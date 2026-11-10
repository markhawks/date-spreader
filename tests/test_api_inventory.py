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
