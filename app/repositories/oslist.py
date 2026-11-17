"""Elenco dei sistemi operativi selezionabili."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.i18n import tr
import json

from app.models import AppMeta, EventServer, OperatingSystem, Server
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
            tr("os.not_in_list", name=value)
        )


def create_os(session: Session, family: str, major: int, minor: int | None) -> OperatingSystem:
    exists = session.scalars(select(OperatingSystem).where(
        func.lower(OperatingSystem.family) == family.lower(), OperatingSystem.major == major,
        OperatingSystem.minor.is_(None) if minor is None else OperatingSystem.minor == minor,
    )).first()
    if exists is not None:
        raise Conflict(tr("os.exists" if exists.is_active else "os.exists_inactive", name=exists.name))
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
        raise Conflict(tr("os.in_use", name=item.name, count=used))
    audit.record(session, "delete", "operating_systems", item.id, {"name": (item.name, None)})
    session.delete(item)
    session.flush()


# --- Up-to-date versions ("baselines"): for each family and major, the minor that is considered up to date.
# A server with the same family and major but an older minor is shown as outdated (yellow) in the OS column.
BASELINES_KEY = "os_baselines"
DEFAULT_BASELINES = [
    {"family": "Red Hat Enterprise Linux", "major": 7, "minor": 9},
    {"family": "Red Hat Enterprise Linux", "major": 8, "minor": 10},
    {"family": "Red Hat Enterprise Linux", "major": 9, "minor": 8},
    {"family": "Red Hat Enterprise Linux", "major": 10, "minor": 3},
]


def _sorted(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda b: (b["family"].lower(), b["major"]))


def get_baselines(session: Session) -> list[dict]:
    """The up-to-date version of each family and major (the defaults until an administrator changes them)."""
    row = session.get(AppMeta, BASELINES_KEY)
    if row is None:
        return _sorted([dict(b) for b in DEFAULT_BASELINES])
    try:
        return _sorted(json.loads(row.value))
    except ValueError:
        return _sorted([dict(b) for b in DEFAULT_BASELINES])


def set_baselines(session: Session, items: list[dict]) -> list[dict]:
    """Replaces all the up-to-date versions (one per family and major)."""
    seen: dict[tuple[str, int], dict] = {}
    for b in items:
        key = (b["family"].lower(), b["major"])
        if key in seen:
            raise ValidationProblem(tr("os.baseline_duplicate", name=f"{b['family']} {b['major']}"))
        seen[key] = {"family": b["family"], "major": b["major"], "minor": b["minor"]}
    new = _sorted(list(seen.values()))
    old = get_baselines(session)
    text = lambda lst: ", ".join(f"{b['family']} {b['major']}.{b['minor']}" for b in lst) or "-"
    row = session.get(AppMeta, BASELINES_KEY)
    if row is None:
        session.add(AppMeta(key=BASELINES_KEY, value=json.dumps(new)))
    else:
        row.value = json.dumps(new)
    session.flush()
    if new != old:
        audit.record(session, "update", "operating_systems", 0, {"baselines": (text(old), text(new))})
    return new
