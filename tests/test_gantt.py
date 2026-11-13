"""Gantt report: interventions grouped by commessa and project, with hours, man-hours,
technicians, machines and statuses; Excel export."""

import io
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


def gantt(api, **params):
    res = api.get("/api/reports/gantt", params=params)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def setup(api):
    """Gamma Retail (customer with commesse) gets three interventions in January 2027."""
    gamma = project(api, "Gamma Retail")
    users = api.get("/api/users").json()
    techs = [u["id"] for u in users if u.get("is_active", True)][:2]
    pid = gamma["id"]
    a = api.post(f"/api/projects/{pid}/events", json={
        "event_date": "2027-01-11", "start_time": "09:00", "end_time": "12:30", "order_code": "C-2027-001",
        "participant_ids": techs, "status": "completato"}).json()
    b = api.post(f"/api/projects/{pid}/events", json={
        "event_date": "2027-01-12", "start_time": "21:00", "end_time": "23:59", "order_code": "C-2027-001",
        "participant_ids": techs[:1], "worked_hours": 5}).json()
    c = api.post(f"/api/projects/{pid}/events", json={"event_date": "2027-01-20", "title": "No times"}).json()
    d = api.post(f"/api/projects/{pid}/events", json={
        "event_date": "2027-01-21", "start_time": "09:00", "end_time": "10:00", "status": "annullato"}).json()
    return {"customer_id": gamma["customer_id"], "techs": techs, "events": (a, b, c, d)}


def test_hours_man_hours_and_groups(api, setup):
    r = gantt(api, start="2027-01-01", end="2027-01-31", customer_id=setup["customer_id"])
    t = r["totals"]
    assert t["events"] == 4
    # 3.5 h (times) + 5 h (worked hours win over the times) + 0 (no times) + 0 (cancelled)
    assert t["hours"] == 8.5
    assert t["man_hours"] == 3.5 * len(setup["techs"]) + 5
    assert t["missing_hours"] == 1
    assert t["statuses"] == {"completato": 1, "pianificato": 2, "annullato": 1}
    assert (t["first"], t["last"]) == ("2027-01-11", "2027-01-21")
    codes = [o["order_code"] for o in r["orders"]]
    assert codes == ["C-2027-001", None]          # commesse first, "no commessa" last
    order = r["orders"][0]
    assert order["totals"]["events"] == 2 and order["totals"]["hours"] == 8.5
    first_tech = next(x for x in order["totals"]["technicians"] if x["id"] == setup["techs"][0])
    assert first_tech["hours"] == 8.5 and first_tech["events"] == 2
    ev = {e["id"]: e for p in order["projects"] for e in p["events"]}
    a, b, *_ = setup["events"]
    assert ev[a["id"]]["hours_source"] == "times" and ev[b["id"]]["hours_source"] == "worked"
    assert ev[b["id"]]["worked_hours"] == 5


def test_worked_hours_editable_and_end_of_day_counts_as_midnight(api, setup):
    _, b, *_ = setup["events"]
    detail = api.get(f"/api/events/{b['id']}").json()
    assert detail["worked_hours"] == 5
    res = api.patch(f"/api/events/{b['id']}", json={"version": detail["version"], "worked_hours": None})
    assert res.status_code == 200, res.text
    r = gantt(api, start="2027-01-12", end="2027-01-12")
    e = r["orders"][0]["projects"][0]["events"][0]
    assert e["hours_source"] == "times" and e["hours"] == 3.0     # 21:00–23:59 = 3 h
    bad = api.patch(f"/api/events/{b['id']}", json={"version": detail["version"] + 1, "worked_hours": -1})
    assert bad.status_code == 422


def test_period_and_customer_checks(api):
    assert api.get("/api/reports/gantt", params={"start": "2027-02-01", "end": "2027-01-01"}).status_code == 422
    assert api.get("/api/reports/gantt", params={"start": "2026-01-01", "end": "2027-12-31"}).status_code == 422
    assert api.get("/api/reports/gantt", params={"start": "2027-01-01", "end": "2027-01-31", "customer_id": 99999}).status_code == 404
    # all customers: sample data of autumn 2026
    r = gantt(api, start="2026-10-01", end="2026-12-31")
    assert r["totals"]["events"] >= 3 and len({o["customer_id"] for o in r["orders"]}) >= 2


def test_excel_export(api, setup):
    from openpyxl import load_workbook

    res = api.get("/api/reports/gantt.xlsx", params={"start": "2027-01-01", "end": "2027-01-31", "customer_id": setup["customer_id"]},
                  headers={"Accept-Language": "it"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/vnd.openxmlformats")
    wb = load_workbook(io.BytesIO(res.content))
    assert wb.sheetnames == ["Gantt", "Ore per tecnico", "Riepilogo"]
    ws = wb["Gantt"]
    assert ws["A2"].value == "Commessa" and ws["L2"].value == "01/01"
    values = [c.value for c in ws["A"]]
    assert "C-2027-001" in values and "Senza commessa" in values and values[-1] == "Totale"
    summary = wb["Riepilogo"]
    assert summary["A2"].value == "C-2027-001" and summary["D2"].value == 8.5
