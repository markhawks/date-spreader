"""Clienti: anagrafica, assegnazione ai progetti, filtro sugli interventi, dati di esempio."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import Customer, Event, Project
from app.seed import remove_demo, seed
from tests.test_auth import TECH_PW, accounts, login  # noqa: F401  (fixture riusata)


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def customers(api):
    return {c["name"]: c for c in api.get("/api/customers").json()}


def project(api, name):
    return next(p for p in api.get("/api/projects").json() if p["name"] == name)


def test_demo_customers_and_counts(api):
    c = customers(api)
    assert c["Gruppo Alfa-Gamma"]["project_count"] == 2
    assert c["Beta Assicurazioni S.p.A."]["project_count"] == 1
    assert c["Delta Energia (esempio)"]["project_count"] == 0
    assert project(api, "Alfa Logistica")["customer_name"] == "Gruppo Alfa-Gamma"


def test_create_customer_unique_case_insensitive(api):
    res = api.post("/api/customers", json={"name": "  Gamma   Farmaceutici S.p.A. "})
    assert res.status_code == 201 and res.json()["name"] == "Gamma Farmaceutici S.p.A."
    assert api.post("/api/customers", json={"name": "gamma farmaceutici s.p.a."}).status_code == 409
    assert api.post("/api/customers", json={"name": "   "}).status_code == 422


def test_assign_customer_on_create_and_edit(api):
    cid = api.post("/api/customers", json={"name": "Gamma"}).json()["id"]
    res = api.post("/api/projects", json={"name": "Gamma - Backup", "customer_id": cid})
    assert res.status_code == 201 and res.json()["customer_name"] == "Gamma"
    p = project(api, "Gamma Retail")
    moved = api.patch(f"/api/projects/{p['id']}", json={"version": p["version"], "customer_id": cid}).json()
    assert moved["customer_name"] == "Gamma"
    cleared = api.patch(f"/api/projects/{p['id']}", json={"version": moved["version"], "customer_id": None}).json()
    assert cleared["customer_id"] is None and cleared["customer_name"] is None
    assert api.post("/api/projects", json={"name": "X", "customer_id": 9999}).status_code == 422
    assert api.patch(f"/api/projects/{p['id']}", json={"version": cleared["version"], "customer_id": 9999}).status_code == 422


def test_events_carry_customer_for_filtering(api):
    gid = customers(api)["Gruppo Alfa-Gamma"]["id"]
    events = api.get("/api/events", params={"start": "2026-10-01", "end": "2026-12-31"}).json()
    assert {e["project_name"] for e in events if e["customer_id"] == gid} == {"Alfa Logistica", "Gamma Retail"}
    detail = api.get(f"/api/events/{events[0]['id']}").json()
    assert detail["project"]["customer_name"] == "Gruppo Alfa-Gamma"


def test_rename_and_delete(api):
    c = customers(api)
    gid, empty = c["Gruppo Alfa-Gamma"], c["Delta Energia (esempio)"]
    res = api.patch(f"/api/customers/{gid['id']}", json={"version": gid["version"], "name": "Gruppo AG"})
    assert res.status_code == 200 and project(api, "Alfa Logistica")["customer_name"] == "Gruppo AG"
    assert api.patch(f"/api/customers/{gid['id']}", json={"version": gid["version"], "name": "Altro"}).status_code == 409
    assert api.patch(f"/api/customers/{empty['id']}", json={"version": empty["version"], "name": "gruppo ag"}).status_code == 409
    used = api.delete(f"/api/customers/{gid['id']}")
    assert used.status_code == 409 and "progetti" in used.json()["detail"]["message"]
    assert api.delete(f"/api/customers/{empty['id']}").status_code == 204
    assert api.delete("/api/customers/9999").status_code == 404


def test_feed_signals_customer_changes(api):
    since = api.get("/api/changes").json()["last_id"]
    api.post("/api/customers", json={"name": "Nuovo"})
    assert api.get("/api/changes", params={"since": since}).json()["projects_changed"] is True


def test_only_admins_rename_or_delete(settings, engine, accounts):  # noqa: F811
    from app.main import create_app

    with TestClient(create_app(settings), headers={"X-Requested-With": "datespreader"}) as c:
        login(c, "tecnico1", TECH_PW)
        created = c.post("/api/customers", json={"name": "Creato dal tecnico"})
        assert created.status_code == 201  # creare sì (serve nei moduli dei progetti)
        cid, v = created.json()["id"], created.json()["version"]
        assert c.patch(f"/api/customers/{cid}", json={"version": v, "name": "Rinominato"}).status_code == 403
        assert c.delete(f"/api/customers/{cid}").status_code == 403


def test_demo_removal_keeps_customers_of_real_projects(api, session_factory):
    with session_factory.begin() as s:
        beta = s.scalars(select(Customer).where(Customer.name == "Beta Assicurazioni S.p.A.")).one()
        s.add(Project(name="Progetto reale", customer=beta))
    with session_factory.begin() as s:
        plan = remove_demo(s)
    assert plan["clienti_mantenuti"] == ["Beta Assicurazioni S.p.A."]
    assert set(plan["clienti"]) == {"Gruppo Alfa-Gamma", "Delta Energia (esempio)"}
    with session_factory() as s:
        left = s.scalars(select(Customer)).all()
        assert [(c.name, c.is_demo) for c in left] == [("Beta Assicurazioni S.p.A.", False)]
        assert s.scalars(select(Event)).all() == []


def test_customer_color(api):
    c = customers(api)["Beta Assicurazioni S.p.A."]
    assert c["color"] is None
    res = api.patch(f"/api/customers/{c['id']}", json={"version": c["version"], "color": "#D97706"})
    assert res.status_code == 200 and res.json()["color"] == "#d97706" and res.json()["name"] == "Beta Assicurazioni S.p.A."
    assert project(api, "Beta Assicurazioni")["customer_color"] == "#d97706"
    ev = api.get("/api/events", params={"start": "2026-11-26", "end": "2026-11-26"}).json()[0]
    assert (ev["customer_name"], ev["customer_color"]) == ("Beta Assicurazioni S.p.A.", "#d97706")
    for bad in ("rosso", "#12345", "#gggggg", "d97706"):
        assert api.patch(f"/api/customers/{c['id']}", json={"version": res.json()["version"], "color": bad}).status_code == 422, bad
    cleared = api.patch(f"/api/customers/{c['id']}", json={"version": res.json()["version"], "color": None})
    assert cleared.status_code == 200 and cleared.json()["color"] is None


def test_demo_customer_has_color(api):
    assert customers(api)["Gruppo Alfa-Gamma"]["color"] == "#0d9488"
    assert project(api, "Gamma Retail")["customer_color"] == "#0d9488"
