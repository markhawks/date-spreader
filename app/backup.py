"""Database backups: create (online, verified), list, rotate, restore.

Backups are SQLite files in `data/backups/` (next to the database), named

    datespreader-backup-YYYYMMDD-HHMMSS-<kind>.sqlite3

where <kind> is "daily" (nightly timer), "manual" (command line or portal), "pre-migration"
(automatic, before a schema upgrade) or "pre-restore" (state saved before a restore).
Only files with this name are rotated; any other file in the folder (older manual copies,
install.sh "pre-aggiornamento" copies) is listed but never deleted.

Rotation ("grandfather-father-son"): keep everything from the last 48 hours, plus the newest
backup of each of the last 7 days, of each of the last 4 ISO weeks and of each of the last
12 months (configurable with BACKUP_KEEP_DAILY / _WEEKLY / _MONTHLY).

Copying the folder to another machine is left to the company backup system.
"""

from __future__ import annotations

import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from app.config import Settings
from app.i18n import tr

KINDS = ("daily", "manual", "pre-migration", "pre-restore")
NAME_RE = re.compile(r"^datespreader-backup-(\d{8})-(\d{6})-([a-z-]+)\.sqlite3$")
# Any SQLite file in the folder can be listed/downloaded; the name must stay simple (no paths)
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.sqlite3$")
RECENT = timedelta(hours=48)


class BackupError(Exception):
    """Backup or restore not possible (message for the user)."""


@dataclass(frozen=True)
class BackupInfo:
    name: str
    path: Path
    size: int
    created: datetime        # from the name for our backups, otherwise the file time
    kind: str                # one of KINDS, or "other" for files not created by this module

    @property
    def rotated(self) -> bool:
        return self.kind != "other"


def backup_dir(settings: Settings) -> Path:
    return settings.database_path.parent / "backups"


def keep_counts() -> tuple[int, int, int]:
    def num(name: str, default: int) -> int:
        try:
            return max(0, int(os.environ.get(name, default)))
        except ValueError:
            return default
    return num("BACKUP_KEEP_DAILY", 7), num("BACKUP_KEEP_WEEKLY", 4), num("BACKUP_KEEP_MONTHLY", 12)


def _integrity(path: Path) -> str:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        return con.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        con.close()


def create_backup(settings: Settings, kind: str = "manual", now: datetime | None = None) -> BackupInfo:
    """Consistent copy of the live database (SQLite online backup API, safe while the portal runs),
    checked with PRAGMA integrity_check before it gets its final name."""
    if kind not in KINDS:
        raise ValueError(kind)
    src_path = settings.database_path
    if not src_path.is_file():
        raise BackupError(tr("backup.db_missing", path=src_path))
    folder = backup_dir(settings)
    folder.mkdir(parents=True, exist_ok=True)
    now = now or datetime.now()
    final = folder / f"datespreader-backup-{now:%Y%m%d-%H%M%S}-{kind}.sqlite3"
    while final.exists():  # two backups in the same second: take the next second
        now += timedelta(seconds=1)
        final = folder / f"datespreader-backup-{now:%Y%m%d-%H%M%S}-{kind}.sqlite3"
    tmp = folder / f".{final.name}.tmp"
    src = sqlite3.connect(src_path, timeout=30)
    dst = sqlite3.connect(tmp)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    result = _integrity(tmp)
    if result != "ok":
        tmp.unlink(missing_ok=True)
        raise BackupError(tr("backup.copy_corrupt", result=result))
    tmp.rename(final)
    os.chmod(final, 0o640)
    return _info(final)


def _info(path: Path) -> BackupInfo:
    st = path.stat()
    m = NAME_RE.match(path.name)
    if m:
        created = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
        kind = m.group(3) if m.group(3) in KINDS else "other"
    else:
        created, kind = datetime.fromtimestamp(st.st_mtime), "other"
    return BackupInfo(name=path.name, path=path, size=st.st_size, created=created, kind=kind)


def list_backups(settings: Settings) -> list[BackupInfo]:
    """All SQLite files in the backup folder, newest first."""
    folder = backup_dir(settings)
    if not folder.is_dir():
        return []
    items = [_info(p) for p in folder.iterdir() if p.is_file() and SAFE_NAME_RE.match(p.name)]
    return sorted(items, key=lambda b: b.created, reverse=True)


def find_backup(settings: Settings, name: str) -> BackupInfo | None:
    """A backup by file name (only plain names inside the backup folder: no paths)."""
    if not SAFE_NAME_RE.match(name or ""):
        return None
    path = backup_dir(settings) / name
    return _info(path) if path.is_file() else None


def rotation_plan(backups: list[BackupInfo], now: datetime | None = None) -> list[BackupInfo]:
    """Backups (created by this module) that the rotation would delete."""
    now = now or datetime.now()
    keep_days, keep_weeks, keep_months = keep_counts()
    ours = sorted((b for b in backups if b.rotated), key=lambda b: b.created, reverse=True)
    keep: set[str] = set()
    days: list = []
    weeks: list = []
    months: list = []
    for b in ours:
        if now - b.created <= RECENT:
            keep.add(b.name)
        day = b.created.date()
        week = tuple(b.created.isocalendar())[:2]
        month = (b.created.year, b.created.month)
        if day not in days and len(days) < keep_days:
            days.append(day)
            keep.add(b.name)
        if week not in weeks and len(weeks) < keep_weeks:
            weeks.append(week)
            keep.add(b.name)
        if month not in months and len(months) < keep_months:
            months.append(month)
            keep.add(b.name)
    return [b for b in ours if b.name not in keep]


def rotate(settings: Settings, now: datetime | None = None) -> list[BackupInfo]:
    """Deletes the backups the rotation does not keep. Returns them."""
    removed = rotation_plan(list_backups(settings), now)
    for b in removed:
        b.path.unlink(missing_ok=True)
    return removed


def restore_backup(settings: Settings, source: Path) -> BackupInfo:
    """Replaces the live database with `source` (a backup file).

    The file is checked first; the current database is saved as a "pre-restore" backup;
    then the content is copied INTO the live database with the SQLite backup API, so the
    file keeps its owner and permissions. The caller then applies the migrations (the
    backup may come from an older version) and restarts the service.
    """
    if not source.is_file():
        raise BackupError(tr("backup.file_missing", path=source))
    try:
        result = _integrity(source)
        con = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
        try:
            tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            con.close()
    except sqlite3.DatabaseError as exc:
        raise BackupError(tr("backup.not_sqlite", error=exc)) from None
    if result != "ok":
        raise BackupError(tr("backup.file_corrupt", result=result))
    if not {"alembic_version", "projects", "events"} <= tables:
        raise BackupError(tr("backup.not_datespreader"))
    saved = create_backup(settings, "pre-restore") if settings.database_path.is_file() else None
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    dst = sqlite3.connect(settings.database_path, timeout=30)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return saved
