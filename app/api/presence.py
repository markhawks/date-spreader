"""Users connected now (app/presence.py): the button with the bust next to «Gantt», and the notice to
everybody before a restart."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import presence
from app.auth import AuthUser, require_admin, require_user

router = APIRouter(tags=["presenza"])

PAGE_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


class PresenceIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    page_id: str = Field(min_length=8, max_length=64)
    visible: bool = True
    activity: str = Field(default="calendar", max_length=20)
    detail: str | None = Field(default=None, max_length=200)   # e.g. the project of the open server table
    editing: bool = False                                       # an open form or a cell being changed

    @field_validator("page_id")
    @classmethod
    def _page(cls, v):
        if not PAGE_ID.match(v):
            raise ValueError("page_id")
        return v


class Notice(BaseModel):
    message: str
    by: str | None = None
    at: str
    until: str | None = None


class PresenceUser(BaseModel):
    user_id: int
    name: str
    state: str              # "active" (using it now) | "background" (open in a background tab)
    activity: str
    detail: str | None
    editing: bool
    since: str              # UTC ISO: first page opened
    last_seen: str
    pages: int              # pages (tabs) open
    ip: str | None = None           # administrators only
    user_agent: str | None = None   # administrators only


class PresenceOut(BaseModel):
    count: int                       # users connected (active or in the background)
    users: list[PresenceUser] = []   # only in GET
    notice: Notice | None = None


class NoticeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=presence.NOTICE_MAX)
    minutes: int | None = Field(default=None, ge=1, le=24 * 60)   # empty = until removed (or the restart)

    @field_validator("message", mode="before")
    @classmethod
    def _strip(cls, v):
        return " ".join(str(v or "").split())


def _save(request: Request, force: bool = False) -> None:
    presence.write_file(presence.presence_file(request.app.state.settings.database_path), force=force)


@router.post("/presence", response_model=PresenceOut)
def report(request: Request, data: PresenceIn, user: Annotated[AuthUser, Depends(require_user)]) -> PresenceOut:
    """An open page reports itself; the answer has the number of users connected and the notice."""
    changed = presence.report(
        data.page_id, session_id=getattr(request.state, "auth_session_id", None), user_id=user.id,
        name=user.display_name, visible=data.visible, activity=data.activity, detail=data.detail,
        editing=data.editing, ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    _save(request, force=changed)
    return PresenceOut(count=len(presence.snapshot()), notice=presence.notice())


@router.post("/presence/leave", status_code=204)
def leave(request: Request, data: PresenceIn) -> Response:
    """The page is being closed."""
    presence.leave(data.page_id)
    _save(request, force=True)
    return Response(status_code=204)


@router.get("/presence", response_model=PresenceOut)
def who(user: Annotated[AuthUser, Depends(require_user)]) -> PresenceOut:
    """Users connected now, with what they are doing (browser and IP only for administrators)."""
    users = presence.snapshot()
    if not user.is_admin:
        users = [{**u, "ip": None, "user_agent": None} for u in users]
    return PresenceOut(count=len(users), users=users, notice=presence.notice())


@router.put("/presence/notice", response_model=PresenceOut, dependencies=[Depends(require_admin)])
def set_notice(data: NoticeIn, user: Annotated[AuthUser, Depends(require_user)]) -> PresenceOut:
    """Notice shown to everybody within seconds (e.g. "the portal restarts at 18:00, save your work")."""
    presence.set_notice(data.message, by=user.display_name, minutes=data.minutes)
    return PresenceOut(count=len(presence.snapshot()), notice=presence.notice())


@router.delete("/presence/notice", status_code=204, dependencies=[Depends(require_admin)])
def clear_notice() -> Response:
    presence.set_notice(None)
    return Response(status_code=204)
