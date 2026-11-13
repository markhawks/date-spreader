"""Import of a server list (CSV, pasted rows, .xlsx) into the server table of an intervention."""

import base64
import io
from datetime import date

import pytest

from app.seed import seed


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def new_event(api):
    pid = next(p["id"] for p in api.get("/api/projects").json() if p["name"] == "Gamma Retail")
    return api.post(f"/api/projects/{pid}/events", json={"event_date": "2027-01-15"}).json()


def run(api, eid, **body):
    return api.post(f"/api/events/{eid}/servers/import", json={"kind": "text", **body})


def existing_server(api):
    return api.get("/api/servers").json()["servers"][0]


CSV_IT = """hostname;IP;SO;Ambiente;Tecnico;Note
web01.example.com;192.0.2.101;RHEL 9.8;Produzione;Giulia Gallo;front-end
db01.example.com;192.0.2.102;Red Hat Enterprise Linux 8.10;test;;
web01.example.com;192.0.2.103;;;;
bad host name;;;;;
app01.example.com;;Windows Server 2022;mars;Nessuno;
"""


def test_preview_saves_nothing_then_import(api):
    ev = new_event(api)
    res = run(api, ev["id"], content=CSV_IT)
    assert res.status_code == 200, res.text
    r = res.json()
    assert r["dry_run"] is True and r["has_header"] is True
    assert [c["field"] for c in r["columns"]] == [
        "hostname", "ip_address", "operating_system", "environment", "assigned_user", "notes"]
    by_line = {row["line"]: row for row in r["rows"]}
    assert by_line[2]["status"] == "added_new" and by_line[3]["status"] == "added_new"
    assert by_line[4]["status"] == "skipped"                 # duplicate in the file
    assert by_line[5]["status"] == "errors"                  # invalid hostname
    assert by_line[6]["status"] == "added_new"               # imported, with warnings
    assert len(by_line[6]["messages"]) == 3                  # unknown OS, environment, technician
    assert r["unknown_os"] == ["Windows Server 2022"] and r["unknown_users"] == ["Nessuno"]
    assert r["totals"] == {"added_new": 3, "added_existing": 0, "updated": 0, "skipped": 1, "errors": 1}
    assert api.get(f"/api/events/{ev['id']}").json()["servers"] == []   # preview: nothing saved

    r = run(api, ev["id"], content=CSV_IT, dry_run=False).json()
    assert r["dry_run"] is False and r["totals"]["added_new"] == 3
    rows = {s["hostname"]: s for s in api.get(f"/api/events/{ev['id']}").json()["servers"]}
    assert set(rows) == {"web01.example.com", "db01.example.com", "app01.example.com"}
    web = rows["web01.example.com"]
    assert (web["ip_address"], web["operating_system"], web["environment"], web["notes"]) == (
        "192.0.2.101", "Red Hat Enterprise Linux 9.8", "PROD", "front-end")
    assert web["assigned_user"]["display_name"] == "Giulia Gallo"
    assert rows["db01.example.com"]["operating_system"] == "Red Hat Enterprise Linux 8.10"
    assert rows["db01.example.com"]["environment"] == "TEST"
    # importing again: everything is already there
    again = run(api, ev["id"], content=CSV_IT, dry_run=False).json()
    assert again["totals"]["added_new"] == 0 and again["totals"]["skipped"] == 4


def test_existing_servers_are_linked_and_updated_only_on_request(api):
    srv = existing_server(api)
    ev = new_event(api)
    text = f"hostname,ip\n{srv['hostname']},192.0.2.250\n"
    r = run(api, ev["id"], content=text).json()
    row = r["rows"][0]
    assert row["status"] == "added_existing"
    assert row["differences"] == [{"field": "ip_address", "current": srv["ip_address"], "file": "192.0.2.250"}]
    run(api, ev["id"], content=text, dry_run=False)
    assert api.get(f"/api/servers/{srv['id']}").json()["server"]["ip_address"] == srv["ip_address"]   # not overwritten

    ev2 = new_event(api)
    r = run(api, ev2["id"], content=text, update_existing=True, dry_run=False).json()
    assert r["rows"][0]["status"] == "updated"
    assert api.get(f"/api/servers/{srv['id']}").json()["server"]["ip_address"] == "192.0.2.250"


