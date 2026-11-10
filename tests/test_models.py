from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from app.models import Event, EventServer, Project, Server


@pytest.fixture
def sample(session_factory):
    with session_factory.begin() as s:
        project = Project(name="Progetto prova")
        server = Server(hostname="test01.example.com")
        event = Event(project=project, event_date=date(2026, 11, 20))
        s.add(EventServer(event=event, server=server))
        s.flush()
        return {"project": project.id, "server": server.id, "event": event.id}


def test_defaults_and_initial_version(session_factory, sample):
    with session_factory() as s:
        link = s.scalars(select(EventServer)).one()
        assert link.check_status == "da_fare"
        assert link.migration_status == "pianificata"
        assert link.version == 1


def test_optimistic_locking_blocks_silent_overwrite(session_factory, sample):
    """Due utenti caricano lo stesso server; il secondo salvataggio deve fallire."""
    s1, s2 = session_factory(), session_factory()
    try:
        a = s1.get(Server, sample["server"])
        b = s2.get(Server, sample["server"])

        a.notes = "modifica utente A"
        s1.commit()
        assert a.version == 2

        b.notes = "modifica utente B"
        with pytest.raises(StaleDataError):
            s2.commit()
    finally:
        s1.close()
        s2.close()

    with session_factory() as s:
        assert s.get(Server, sample["server"]).notes == "modifica utente A"


def test_same_server_only_once_per_event(session_factory, sample):
    with pytest.raises(IntegrityError), session_factory.begin() as s:
        s.add(EventServer(event_id=sample["event"], server_id=sample["server"]))


def test_hostname_is_unique(session_factory, sample):
    with pytest.raises(IntegrityError), session_factory.begin() as s:
        s.add(Server(hostname="test01.example.com"))


def test_server_in_use_cannot_be_deleted(session_factory, sample):
    """Le foreign key sono attive (PRAGMA foreign_keys=ON): ON DELETE RESTRICT."""
    with pytest.raises(IntegrityError), session_factory.begin() as s:
        s.execute(Server.__table__.delete().where(Server.id == sample["server"]))


def test_deleting_project_removes_events_and_rows_but_keeps_servers(session_factory, sample):
    with session_factory.begin() as s:
        s.delete(s.get(Project, sample["project"]))
    with session_factory() as s:
        assert s.scalar(select(func.count()).select_from(Event)) == 0
        assert s.scalar(select(func.count()).select_from(EventServer)) == 0
        assert s.get(Server, sample["server"]) is not None
