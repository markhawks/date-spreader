"""Sync of a customer's projects between two installations (app/sync.py, /api/sync/*)."""

from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.db import create_db_engine
from app.migrations import upgrade_database
from app.seed import seed
from tests.conftest import authed_app

CUSTOMER = "Gruppo Alfa-Gamma"


@pytest.fixture
def a(client, session_factory):
    """Installation A, with the sample data."""
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


@pytest.fixture
def b(settings, tmp_path, a):
    """Installation B: its own database, with the customer imported from A (same identities)."""
    s2 = replace(settings, database_path=tmp_path / "b" / "b.sqlite3")
    s2.database_path.parent.mkdir()
    eng = create_db_engine(s2)
    upgrade_database(eng)
    with TestClient(authed_app(s2)) as c:
        assert c.post("/api/import", json={"data": export(a)}).status_code == 200
        yield c
    eng.dispose()


def export(c, customer=CUSTOMER):
    cid = next(x["id"] for x in c.get("/api/customers").json() if x["name"] == customer)
    res = c.get(f"/api/export/customers/{cid}")
    assert res.status_code == 200, res.text
    return res.json()


def preview(c, data):
    res = c.post("/api/sync/preview", json={"data": data})
    assert res.status_code == 200, res.text
    return res.json()


def run(c, data, **choices):
    """Preview, then apply with the proposed choices (+ `choices`: item key → take)."""
    diff = preview(c, data)
    decisions = {i["key"]: i["default"] for i in diff["items"] if i["default"] is not None and not i["follows_parent"]}
    decisions.update(choices)
    res = c.post("/api/sync/apply", json={"data": data, "token": diff["token"], "decisions": decisions})
    assert res.status_code == 200, res.text
    return res.json()


def changed(diff):
    return {i["key"]: i for i in diff["items"] if i["state"] != "equal"}


def event(c, project, day):
    p = next(p for p in c.get("/api/projects").json() if p["name"] == project)
    ref = next(e for e in p["events"] if e["event_date"] == day)
    return c.get(f"/api/events/{ref['id']}").json()


def patch_event(c, project, day, **values):
    ev = event(c, project, day)
    res = c.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], **values})
    assert res.status_code == 200, res.text


def first_two_events(c):
    p = next(p for p in c.get("/api/projects").json() if p["name"] == "Alfa Logistica")
    return sorted(e["event_date"] for e in p["events"])[:2]


def test_export_carries_identities(a):
    data = export(a)
    assert data["instance"]["uid"] and data["sync_baselines"] == {}
    assert all(p["uid"] and all(e["uid"] for e in p["events"]) for p in data["projects"])


def test_identical_installations_have_no_differences(a, b):
    diff = preview(b, export(a))
    assert diff["customer"] == CUSTOMER and diff["whole_customer"]
    assert changed(diff) == {} and set(diff["counts"]) == {"equal"}
    assert diff["baseline"] == {"at": None, "source": None}


def test_change_on_the_other_side_is_proposed_and_applied(a, b):
    run(b, export(a))                                     # first sync: the baseline
    d1, _ = first_two_events(a)
    patch_event(a, "Alfa Logistica", d1, status="completato", title="Cutover")
    diff = preview(b, export(a))
    assert diff["baseline"]["source"] == "here"
    (item,) = changed(diff).values()
    assert (item["kind"], item["state"], item["default"]) == ("event", "changed", True)
    assert {f["field"]: (f["here"], f["there"]) for f in item["fields"]}["title"][1] == "Cutover"
    before = event(b, "Alfa Logistica", d1)["version"]

    result = run(b, export(a))
    assert result["updated"] == 1 and result["backup"].endswith("-pre-sync.sqlite3")
    ev = event(b, "Alfa Logistica", d1)
    assert (ev["status"], ev["title"]) == ("completato", "Cutover") and ev["version"] > before
    assert changed(preview(b, export(a))) == {}


def test_changed_here_conflict_and_choice(a, b):
    run(b, export(a))
    d1, d2 = first_two_events(a)
    patch_event(b, "Alfa Logistica", d1, title="Only here")       # changed only here
    patch_event(a, "Alfa Logistica", d2, title="There")           # changed on both sides
    patch_event(b, "Alfa Logistica", d2, title="Here")
    data = export(a)
    items = {i["here"]["event_date"]: i for i in changed(preview(b, data)).values()}
    assert (items[d1]["state"], items[d1]["default"]) == ("changed_here", False)
    assert (items[d2]["state"], items[d2]["default"]) == ("conflict", None)

    diff = preview(b, data)
    res = b.post("/api/sync/apply", json={"data": data, "token": diff["token"], "decisions": {}})
    assert res.status_code == 422                                 # every conflict needs a choice
    run(b, data, **{items[d2]["key"]: True})
    assert event(b, "Alfa Logistica", d1)["title"] == "Only here"
    assert event(b, "Alfa Logistica", d2)["title"] == "There"