def test_pasted_rows_without_header_and_manual_mapping(api):
    ev = new_event(api)
    pasted = "srv-a.example.com\t192.0.2.11\tnote a\nsrv-b.example.com\t192.0.2.12\tnote b\n"
    r = run(api, ev["id"], content=pasted).json()
    assert r["has_header"] is False and [c["field"] for c in r["columns"]] == ["hostname", "ip_address", None]
    assert r["totals"]["added_new"] == 2
    r = run(api, ev["id"], content=pasted, mapping=["hostname", None, "notes"], dry_run=False).json()
    rows = {s["hostname"]: s for s in api.get(f"/api/events/{ev['id']}").json()["servers"]}
    assert rows["srv-a.example.com"]["notes"] == "note a" and rows["srv-a.example.com"]["ip_address"] is None
    # without a hostname column nothing can be imported
    res = run(api, ev["id"], content=pasted, mapping=[None, "ip_address", None])
    assert res.status_code == 422


def test_xlsx_file(api):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Server", "IP address", "Environment", "Kernel"])
    ws.append(["xl01.example.com", "192.0.2.31", "PROD", "5.14.0-570.el9.x86_64"])
    ws.append(["xl02.example.com", "192.0.2.32", "DEV", None])
    buf = io.BytesIO()
    wb.save(buf)
    ev = new_event(api)
    r = api.post(f"/api/events/{ev['id']}/servers/import", json={
        "kind": "xlsx", "content": base64.b64encode(buf.getvalue()).decode(), "dry_run": False}).json()
    assert [c["field"] for c in r["columns"]] == ["hostname", "ip_address", "environment", "current_kernel"]
    assert r["totals"]["added_new"] == 2
    rows = {s["hostname"]: s for s in api.get(f"/api/events/{ev['id']}").json()["servers"]}
    assert rows["xl01.example.com"]["current_kernel"] == "5.14.0-570.el9.x86_64"
    bad = api.post(f"/api/events/{ev['id']}/servers/import", json={"kind": "xlsx", "content": base64.b64encode(b"nope").decode()})
    assert bad.status_code == 422


def test_unknown_intervention(api):
    assert run(api, 999999, content="a.example.com").status_code == 404


def test_location_is_imported_saved_and_proposed(api):
    ev = new_event(api)
    text = "hostname;sede\nloc1.example.com;Milano DC1\nloc2.example.com;Roma DC2\nloc3.example.com;milano dc1\n"
    r = run(api, ev["id"], content=text, dry_run=False).json()
    assert [c["field"] for c in r["columns"]] == ["hostname", "location"]
    rows = {s["hostname"]: s for s in api.get(f"/api/events/{ev['id']}").json()["servers"]}
    assert rows["loc1.example.com"]["location"] == "Milano DC1"
    # the locations already used are proposed once each (case-insensitive), alphabetically
    locations = api.get("/api/options").json()["locations"]
    assert locations == sorted(locations, key=str.lower)
    assert "Milano DC1" in locations and "Roma DC2" in locations and "milano dc1" not in locations
    # editing the location of a row changes the server (shared by all its interventions)
    row = rows["loc2.example.com"]
    res = api.patch(f"/api/event-servers/{row['id']}", json={
        "version": row["version"], "server_version": row["server_version"], "location": "Torino"})
    assert res.status_code == 200, res.text and res.json()["location"] == "Torino"
    srv = api.get(f"/api/servers/{row['server_id']}").json()["server"]
    assert srv["location"] == "Torino"
    assert "Torino" in api.get("/api/options").json()["locations"]
    assert api.get("/api/servers", params={"q": "torino"}).json()["total"] == 1
