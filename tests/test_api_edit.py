from datetime import date

import pytest
from sqlalchemy import select

from app.models import AuditLog
from app.seed import seed

TODAY = date(2026, 11, 10)


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=TODAY)
    return client


def event_on(api, day):
    eid = api.get("/api/events", params={"start": day, "end": day}).json()[0]["id"]
    return api.get(f"/api/events/{eid}").json()


def row_by_host(event, prefix):
    return next(r for r in event["servers"] if r["hostname"].startswith(prefix))


def audit_rows(session_factory, table):
    with session_factory() as s:
        return s.scalars(select(AuditLog).where(AuditLog.table_name == table).order_by(AuditLog.id)).all()


# --- PATCH ---------------------------------------------------------------------


def test_patch_row_field_bumps_version_and_writes_audit(api, session_factory):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-app01")
    res = api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "check_status": "ok"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["check_status"] == "ok"
    assert body["version"] == row["version"] + 1
    assert body["server_version"] == row["server_version"]  # il server non è stato toccato

    log = audit_rows(session_factory, "event_servers")
    assert [(a.action, a.field, a.old_value, a.new_value) for a in log] == [
        ("update", "check_status", "ko", "ok")
    ]


def test_patch_server_field_needs_server_version(api):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-app01")
    res = api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "ip_address": "198.51.100.99"})
    assert res.status_code == 422