def test_new_and_deleted_items(a, b):
    run(b, export(a))
    pid = next(p["id"] for p in a.get("/api/projects").json() if p["name"] == "Alfa Logistica")
    assert a.post(f"/api/projects/{pid}/events", json={"event_date": "2027-03-01", "title": "New there"}).status_code == 201
    d1, _ = first_two_events(a)
    gone = event(a, "Alfa Logistica", d1)
    assert a.delete(f"/api/events/{gone['id']}", params={"version": gone["version"]}).status_code == 204
    bid = next(p["id"] for p in b.get("/api/projects").json() if p["name"] == "Alfa Logistica")
    assert b.post(f"/api/projects/{bid}/events", json={"event_date": "2027-04-01", "title": "New here"}).status_code == 201

    data = export(a)
    by_title = {(i["there"] or i["here"])["title"]: i for i in changed(preview(b, data)).values()}
    assert (by_title["New there"]["state"], by_title["New there"]["default"]) == ("new", True)
    assert (by_title["New here"]["state"], by_title["New here"]["default"]) == ("only_here", False)
    deleted = next(i for i in by_title.values() if i["state"] == "deleted_there")
    assert deleted["default"] is False                            # deletions only on request

    result = run(b, data, **{deleted["key"]: True})
    assert (result["created"], result["deleted"]) == (1, 1)
    days = {e["event_date"] for p in b.get("/api/projects").json() if p["name"] == "Alfa Logistica" for e in p["events"]}
    assert "2027-03-01" in days and "2027-04-01" in days and d1 not in days


def test_reverse_direction_uses_the_baseline_in_the_file(a, b):
    run(b, export(a))                                    # B knows the agreed state, A does not
    d1, _ = first_two_events(a)
    patch_event(b, "Alfa Logistica", d1, notes="from B")
    data_b = export(b)
    assert data_b["sync_baselines"]                      # B's baseline for A travels in the file
    diff = preview(a, data_b)
    assert diff["baseline"]["source"] == "file"
    (item,) = changed(diff).values()
    assert item["state"] == "changed"                    # not a conflict: only B changed it
    run(a, data_b)
    assert event(a, "Alfa Logistica", d1)["notes"] == "from B"
    assert changed(preview(b, export(a))) == {}


def test_new_project_comes_with_its_interventions(a, b):
    run(b, export(a))
    cid = next(x["id"] for x in a.get("/api/customers").json() if x["name"] == CUSTOMER)
    res = a.post("/api/projects", json={"name": "Delta Nuovo", "customer_id": cid,
                                        "first_event": {"event_date": "2027-05-02"}})
    assert res.status_code == 201, res.text
    diff = preview(b, export(a))
    items = changed(diff)
    project = next(i for i in items.values() if i["kind"] == "project")
    assert project["state"] == "new" and project["default"] is True
    assert all(i["follows_parent"] for i in items.values() if i["kind"] == "event")
    run(b, export(a))
    assert "Delta Nuovo" in {p["name"] for p in b.get("/api/projects").json()}


def test_refusals(a, b):
    data = export(a)
    assert a.post("/api/sync/preview", json={"data": data}).status_code == 422   # same installation
    old = export(a)
    old.pop("instance")
    assert b.post("/api/sync/preview", json={"data": old}).status_code == 422
    diff = preview(b, data)
    d1, _ = first_two_events(b)
    patch_event(b, "Alfa Logistica", d1, title="changed meanwhile")
    res = b.post("/api/sync/apply", json={"data": data, "token": diff["token"], "decisions": {}})
    assert res.status_code == 409                                                 # stale preview


def test_restore_gives_a_new_identity(tmp_path, settings, engine):
    from app import backup as backups
    from app.models import AppMeta
    from app.db import make_session_factory

    factory = make_session_factory(engine)
    with factory() as s:
        before = s.get(AppMeta, "instance_uid").value
    copy = backups.create_backup(settings, "manual")
    engine.dispose()
    backups.restore_backup(settings, copy.path)
    with factory() as s:
        assert s.get(AppMeta, "instance_uid").value != before
