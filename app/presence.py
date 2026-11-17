"""Who is using the portal now, and what they are doing (to avoid restarts while someone works).

Each open page reports itself (POST /api/presence) every few seconds while it is in the foreground and
about once a minute in the background, with what it shows (calendar, Gantt, server table of an
intervention…) and whether an edit is in progress (an open form, a cell being changed). The register
lives in memory: it is lost at a restart, and the pages report themselves again within seconds.

A copy goes to `presence.json` next to the database (at most every few seconds), so that the command
line (`datespreader who`, `datespreader wait-idle`) can read it from another process.

The notice to everybody (e.g. "the portal restarts at 18:00") is also in memory only: it disappears by
itself with the restart it announces.
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ACTIVE_FOR = 35        # seconds: a page in the foreground that reported within this time is "active"
PRESENT_FOR = 150      # seconds: a page that reported within this time is still open (else: gone)
WRITE_EVERY = 5        # seconds between two writes of presence.json
ACTIVITIES = ("calendar", "week", "technicians", "gantt", "inventory", "sheet", "settings", "recap", "other")
NOTICE_MAX = 300       # characters of the notice to everybody

_lock = threading.Lock()
_pages: dict[str, dict[str, Any]] = {}     # page id (random, from the browser) → state
_notice: dict[str, Any] | None = None
_written = 0.0


def _now() -> float:
    return time.time()


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")


def report(page_id: str, *, session_id: int | None, user_id: int, name: str, visible: bool, activity: str,
           detail: str | None, editing: bool, ip: str | None, user_agent: str | None) -> bool:
    """A page says it is open (and what it shows). True if something that matters changed (a new page,
    the edit or the visibility): then the copy for the command line is written at once."""
    now = _now()
    with _lock:
        p = _pages.get(page_id)
        changed = p is None or p["user_id"] != user_id or p["editing"] != editing or p["visible"] != visible
        if p is None or p["user_id"] != user_id:
            p = _pages[page_id] = {"since": now}
        p.update(session_id=session_id, user_id=user_id, name=name, visible=visible,
                 activity=activity if activity in ACTIVITIES else "other", detail=(detail or "")[:120] or None,
                 editing=editing, ip=ip, user_agent=(user_agent or "")[:300], seen=now)
        _forget_old(now)
    return changed


def leave(page_id: str) -> None:
    """The page was closed (sent by the browser when possible)."""
    with _lock:
        _pages.pop(page_id, None)


def forget_session(session_id: int) -> None:
    """Logout: the pages of that session are gone."""
    with _lock:
        for k in [k for k, p in _pages.items() if p.get("session_id") == session_id]:
            del _pages[k]


def _forget_old(now: float) -> None:
    for k in [k for k, p in _pages.items() if now - p["seen"] > PRESENT_FOR]:
        del _pages[k]


def _state(p: dict, now: float) -> str:
    return "active" if p["visible"] and now - p["seen"] <= ACTIVE_FOR else "background"


def snapshot() -> list[dict[str, Any]]:
    """One entry per user (their most active page), the most active first: state "active" or
    "background", what they do, whether they are editing, since when (UTC ISO), pages open."""
    now = _now()
    with _lock:
        _forget_old(now)
        pages = [dict(p) for p in _pages.values()]
    users: dict[int, dict] = {}
    rank = {"active": 0, "background": 1}
    for p in pages:
        state = _state(p, now)
        u = users.get(p["user_id"])
        entry = {"user_id": p["user_id"], "name": p["name"], "state": state, "activity": p["activity"],
                 "detail": p["detail"], "editing": p["editing"], "since": _iso(p["since"]), "last_seen": _iso(p["seen"]),
                 "ip": p["ip"], "user_agent": p["user_agent"], "pages": 1}
        if u is None:
            users[p["user_id"]] = entry
            continue
        u["pages"] += 1
        u["editing"] = u["editing"] or p["editing"]
        u["since"] = min(u["since"], entry["since"])
        if (rank[state], -p["seen"]) < (rank[u["state"]], -datetime.fromisoformat(u["last_seen"]).timestamp()):
            for k in ("state", "activity", "detail", "last_seen", "ip", "user_agent"):
                u[k] = entry[k]
    return sorted(users.values(), key=lambda u: (rank[u["state"]], not u["editing"], u["name"].lower()))


def set_notice(message: str | None, by: str | None = None, minutes: int | None = None) -> dict | None:
    """Notice shown to everybody (None = remove it). Optional duration; a restart removes it anyway."""
    global _notice
    with _lock:
        if not message:
            _notice = None
        else:
            now = _now()
            _notice = {"message": message[:NOTICE_MAX], "by": by, "at": _iso(now),
                       "until": _iso(now + minutes * 60) if minutes else None}
        return dict(_notice) if _notice else None


def notice() -> dict | None:
    global _notice
    with _lock:
        if _notice and _notice["until"] and datetime.fromisoformat(_notice["until"]).timestamp() < _now():
            _notice = None
        return dict(_notice) if _notice else None


# --- copy for the command line ---------------------------------------------------------------------

def presence_file(database_path: Path) -> Path:
    return Path(database_path).parent / "presence.json"


def write_file(path: Path, force: bool = False) -> None:
    """Writes presence.json (at most every WRITE_EVERY seconds): who is there, for `datespreader who`."""
    global _written
    now = _now()
    if not force and now - _written < WRITE_EVERY:
        return
    _written = now
    data = {"written_at": _iso(now), "pid": os.getpid(), "users": snapshot()}
    tmp = path.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        pass  # not essential (e.g. read-only folder): the portal works the same


def read_file(path: Path) -> dict | None:
    """presence.json written by the running portal, or None (missing, unreadable or too old: the portal
    writes it while pages report; older than PRESENT_FOR means nobody has reported since)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(data["written_at"])
    except (KeyError, ValueError):
        return None
    if age > timedelta(seconds=PRESENT_FOR):
        data["users"] = []
    return data
