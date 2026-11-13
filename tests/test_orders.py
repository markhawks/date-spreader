"""Commesse (job numbers): stored on the customer, chosen or created from the intervention."""

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


def orders(api, customer_id):
    return api.get(f"/api/customers/{customer_id}/orders").json()


def test_sample_data_has_commesse(api):
    gamma = project(api, "Gamma Retail")
    assert [o["code"] for o in orders(api, gamma["customer_id"])] == ["C-2026-014", "C-2026-021"]
    events = api.get("/api/events", params={"start": "2026-10-01", "end": "2026-12-31"}).json()
    assert {e["order_code"] for e in events} == {"C-2026-014", "C-2026-021", "BA-2026/07"}


def test_new_code_is_stored_on_the_customer_and_reused(api):
    gamma = project(api, "Gamma Retail")
    cid = gamma["customer_id"]
    ev = api.post(f"/api/projects/{gamma['id']}/events", json={"event_date": "2027-01-10", "order_code": "  C-2027-001 "}).json()
    assert ev["order_code"] == "C-2027-001"
    assert "C-2027-001" in [o["code"] for o in orders(api, cid)]
    # same code in another case: the existing commessa is used, not a duplicate
    ev2 = api.post(f"/api/projects/{gamma['id']}/events", json={"event_date": "2027-01-11", "order_code": "c-2027-001"}).json()
    assert ev2["order_code"] == "C-2027-001"
    row = next(o for o in orders(api, cid) if o["code"] == "C-2027-001")
    assert row["event_count"] == 2
    # the other projects of the same customer see it too
    alfa = project(api, "Alfa Logistica")
    assert alfa["customer_id"] == cid and "C-2027-001" in [o["code"] for o in orders(api, alfa["customer_id"])]


def test_edit_clear_and_duplicate(api):
    gamma = project(api, "Gamma Retail")
    ev = api.post(f"/api/projects/{gamma['id']}/events", json={"event_date": "2027-02-01"}).json()
    assert ev["order_code"] is None
    ev = api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "order_code": "C-2027-050"}).json()
    assert ev["order_code"] == "C-2027-050"
    dup = api.post(f"/api/events/{ev['id']}/duplicate", json={"event_date": "2027-02-08"}).json()
    assert dup["order_code"] == "C-2027-050"
    ev = api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "order_code": ""}).json()
    assert ev["order_code"] is None
    # the change is in the audit log of the intervention
    since = 0
    feed = api.get("/api/changes", params={"since": since}).json()
    assert any(e["id"] == ev["id"] for e in feed["events"])


def test_project_without_customer_cannot_have_a_commessa(api):
    p = api.post("/api/projects", json={"name": "Senza cliente"}).json()
    res = api.post(f"/api/projects/{p['id']}/events", json={"event_date": "2027-03-01", "order_code": "X-1"})
    assert res.status_code == 422
    assert api.get("/api/customers/999999/orders").status_code == 404


def test_export_import_keeps_the_commessa(api):
    gamma = project(api, "Gamma Retail")
    data = api.get(f"/api/export/projects/{gamma['id']}").json()
    assert data["projects"][0]["events"][0]["order_code"] == "C-2026-021"
    r = api.post("/api/import", json={"data": data, "on_conflict": "copy"}).json()
    copy_name = r["projects"][0]["imported_as"]
    copy = project(api, copy_name)
    ev = api.get("/api/events", params={"start": "2026-12-01", "end": "2026-12-31"}).json()
    assert any(e["project_id"] == copy["id"] and e["order_code"] == "C-2026-021" for e in ev)
    # no duplicate commessa on the customer
    assert [o["code"] for o in orders(api, gamma["customer_id"])].count("C-2026-021") == 1


def test_project_list_carries_commessa_and_times_of_each_intervention(api):
    # the projects column shows them when a project is expanded
    gamma = project(api, "Gamma Retail")
    ev = api.post(f"/api/projects/{gamma['id']}/events", json={
        "event_date": "2027-02-01", "start_time": "09:00", "end_time": "11:30", "order_code": "C-2027-050"}).json()
    ref = next(e for e in project(api, "Gamma Retail")["events"] if e["id"] == ev["id"])
    assert (ref["order_code"], ref["start_time"], ref["end_time"]) == ("C-2027-050", "09:00:00", "11:30:00")
    assert {"order_code", "start_time", "server_count"} <= set(project(api, "Gamma Retail")["events"][0])
