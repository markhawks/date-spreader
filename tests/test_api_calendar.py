from datetime import date

import pytest

from app.seed import seed

TODAY = date(2026, 11, 10)


@pytest.fixture
def seeded_client(client, session_factory):
    with session_factory.begin() as s:
        seed(s, today=TODAY)
    return client


def test_projects_list_with_event_dates(seeded_client):
    res = seeded_client.get("/api/projects")
    assert res.status_code == 200
    projects = {p["name"]: p for p in res.json()}
    assert set(projects) == {"Alfa Logistica", "Beta Assicurazioni", "Gamma Retail"}
    alfa_dates = [e["event_date"] for e in projects["Alfa Logistica"]["events"]]
    assert alfa_dates == ["2026-10-18", "2026-11-15"]  # più interventi, in ordine


def test_events_in_three_month_window(seeded_client):
    res = seeded_client.get("/api/events", params={"start": "2026-10-01", "end": "2026-12-31"})
    assert res.status_code == 200
    events = res.json()
    assert [e["event_date"] for e in events] == [
        "2026-10-18",
        "2026-11-15",
        "2026-11-26",
        "2026-12-12",
    ]
    first = events[0]
    assert first["project_name"] == "Alfa Logistica"
    assert first["server_count"] == 3
    assert first["start_time"] == "20:00:00"


def test_events_range_is_inclusive_and_filtered(seeded_client):
    res = seeded_client.get("/api/events", params={"start": "2026-11-15", "end": "2026-11-26"})
    assert [e["event_date"] for e in res.json()] == ["2026-11-15", "2026-11-26"]


def test_events_empty_range(seeded_client):
    res = seeded_client.get("/api/events", params={"start": "2027-06-01", "end": "2027-06-30"})
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2026-12-01", "end": "2026-11-01"},  # fine prima dell'inizio
        {"start": "2020-01-01", "end": "2026-01-01"},  # intervallo troppo lungo
        {"start": "non-una-data", "end": "2026-01-01"},
        {"start": "2026-01-01"},  # end mancante
    ],
)
def test_events_invalid_params(seeded_client, params):
    assert seeded_client.get("/api/events", params=params).status_code == 422


def _event_id(client, day):
    return client.get("/api/events", params={"start": day, "end": day}).json()[0]["id"]


def test_event_detail_with_servers_and_participants(seeded_client):
    event_id = _event_id(seeded_client, "2026-10-18")
    res = seeded_client.get(f"/api/events/{event_id}")
    assert res.status_code == 200
    ev = res.json()
    assert ev["project"]["name"] == "Alfa Logistica"
    assert ev["version"] == 1
    assert [s["hostname"] for s in ev["servers"]] == [  # nell'ordine della tabella
        "alfa-app01-test.example.com",
        "alfa-web01.example.com",
        "alfa-db01.example.com",
    ]
    db = ev["servers"][2]
    assert db["migration_status"] == "rinviata"
    assert db["assigned_user"]["display_name"] == "Marco Neri"
    assert db["current_kernel"].startswith("3.10.0")
    assert {p["display_name"] for p in ev["participants"]} == {"Sara Verdi", "Marco Neri"}


def test_same_server_has_independent_rows_per_event(seeded_client):
    """alfa-db01 è in due interventi, con stato diverso in ciascuno."""
    rows = []
    for day in ("2026-10-18", "2026-11-15"):
        ev = seeded_client.get(f"/api/events/{_event_id(seeded_client, day)}").json()
        rows += [s for s in ev["servers"] if s["hostname"].startswith("alfa-db01")]
    assert len(rows) == 2
    assert rows[0]["server_id"] == rows[1]["server_id"]
    assert rows[0]["id"] != rows[1]["id"]
    assert [r["migration_status"] for r in rows] == ["rinviata", "pianificata"]


def test_event_detail_not_found(seeded_client):
    assert seeded_client.get("/api/events/99999").status_code == 404


def test_day_detail(seeded_client):
    res = seeded_client.get("/api/days/2026-11-26")
    assert res.status_code == 200
    events = res.json()
    assert len(events) == 1
    assert events[0]["project"]["name"] == "Beta Assicurazioni"
    assert len(events[0]["servers"]) == 3


def test_day_without_events_is_empty(seeded_client):
    assert seeded_client.get("/api/days/2026-11-11").json() == []


def test_day_invalid_date(seeded_client):
    assert seeded_client.get("/api/days/2026-13-40").status_code == 422
