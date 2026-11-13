"""Scheduling conflicts: same server on the same day, same technician at overlapping times."""

from datetime import date

import pytest

from app.seed import seed


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def event_on(api, day):
    eid = api.get("/api/events", params={"start": day, "end": day}).json()[0]["id"]
    return api.get(f"/api/events/{eid}").json()


def user_id(api, name):
    return next(u["id"] for u in api.get("/api/users").json() if u["display_name"] == name)


def summaries(api, day):
    return {e["id"]: e for e in api.get("/api/events", params={"start": day, "end": day}).json()}


def project_id(api, name):
    return next(p["id"] for p in api.get("/api/projects").json() if p["name"] == name)


def test_no_conflicts_in_the_sample_data(api):
    for e in api.get("/api/events", params={"start": "2026-10-01", "end": "2026-12-31"}).json():
        assert e["conflict_users"] == [] and e["conflict_servers"] == 0
        assert api.get(f"/api/events/{e['id']}").json()["conflicts"] == []


def test_same_server_same_day_and_technician_at_overlapping_times(api):
    beta = event_on(api, "2026-11-26")  # 18:30–22:00, participant Giulia Gallo
    giulia = user_id(api, "Giulia Gallo")
    other = api.post(f"/api/projects/{project_id(api, 'Gamma Retail')}/events", json={
        "event_date": "2026-11-26", "start_time": "21:00", "end_time": "23:00", "participant_ids": [giulia],
    }).json()
    host = beta["servers"][0]["hostname"]
    assert api.post(f"/api/events/{other['id']}/servers", json={"hostname": host}).status_code == 201

    s = summaries(api, "2026-11-26")
    assert s[beta["id"]]["conflict_users"] == [giulia] and s[beta["id"]]["conflict_servers"] == 1
    assert s[other["id"]]["conflict_users"] == [giulia] and s[other["id"]]["conflict_servers"] == 1

    conflicts = api.get(f"/api/events/{beta['id']}").json()["conflicts"]
    kinds = {(c["kind"], c["name"], c["other"]["id"]) for c in conflicts}
    assert kinds == {("technician", "Giulia Gallo", other["id"]), ("server", host, other["id"])}
    assert conflicts[0]["other"]["project_name"] == "Gamma Retail"
    # the day view carries them too
    day = {e["id"]: e for e in api.get("/api/days/2026-11-26").json()}
    assert len(day[other["id"]]["conflicts"]) == 2


def test_times_that_do_not_overlap_are_not_a_technician_conflict(api):
    beta = event_on(api, "2026-11-26")  # 18:30–22:00
    giulia = user_id(api, "Giulia Gallo")
    api.post(f"/api/projects/{project_id(api, 'Gamma Retail')}/events", json={
        "event_date": "2026-11-26", "start_time": "09:00", "end_time": "13:00", "participant_ids": [giulia],
    })
    assert summaries(api, "2026-11-26")[beta["id"]]["conflict_users"] == []
    # without a start time an intervention takes the whole day: it overlaps
    allday = api.post(f"/api/projects/{project_id(api, 'Gamma Retail')}/events", json={
        "event_date": "2026-11-26", "participant_ids": [giulia],
    }).json()
    assert summaries(api, "2026-11-26")[allday["id"]]["conflict_users"] == [giulia]


def test_cancelled_interventions_are_ignored(api):
    beta = event_on(api, "2026-11-26")
    other = api.post(f"/api/projects/{project_id(api, 'Gamma Retail')}/events", json={"event_date": "2026-11-26"}).json()
    api.post(f"/api/events/{other['id']}/servers", json={"hostname": beta["servers"][0]["hostname"]})
    assert summaries(api, "2026-11-26")[beta["id"]]["conflict_servers"] == 1
    other = api.get(f"/api/events/{other['id']}").json()
    api.patch(f"/api/events/{other['id']}", json={"version": other["version"], "status": "annullato"})
    assert summaries(api, "2026-11-26")[beta["id"]]["conflict_servers"] == 0
    assert api.get(f"/api/events/{beta['id']}").json()["conflicts"] == []


def test_event_detail_carries_the_customer_id(api):
    """The card needs the customer id to filter by customer from the customer name."""
    ev = event_on(api, "2026-11-26")
    project = next(p for p in api.get("/api/projects").json() if p["id"] == ev["project"]["id"])
    assert ev["project"]["customer_id"] == project["customer_id"] is not None
