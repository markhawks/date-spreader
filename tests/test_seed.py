from datetime import date

import pytest
from sqlalchemy import func, select

from app.models import Event, EventServer, Project, Server, statuses
from app.seed import AlreadySeededError, month_day, seed

TODAY = date(2026, 11, 10)


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


@pytest.fixture
def seeded(session_factory):
    with session_factory.begin() as s:
        seed(s, today=TODAY)
    return session_factory


def test_seed_counts(seeded):
    with seeded() as s:
        assert count(s, Project) == 3
        assert count(s, Event) == 4
        assert count(s, Server) == 10


def test_seed_dates_fall_in_three_month_window(seeded):
    start, end = month_day(TODAY, -1, 1), month_day(TODAY, 1, 31)
    with seeded() as s:
        dates = s.scalars(select(Event.event_date)).all()
    assert all(start <= d <= end for d in dates)
    months = {d.month for d in dates}
    assert months == {10, 11, 12}


def test_seed_has_project_with_multiple_events(seeded):
    with seeded() as s:
        per_project = s.execute(
            select(Event.project_id, func.count()).group_by(Event.project_id)
        ).all()
    assert max(n for _, n in per_project) >= 2


def test_seed_has_server_in_multiple_events(seeded):
    with seeded() as s:
        per_server = s.execute(
            select(EventServer.server_id, func.count()).group_by(EventServer.server_id)
        ).all()
    assert max(n for _, n in per_server) >= 2


def test_seed_uses_only_fictitious_and_valid_data(seeded):
    with seeded() as s:
        servers = s.scalars(select(Server)).all()
        links = s.scalars(select(EventServer)).all()
    assert all(srv.hostname.endswith(".example.com") for srv in servers)
    doc_ranges = ("192.0.2.", "198.51.100.", "203.0.113.")
    assert all(srv.ip_address.startswith(doc_ranges) for srv in servers)
    assert all(srv.environment in statuses.ENVIRONMENTS for srv in servers)
    assert all(link.check_status in statuses.CHECK_STATUSES for link in links)
    assert all(link.migration_status in statuses.MIGRATION_STATUSES for link in links)


def test_seed_refuses_twice_without_reset(seeded):
    with seeded.begin() as s, pytest.raises(AlreadySeededError):
        seed(s, today=TODAY)


def test_seed_marks_everything_as_demo(seeded):
    from app.models import User

    with seeded() as s:
        assert all(p.is_demo for p in s.scalars(select(Project)))
        assert all(x.is_demo for x in s.scalars(select(Server)))
        assert all(u.is_demo for u in s.scalars(select(User)))


@pytest.mark.parametrize(
    ("base", "offset", "day", "expected"),
    [
        (date(2026, 1, 31), -1, 18, date(2025, 12, 18)),
        (date(2026, 12, 5), 1, 12, date(2027, 1, 12)),
        (date(2026, 1, 15), 1, 31, date(2026, 2, 28)),
    ],
)
def test_month_day(base, offset, day, expected):
    assert month_day(base, offset, day) == expected
