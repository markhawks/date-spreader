"""Elenco dei sistemi operativi selezionabili."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.models import EventServer, OperatingSystem, Server
from app.repositories.servers import Conflict, ValidationProblem


def list_os(session: Session, include_inactive: bool = False) -> list[tuple[OperatingSystem, int]]:
    """Voci in ordine di famiglia e versione NUMERICA (10.2 dopo 9.8), con il numero di server che le usano."""
    stmt = select(OperatingSystem).order_by(OperatingSystem.family, OperatingSystem.major, OperatingSystem.minor)
    if not include_inactive:
        stmt = stmt.where(OperatingSystem.is_active)
    items = list(session.scalars(stmt))
    counts = dict(session.execute(
        select(Server.operating_system, func.count()).where(Server.operating_system.is_not(None))
        .group_by(Server.operating_system)
    ).all())
    targets = dict(session.execute(
        select(EventServer.target_operating_system, func.count()).where(EventServer.target_operating_system.is_not(None))
        .group_by(EventServer.target_operating_system)
    ).all())
    return [(o, counts.get(o.name, 0) + targets.get(o.name, 0)) for o in items]


def active_names(session: Session) -> set[str]:
    return {o.name for o in session.scalars(select(OperatingSystem).where(OperatingSystem.is_active))}


def check_server_os(session: Session, value: str | None, current: str | None = None) -> None:
    """Il sistema operativo deve essere una voce attiva dell'elenco (o restare quello attuale)."""
    if value is None or value == current:
        return
    if value not in active_names(session):
        raise ValidationProblem(
            f"«{value}» non è nell'elenco dei sistemi operativi. Un amministratore può aggiungerlo da "
            "menu utente → Sistemi operativi."
        )


def create_os(session: Session, family: str, major: int, minor: int | None) -> OperatingSystem:
    exists = session.scalars(select(OperatingSystem).where(
        func.lower(OperatingSystem.family) == family.lower(), OperatingSystem.major == major,
        OperatingSystem.minor.is_(None) if minor is None else OperatingSystem.minor == minor,
    )).first()
    if exists is not None:
        raise Conflict(f"«{exists.name}» è già nell'elenco" + ("" if exists.is_active else " (disattivato: riattivalo)") + ".")
    item = OperatingSystem(family=family, major=major, minor=minor, is_active=True)
    session.add(item)
    session.flush()
    audit.record(session, "create", "operating_systems", item.id, {"name": (None, item.name)})
    return item


def set_active(session: Session, item: OperatingSystem, active: bool) -> None:
    if item.is_active != active:
        audit.record(session, "update", "operating_systems", item.id, {"is_active": (item.is_active, active)})
        item.is_active = active
        session.flush()


def delete_os(session: Session, item: OperatingSystem) -> None:
    used = session.scalar(select(func.count()).select_from(Server).where(Server.operating_system == item.name))
    used += session.scalar(select(func.count()).select_from(EventServer).where(EventServer.target_operating_system == item.name))
    if used:
        raise Conflict(f"«{item.name}» è in uso ({used} tra server e SO target): disattivalo invece di eliminarlo.")
    audit.record(session, "delete", "operating_systems", item.id, {"name": (item.name, None)})
    session.delete(item)
    session.flush()
