"""Elenco dei sistemi operativi: consultazione per tutti, gestione per gli amministratori."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.auth import require_admin
from app.i18n import tr
from app.models import OperatingSystem
from app.repositories import oslist as repo
from app.repositories.servers import Conflict

router = APIRouter(tags=["sistemi operativi"])
SessionDep = Annotated[Session, Depends(get_session)]


class OsOut(BaseModel):
    id: int
    name: str           # testo salvato sul server, es. "Red Hat Enterprise Linux 9.8"
    family: str
    major: int
    minor: int | None
    is_active: bool
    server_count: int   # server che lo usano


class OsCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: str = Field(default="Red Hat Enterprise Linux", max_length=100)
    major: int = Field(ge=0, le=999)
    minor: int | None = Field(default=None, ge=0, le=999)

    @field_validator("family", mode="before")
    @classmethod
    def _family(cls, v):
        v = " ".join(str(v or "").split())
        if not v:
            raise ValueError(tr("os.family_required"))
        return v


class OsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool


def _out(item: OperatingSystem, count: int) -> OsOut:
    return OsOut(id=item.id, name=item.name, family=item.family, major=item.major, minor=item.minor,
                 is_active=item.is_active, server_count=count)


@router.get("/operating-systems", response_model=list[OsOut])
def list_os(
    session: SessionDep,
    all: Annotated[bool, Query(description="Includi le voci disattivate")] = False,
) -> list[OsOut]:
    return [_out(o, n) for o, n in repo.list_os(session, include_inactive=all)]


@router.post("/operating-systems", response_model=OsOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
def create_os(session: SessionDep, data: OsCreate) -> OsOut:
    try:
        item = repo.create_os(session, data.family, data.major, data.minor)
        session.commit()
    except Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    return _out(item, 0)


def _get(session: Session, os_id: int) -> OperatingSystem:
    item = session.get(OperatingSystem, os_id)
    if item is None:
        raise HTTPException(404, tr("os.not_found"))
    return item


@router.patch("/operating-systems/{os_id}", response_model=OsOut, dependencies=[Depends(require_admin)])
def update_os(session: SessionDep, os_id: int, data: OsPatch) -> OsOut:
    """Solo attivazione/disattivazione: rinominare cambierebbe il significato dei server che lo usano."""
    item = _get(session, os_id)
    repo.set_active(session, item, data.is_active)
    session.commit()
    count = next((n for o, n in repo.list_os(session, include_inactive=True) if o.id == item.id), 0)
    return _out(item, count)


@router.delete("/operating-systems/{os_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)])
def delete_os(session: SessionDep, os_id: int) -> Response:
    """Elimina una voce mai usata (es. inserita per errore)."""
    item = _get(session, os_id)
    try:
        repo.delete_os(session, item)
        session.commit()
    except Conflict as exc:
        session.rollback()
        raise HTTPException(409, {"message": str(exc), "current": None}) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
