"""Sync of a customer's projects from a file exported by another installation (administrators).

1. POST /api/sync/preview: the differences (writes nothing);
2. POST /api/sync/apply: applies the chosen items, after a backup, in one transaction.
See app/sync.py.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy.orm import Session

from app import backup as backups
from app.api.deps import get_session
from app.auth import require_admin
from app.i18n import tr
from app.schemas.transfer import ExportFile, _In
from app.sync import SyncError, apply, compare

router = APIRouter(tags=["sync"], dependencies=[Depends(require_admin)])
SessionDep = Annotated[Session, Depends(get_session)]


class SyncPreview(_In):
    data: ExportFile


class SyncApply(_In):
    data: ExportFile
    token: str = Field(max_length=64)
    decisions: dict[str, bool] = Field(default_factory=dict)   # item key → take the file's version


def _fail(exc: SyncError):
    raise HTTPException(exc.status, {"message": str(exc), "code": "sync"})


@router.post("/sync/preview")
def sync_preview(session: SessionDep, body: SyncPreview) -> dict[str, Any]:
    try:
        return compare(session, body.data)
    except SyncError as exc:
        _fail(exc)
    finally:
        session.rollback()


@router.post("/sync/apply")
def sync_apply(request: Request, session: SessionDep, body: SyncApply) -> dict[str, Any]:
    try:
        compare(session, body.data)          # refuse a wrong file before taking a backup
    except SyncError as exc:
        session.rollback()
        _fail(exc)
    session.rollback()
    settings = request.app.state.settings
    try:
        saved = backups.create_backup(settings, "pre-sync")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, {"message": tr("sync.backup_failed", error=exc), "code": "backup"}) from None
    try:
        result = apply(session, body.data, body.token, body.decisions)
        session.commit()
    except SyncError as exc:
        session.rollback()
        _fail(exc)
    except Exception:
        session.rollback()
        raise
    return {**result, "backup": saved.name}
