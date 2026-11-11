"""Database backups from the portal (administrators only): list, "Backup now", download.

The backups themselves are made by app/backup.py (also used by the nightly timer and the CLI).
Restoring is deliberately NOT available from the browser: it needs the service stopped
(`python -m app.cli restore FILE`, see the install guide).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import audit
from app import backup as backups
from app.api.deps import get_session
from app.auth import require_admin
from app.i18n import tr

router = APIRouter(tags=["backup"], dependencies=[Depends(require_admin)])
SessionDep = Annotated[Session, Depends(get_session)]


class BackupOut(BaseModel):
    name: str
    size: int
    created: datetime
    kind: str          # daily | manual | pre-migration | pre-restore | other


class BackupList(BaseModel):
    folder: str
    keep_daily: int
    keep_weekly: int
    keep_monthly: int
    backups: list[BackupOut]


def _out(b: backups.BackupInfo) -> BackupOut:
    return BackupOut(name=b.name, size=b.size, created=b.created, kind=b.kind)


@router.get("/backups", response_model=BackupList)
def list_backups(request: Request) -> BackupList:
    settings = request.app.state.settings
    daily, weekly, monthly = backups.keep_counts()
    return BackupList(
        folder=str(backups.backup_dir(settings)), keep_daily=daily, keep_weekly=weekly, keep_monthly=monthly,
        backups=[_out(b) for b in backups.list_backups(settings)],
    )


@router.post("/backups", response_model=BackupOut, status_code=201)
def backup_now(request: Request, session: SessionDep) -> BackupOut:
    """Verified backup of the database right now (kind "manual"), then rotation."""
    settings = request.app.state.settings
    try:
        info = backups.create_backup(settings, "manual")
    except backups.BackupError as exc:
        raise HTTPException(500, str(exc)) from None
    backups.rotate(settings)
    audit.record(session, "backup", "database", 0, {"file": (None, info.name)})
    session.commit()
    return _out(info)


@router.get("/backups/{name}")
def download_backup(request: Request, session: SessionDep, name: str) -> FileResponse:
    """The backup file (only plain file names inside the backup folder)."""
    info = backups.find_backup(request.app.state.settings, name)
    if info is None:
        raise HTTPException(404, tr("backup.not_found"))
    audit.record(session, "download", "database", 0, {"file": (None, info.name)})
    session.commit()
    return FileResponse(info.path, media_type="application/vnd.sqlite3", filename=info.name,
                        headers={"Cache-Control": "no-store"})
