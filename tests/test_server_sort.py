"""Order of the server rows of an intervention, saved on the intervention (app/server_sort.py)."""

from datetime import date

import pytest

from app.seed import seed

DAY = "2026-11-26"   # Beta: beta-dev01 (DEV), beta-app01, beta-app02 (PROD, DC2)


@pytest.fixture
def api(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=date(2026, 11, 10))
    return client


def event(api):
    eid = next(e["id"] for e in api.get("/api/events", params={"start": DAY, "end": DAY}).json() if e["kind"] == "event")
    return api.get(f"/api/events/{eid}").json()


def sort_by(api, spec):
    ev = event(api)
    res = api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "server_sort": spec})
    assert res.status_code == 200, res.text
    return [r["hostname"].split(".")[0] for r in event(api)["servers"]]


def set_row(api, host, **values):
    row = next(r for r in event(api)["servers"] if r["hostname"].startswith(host))
    body = {"version": row["version"], **values}
    if set(values) & {"ip_address", "location"}:
        body["server_version"] = row["server_version"]
    assert api.patch(f"/api/event-servers/{row['id']}", json=body).status_code == 200


def test_order_is_saved_on_the_intervention_for_everybody(api):
    assert sort_by(api, "hostname") == ["beta-app01", "beta-app02", "beta-dev01"]
    assert sort_by(api, "-hostname") == ["beta-dev01", "beta-app02", "beta-app01"]
    assert event(api)["server_sort"] == "-hostname"
    assert sort_by(api, None) == ["beta-dev01", "beta-app01", "beta-app02"]      # order of insertion


def test_numeric_ip_dates_statuses_and_empty_values_last(api):
    set_row(api, "beta-dev01", ip_address="198.51.100.9")
    set_row(api, "beta-app01", ip_address="198.51.100.10")
    assert sort_by(api, "ip_address")[:2] == ["beta-dev01", "beta-app01"]       # 9 before 10, not as text
    # location: beta-dev01 has none -> last in both directions
    assert sort_by(api, "location")[-1] == "beta-dev01"
    assert sort_by(api, "-location")[-1] == "beta-dev01"
    set_row(api, "beta-app02", executed_date="2026-11-20")
    set_row(api, "beta-app01", executed_date="2026-11-21")
    assert sort_by(api, "executed_date") == ["beta-app02", "beta-app01", "beta-dev01"]
    # statuses in the order of the work: da_fare (beta-app02) < ok (beta-dev01) < ko (beta-app01)
    assert sort_by(api, "check_status") == ["beta-app02", "beta-dev01", "beta-app01"]


def test_bad_column_is_refused(api):
    ev = event(api)
    assert api.patch(f"/api/events/{ev['id']}", json={"version": ev["version"], "server_sort": "password"}).status_code == 422
