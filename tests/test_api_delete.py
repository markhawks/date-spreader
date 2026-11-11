"""Eliminazione di progetti e interventi: permessi per ruolo, cosa resta, cronologia, feed."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import AuditLog, Customer, EventServer, Project, Server, User
from app.security import hash_password
from app.seed import seed
from tests.test_auth import ADMIN_PW, TECH_PW, accounts, login  # noqa: F401  (fixture riusata)

COORD_PW = "Coordina-Interventi-26"


@pytest.fixture
def world(session_factory, accounts):  # noqa: F811
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
        s.add(User(external_id="coord@azienda.it", username="coord", display_name="Cora Coordinatrice",
                   role="coordinatore", password_hash=hash_password(COORD_PW)))
    return session_factory


def client_as(settings, who, pw):
    c = TestClient(create_app(settings), headers={"X-Requested-With": "datespreader"})
    c.__enter__()
    login(c, who, pw)
    return c


def event_on(c, day):
    eid = c.get("/api/events", params={"start": day, "end": day}).json()[0]["id"]
    return c.get(f"/api/events/{eid}").json()


def project(c, name):
    return next(p for p in c.get("/api/projects").json() if p["name"] == name)


def test_technician_deletes_only_empty_events(settings, engine, world):
    c = client_as(settings, "tecnico1", TECH_PW)
    ev = event_on(c, "2026-11-26")  # con server
    res = c.delete(f"/api/events/{ev['id']}", params={"version": ev["version"]})
    assert res.status_code == 403 and "coordinators" in res.json()["detail"]["message"]
    p = project(c, "Beta Assicurazioni")
    empty = c.post(f"/api/projects/{p['id']}/events", json={"event_date": "2027-02-01"}).json()
    assert c.delete(f"/api/events/{empty['id']}", params={"version": empty["version"]}).status_code == 204
    # progetto: mai per i tecnici
    assert c.delete(f"/api/projects/{p['id']}", params={"version": p["version"]}).status_code == 403


def test_coordinator_deletes_event_with_servers(settings, engine, world):
    c = client_as(settings, "coord", COORD_PW)
    ev = event_on(c, "2026-11-26")
    assert c.delete(f"/api/events/{ev['id']}", params={"version": ev["version"]}).status_code == 204
    with world() as s:
        entry = s.scalars(select(AuditLog).where(AuditLog.table_name == "events", AuditLog.action == "delete",
                                                 AuditLog.field == "server")).one()
        assert "beta-app01.example.com" in entry.old_value
        assert s.get(User, entry.user_id).display_name == "Cora Coordinatrice"


def test_delete_project_keeps_customer_and_servers(settings, engine, world):
    c = client_as(settings, "admin@azienda.it", ADMIN_PW)
    p = project(c, "Alfa Logistica")
    since = c.get("/api/changes").json()["last_id"]
    assert c.delete(f"/api/projects/{p['id']}", params={"version": p["version"] + 1}).status_code == 409
    assert c.delete(f"/api/projects/{p['id']}", params={"version": p["version"]}).status_code == 204
    assert "Alfa Logistica" not in [x["name"] for x in c.get("/api/projects").json()]
    assert c.get("/api/events", params={"start": "2026-10-18", "end": "2026-10-18"}).json() == []
    with world() as s:
        assert s.scalars(select(Customer).where(Customer.name == "Gruppo Alfa-Gamma")).one()  # cliente resta
        assert s.scalars(select(Server).where(Server.hostname == "alfa-db01.example.com")).one()  # server resta
        assert not s.scalars(select(EventServer).join(Server).where(Server.hostname == "alfa-db01.example.com")).all()
        assert s.scalars(select(Project).where(Project.name == "Gamma Retail")).one()  # altri progetti intatti
    feed = c.get("/api/changes", params={"since": since}).json()
    assert feed["projects_changed"] is True and set(feed["dates"]) == {"2026-10-18", "2026-11-15"}
    assert c.delete("/api/projects/9999", params={"version": 1}).status_code == 404


def test_delete_requires_csrf_header(settings, engine, world):
    c = client_as(settings, "admin@azienda.it", ADMIN_PW)
    p = project(c, "Beta Assicurazioni")
    del c.headers["X-Requested-With"]
    assert c.delete(f"/api/projects/{p['id']}", params={"version": p["version"]}).status_code == 403
