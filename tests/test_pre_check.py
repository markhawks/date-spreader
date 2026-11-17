"""Pre-check of an intervention: a check day (with times and technicians) without a second intervention."""

from datetime import date, timedelta

import pytest

from app.seed import seed

TODAY = date(2026, 11, 10)
DAY = "2026-11-26"   # an intervention of the sample data (Beta, 3 servers)


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=TODAY)
    return client


def event(api, day=DAY):
    eid = next(e["id"] for e in api.get("/api/events", params={"start": day, "end": day}).json() if e["kind"] == "event")
    return api.get(f"/api/events/{eid}").json()


def patch(api, ev, **values):
    return api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], **values})


def test_plan_the_check_and_see_it_in_the_calendar(api):
    ev = event(api)
    res = patch(api, ev, check_date="2026-11-25", check_start_time="15:00", check_end_time="17:00")
    assert res.status_code == 200, res.text
    d = event(api)
    assert (d["check_date"], d["check_start_time"], d["check_end_time"]) == ("2026-11-25", "15:00:00", "17:00:00")
    items = api.get("/api/events", params={"start": "2026-11-24", "end": "2026-11-26"}).json()
    mine = [i for i in items if i["id"] == ev["id"]]
    assert [(i["kind"], i["event_date"], i["start_time"]) for i in mine] == [
        ("check", "2026-11-25", "15:00:00"), ("event", DAY, mine[1]["start_time"])]
    # only the check day in the range: only the check entry
    only = api.get("/api/events", params={"start": "2026-11-25", "end": "2026-11-25"}).json()
    assert [(i["id"], i["kind"]) for i in only] == [(ev["id"], "check")]


def test_check_rules(api):
    ev = event(api)
    assert patch(api, ev, check_date="2026-11-27").status_code == 422          # after the intervention
    assert patch(api, ev, check_date="2026-11-25", check_start_time="10:00", check_end_time="09:00").status_code == 422
    assert patch(api, ev, check_date=DAY).status_code == 200                   # same day is fine
    ev = event(api)
    assert patch(api, ev, check_date="2026-11-24", check_start_time="09:00").status_code == 200
    ev = event(api)
    assert patch(api, ev, event_date="2026-11-30").status_code == 200          # the check moves with it
    assert event(api, "2026-11-30")["check_date"] == "2026-11-28"
    ev = event(api, "2026-11-30")
    assert patch(api, ev, check_date=None).status_code == 200                  # no check: no times
    d = event(api, "2026-11-30")
    assert (d["check_date"], d["check_start_time"]) == (None, None)


def test_check_technicians_and_check_done_date(api):
    ev = event(api)
    users = api.get("/api/users").json()
    patch(api, ev, check_date="2026-11-25")
    res = api.put(f"/api/events/{ev['id']}/check-participants", json={"user_ids": [users[0]["id"]]})
    assert res.status_code == 200, res.text
    day = api.get("/api/events", params={"start": "2026-11-25", "end": "2026-11-25"}).json()[0]
    assert day["user_ids"] == [users[0]["id"]]
    row = next(r for r in event(api)["servers"] if r["check_status"] == "da_fare")
    done = api.patch(f"/api/event-servers/{row['id']}", json={"version": row["version"], "check_status": "ok"}).json()
    assert done["check_executed_date"] == date.today().isoformat()


def test_warning_when_the_check_day_is_over(api):
    ev = event(api)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    # an intervention today with the check yesterday, servers still to check
    patch(api, ev, event_date=date.today().isoformat())
    ev = event(api, date.today().isoformat())
    patch(api, ev, check_date=yesterday)
    d = event(api, date.today().isoformat())
    assert d["check_warning"] is True
    for r in d["servers"]:
        api.patch(f"/api/event-servers/{r['id']}", json={"version": r["version"], "check_status": "ok"})
    assert event(api, date.today().isoformat())["check_warning"] is False


def test_check_technician_conflict(api):
    a = event(api)
    users = api.get("/api/users").json()
    patch(api, a, check_date="2026-11-25", check_start_time="15:00", check_end_time="17:00")
    api.put(f"/api/events/{a['id']}/check-participants", json={"user_ids": [users[0]["id"]]})
    pid = a["project"]["id"]
    other = api.post(f"/api/projects/{pid}/events", json={"event_date": "2026-11-25", "start_time": "16:00",
                                                          "end_time": "18:00", "participant_ids": [users[0]["id"]]})
    assert other.status_code == 201, other.text
    d = event(api)
    assert [(c["kind"], c["on_check"], c["other"]["id"]) for c in d["conflicts"]] == [("technician", True, other.json()["id"])]
    o = api.get(f"/api/events/{other.json()['id']}").json()
    assert [(c["other"]["id"], c["other"]["is_check"]) for c in o["conflicts"]] == [(a["id"], True)]


def test_duplicate_keeps_the_check_distance(api):
    ev = event(api)
    patch(api, ev, check_date="2026-11-25", check_start_time="15:00")
    res = api.post(f"/api/events/{ev['id']}/duplicate", json={"event_date": "2026-12-10"})
    assert res.status_code == 201, res.text
    assert (res.json()["check_date"], res.json()["check_start_time"]) == ("2026-12-09", "15:00:00")


def test_export_and_import_carry_the_check(api):
    ev = event(api)
    patch(api, ev, check_date="2026-11-25", check_start_time="15:00")
    cid = ev["project"]["customer_id"]
    data = api.get(f"/api/export/customers/{cid}").json()
    xe = next(e for p in data["projects"] for e in p["events"] if e["uid"] and e["event_date"] == DAY)
    assert xe["check_date"] == "2026-11-25" and xe["check_start_time"] == "15:00"
    others = [e for p in data["projects"] for e in p["events"] if e is not xe]
    assert all("check_date" not in e for e in others)        # only when planned