def test_patch_server_field_is_shared_across_events(api):
    """L'IP è un attributo del server: cambiarlo in un intervento lo cambia anche negli altri."""
    row = row_by_host(event_on(api, "2026-11-15"), "alfa-db01")
    res = api.patch(
        f"/api/event-servers/{row['id']}",
        json={"version": row["version"], "server_version": row["server_version"], "ip_address": "192.0.2.131"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["server_version"] == row["server_version"] + 1
    assert res.json()["version"] == row["version"]  # la riga non è cambiata
    other = row_by_host(event_on(api, "2026-10-18"), "alfa-db01")
    assert other["ip_address"] == "192.0.2.131"


def test_patch_with_stale_version_is_rejected_with_current_values(api):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-app01")
    url = f"/api/event-servers/{row['id']}"
    assert api.patch(url, json={"version": row["version"], "notes": "utente A"}).status_code == 200

    res = api.patch(url, json={"version": row["version"], "notes": "utente B"})  # versione vecchia
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert "altro utente" in detail["message"]
    assert detail["current"]["notes"] == "utente A"
    assert row_by_host(event_on(api, "2026-11-26"), "beta-app01")["notes"] == "utente A"


def test_patch_with_stale_server_version_is_rejected(api):
    a = row_by_host(event_on(api, "2026-10-18"), "alfa-db01")
    b = row_by_host(event_on(api, "2026-11-15"), "alfa-db01")  # stesso server, altra riga
    ok = api.patch(
        f"/api/event-servers/{a['id']}",
        json={"version": a["version"], "server_version": a["server_version"], "operating_system": "Red Hat Enterprise Linux 8.10"},
    )
    assert ok.status_code == 200
    res = api.patch(
        f"/api/event-servers/{b['id']}",
        json={"version": b["version"], "server_version": b["server_version"], "operating_system": "Red Hat Enterprise Linux 9.8"},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["current"]["operating_system"] == "Red Hat Enterprise Linux 8.10"


def test_patch_clear_optional_field_and_assign_user(api):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-app01")
    users = api.get("/api/users").json()
    sara = next(u for u in users if u["display_name"] == "Sara Verdi")
    res = api.patch(
        f"/api/event-servers/{row['id']}",
        json={"version": row["version"], "notes": "", "assigned_user_id": sara["id"], "executed_date": "2026-11-26"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["notes"] is None
    assert body["assigned_user"]["display_name"] == "Sara Verdi"
    assert body["executed_date"] == "2026-11-26"

    res = api.patch(f"/api/event-servers/{row['id']}", json={"version": body["version"], "assigned_user_id": None})
    assert res.json()["assigned_user"] is None


def test_patch_hostname_is_normalized(api):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-dev01")
    res = api.patch(
        f"/api/event-servers/{row['id']}",
        json={"version": row["version"], "server_version": row["server_version"], "hostname": "  Beta-DEV01b.Example.com "},
    )
    assert res.json()["hostname"] == "beta-dev01b.example.com"


@pytest.mark.parametrize(
    ("payload", "needs_server_version"),
    [
        ({"check_status": "forse"}, False),
        ({"migration_status": None}, False),
        ({"executed_date": "31-12-2026"}, False),
        ({"assigned_user_id": 9999}, False),
        ({"ip_address": "999.1.1.1"}, True),
        ({"environment": "PRODUZIONE"}, True),
        ({"hostname": "nome con spazi"}, True),
        ({"hostname": ""}, True),
        ({"hostname": "beta-app02.example.com"}, True),  # già usato da un altro server
        ({"campo_inesistente": 1}, False),
    ],
)
def test_patch_validation(api, payload, needs_server_version):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-app01")
    body = {"version": row["version"], **payload}
    if needs_server_version:
        body["server_version"] = row["server_version"]
    res = api.patch(f"/api/event-servers/{row['id']}", json=body)
    assert res.status_code == 422, res.text


def test_patch_unknown_row(api):
    assert api.patch("/api/event-servers/9999", json={"version": 1, "notes": "x"}).status_code == 404


# --- POST ----------------------------------------------------------------------


def test_add_new_server(api, session_factory):
    ev = event_on(api, "2026-12-12")
    res = api.post(
        f"/api/events/{ev['id']}/servers",
        json={"hostname": "Gamma-POS03.example.com", "ip_address": "203.0.113.13", "environment": "PROD"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["server_reused"] is False
    assert body["hostname"] == "gamma-pos03.example.com"
    assert body["check_status"] == "da_fare"
    assert body["planned_date"] == "2026-12-12"
    assert body["position"] == 3  # in fondo alla tabella

    after = event_on(api, "2026-12-12")
    assert after["servers"][-1]["hostname"] == "gamma-pos03.example.com"
    assert {a.action for a in audit_rows(session_factory, "servers")} == {"create"}


def test_add_existing_server_reuses_it(api):
    ev = event_on(api, "2026-12-12")
    res = api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "beta-app01.example.com"})
    assert res.status_code == 201
    body = res.json()
    assert body["server_reused"] is True
    assert body["ip_address"] == "198.51.100.11"  # dati del server esistente


def test_add_server_already_in_event(api):
    ev = event_on(api, "2026-12-12")
    res = api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "gamma-pos01.example.com"})
    assert res.status_code == 409
    assert "già presente" in res.json()["detail"]["message"]


def test_add_server_validation(api):
    ev = event_on(api, "2026-12-12")
    assert api.post(f"/api/events/{ev['id']}/servers", json={"hostname": "  "}).status_code == 422
    assert api.post("/api/events/9999/servers", json={"hostname": "x.example.com"}).status_code == 404


# --- DELETE --------------------------------------------------------------------


def test_delete_row_keeps_server(api):
    ev = event_on(api, "2026-11-15")
    row = row_by_host(ev, "alfa-db01")
    res = api.delete(f"/api/event-servers/{row['id']}", params={"version": row["version"]})
    assert res.status_code == 204
    assert [r["hostname"] for r in event_on(api, "2026-11-15")["servers"]] == ["alfa-web02.example.com"]
    # il server esiste ancora nell'altro intervento
    assert row_by_host(event_on(api, "2026-10-18"), "alfa-db01")


def test_delete_with_stale_version(api):
    row = row_by_host(event_on(api, "2026-11-26"), "beta-app01")
    api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "notes": "cambiata"})
    res = api.delete(f"/api/event-servers/{row['id']}", params={"version": row["version"]})
    assert res.status_code == 409
    assert res.json()["detail"]["current"]["notes"] == "cambiata"


def test_delete_unknown_row(api):
    assert api.delete("/api/event-servers/9999", params={"version": 1}).status_code == 404


# --- liste di supporto ------------------------------------------------------------


def test_users_and_options(api):
    users = api.get("/api/users").json()
    assert [u["display_name"] for u in users] == ["Giulia Gallo", "Luca Bianchi", "Marco Neri", "Sara Verdi"]
    opts = api.get("/api/options").json()
    assert opts["check_statuses"][0] == "da_fare"
    assert "PROD" in opts["environments"]


def test_changes_survive_app_restart(settings, engine, session_factory):
    """Criterio di accettazione: le modifiche sopravvivono al riavvio dell'applicazione."""
    from fastapi.testclient import TestClient

    from tests.conftest import authed_app

    with session_factory.begin() as s:
        seed(s, today=TODAY)
    with TestClient(authed_app(settings)) as c1:
        row = row_by_host(event_on(c1, "2026-11-26"), "beta-app01")
        c1.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "notes": "persistente"})
    with TestClient(authed_app(settings)) as c2:  # nuova app, nuovo motore
        assert row_by_host(event_on(c2, "2026-11-26"), "beta-app01")["notes"] == "persistente"
