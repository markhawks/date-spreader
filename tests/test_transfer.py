"""Export e import di progetti tra installazioni di Date Spreader (file JSON)."""

from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import create_db_engine
from app.migrations import upgrade_database
from app.models import AuditLog
from app.seed import seed
from tests.conftest import authed_app
from tests.test_auth import TECH_PW, accounts, login  # noqa: F401  (fixture riusata)


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


@pytest.fixture
def other(settings, tmp_path):
    """Seconda installazione, con un database tutto suo (vuoto)."""
    s2 = replace(settings, database_path=tmp_path / "altra.sqlite3")
    eng = create_db_engine(s2)
    upgrade_database(eng)
    with TestClient(authed_app(s2)) as c:
        yield c
    eng.dispose()


def project_id(api, name):
    return next(p["id"] for p in api.get("/api/projects").json() if p["name"] == name)


def export(api, name):
    res = api.get(f"/api/export/projects/{project_id(api, name)}")
    assert res.status_code == 200, res.text
    return res


def test_export_project_file(api, session_factory):
    res = export(api, "Alfa Logistica")
    assert res.headers["content-disposition"].startswith('attachment; filename="datespreader-progetto-alfa-logistica-')
    data = res.json()
    assert (data["format"], data["format_version"]) == ("datespreader-export", 1)
    assert [p["name"] for p in data["projects"]] == ["Alfa Logistica"]
    assert len(data["projects"][0]["events"]) == 2
    hosts = {s["hostname"] for s in data["servers"]}
    assert "alfa-db01.example.com" in hosts
    assert data["operating_systems"]                       # versioni SO usate
    # tecnici: solo nome ed email, mai password o accessi
    assert all(set(t) <= {"key", "display_name", "email", "is_demo"} for t in data["technicians"])
    assert "password" not in res.text and "username" not in res.text
    with session_factory() as s:  # l'export resta nella cronologia
        assert s.scalar(select(AuditLog).where(AuditLog.action == "export")).new_value == "Alfa Logistica"


def test_roundtrip_into_empty_installation(api, other):
    data = export(api, "Alfa Logistica").json()
    preview = other.post("/api/import/preview", json={"data": data})
    assert preview.status_code == 200, preview.text
    assert other.get("/api/projects").json() == []          # l'anteprima non scrive nulla
    assert preview.json()["totals"] == {"projects": 1, "events": 2, "rows": sum(
        len(e["servers"]) for e in data["projects"][0]["events"])}

    res = other.post("/api/import", json={"data": data})
    assert res.status_code == 200, res.text
    report = res.json()
    assert report == preview.json()                          # l'anteprima era fedele
    assert report["projects"][0]["action"] == "creato"
    assert report["customers"]["created"] == ["Gruppo Alfa-Gamma"]

    # stesso contenuto, riesportato dall'altra installazione
    again = export(other, "Alfa Logistica").json()
    strip = lambda d: {k: d[k] for k in ("customers", "servers", "operating_systems", "projects")}  # noqa: E731
    assert strip(again) == strip(data)
    assert {t["display_name"] for t in again["technicians"]} == {t["display_name"] for t in data["technicians"]}
    # i tecnici creati non hanno accesso al portale
    users = other.get("/api/users", params={"all": True}).json()
    assert users and all(not u["has_password"] and u["role"] == "tecnico" for u in users)


def test_conflicts_skip_or_copy_and_existing_servers(api):
    data = export(api, "Alfa Logistica").json()
    # stessa installazione: progetto e server esistono già
    skip = api.post("/api/import", json={"data": data}).json()
    assert skip["projects"][0]["action"] == "saltato" and skip["totals"]["projects"] == 0
    data["servers"][0]["ip_address"] = "192.0.2.250"         # nel file un IP diverso
    copy = api.post("/api/import", json={"data": data, "on_conflict": "copy"}).json()
    assert copy["projects"][0]["action"] == "copia"
    assert copy["projects"][0]["imported_as"] == "Alfa Logistica (importato)"
    assert copy["servers"]["created"] == [] and copy["customers"]["created"] == []
    diff = copy["servers"]["different"][0]
    assert diff["hostname"] == data["servers"][0]["hostname"] and diff["fields"][0]["field"] == "ip_address"
    # il server esistente NON è stato modificato
    srv = api.get("/api/servers", params={"q": data["servers"][0]["hostname"]}).json()["servers"][0]
    assert srv["ip_address"] != "192.0.2.250"
    third = api.post("/api/import", json={"data": data, "on_conflict": "copy"}).json()
    assert third["projects"][0]["imported_as"] == "Alfa Logistica (importato) 2"


def test_export_whole_customer(api, other):
    cid = next(c["id"] for c in api.get("/api/customers").json() if c["name"] == "Gruppo Alfa-Gamma")
    res = api.get(f"/api/export/customers/{cid}")
    assert res.status_code == 200
    data = res.json()
    assert sorted(p["name"] for p in data["projects"]) == ["Alfa Logistica", "Gamma Retail"]
    assert data["scope"] == {"type": "customer", "name": "Gruppo Alfa-Gamma"}
    report = other.post("/api/import", json={"data": data}).json()
    assert report["totals"]["projects"] == 2 and report["customers"]["created"] == ["Gruppo Alfa-Gamma"]
    empty = api.post("/api/customers", json={"name": "Cliente Vuoto"}).json()
    assert api.get(f"/api/export/customers/{empty['id']}").status_code == 409
    assert api.get("/api/export/customers/9999").status_code == 404


@pytest.mark.parametrize("mutate", [
    lambda d: d.update(format="altro"),
    lambda d: d.update(format_version=99),
    lambda d: d.update(projects=[]),
    lambda d: d["servers"][0].update(ip_address="999.1.1.1"),
    lambda d: d["projects"][0]["events"][0].update(status="boh"),
    lambda d: d["projects"][0]["events"][0]["servers"][0].update(hostname="non valido!"),
])
def test_invalid_files_are_rejected(api, other, mutate):
    data = export(api, "Alfa Logistica").json()
    mutate(data)
    assert other.post("/api/import/preview", json={"data": data}).status_code == 422
    assert other.post("/api/import", json={"data": data}).status_code == 422
    assert other.get("/api/projects").json() == []


def test_permissions(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    assert anon.get("/api/export/projects/1").status_code == 403
    assert anon.post("/api/import/preview", json={}).status_code in (403, 422)
    assert anon.post("/api/import", json={"data": {"format": "datespreader-export", "format_version": 1,
                                                   "projects": [{"name": "X"}]}}).status_code == 403
