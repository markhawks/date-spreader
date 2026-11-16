"""Check for a new release of Date Spreader on GitHub (public API, no account, no data sent).

The server asks GitHub for the latest release at most every CHECK_EVERY, with a short timeout; any error
(no Internet, rate limit, GitHub down) is silent and is retried later. Only the version, date, link and the
highlights of the release notes are kept. Turned off with UPDATE_CHECK=false (e.g. servers without Internet).
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.request
from typing import Any

from app import __version__

CHECK_EVERY = 6 * 3600       # seconds between two checks
RETRY_AFTER = 30 * 60        # after an error
TIMEOUT = 5                  # seconds
VERSION_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")

_lock = threading.Lock()
_cache: dict[str, Any] = {"at": 0.0, "repo": None, "release": None, "error": None}


def parse_version(tag: str | None) -> tuple[int, int, int] | None:
    m = VERSION_RE.match((tag or "").strip())
    return tuple(int(x) for x in m.groups()) if m else None  # type: ignore[return-value]


def _fetch(repo: str) -> dict[str, Any]:
    """The latest release (not drafts nor pre-releases) from the GitHub API."""
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases/latest",
        headers={"Accept": "application/vnd.github+json", "User-Agent": f"DateSpreader/{__version__}"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310 (fixed https URL)
        return json.load(res)


def _paragraph_after(body: str, prefix: str) -> str | None:
    for para in re.split(r"\n\s*\n", body):
        text = para.strip()
        if text.startswith(prefix):
            return text[len(prefix):].strip()
    return None


def highlights(body: str | None) -> dict[str, str]:
    """The summary of the release notes, in English and Italian (our notes: "Highlights: …" and, in the
    Italian section, "In evidenza: …"). Otherwise the first paragraph for both."""
    body = (body or "").replace("\r\n", "\n")
    first = next((p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()), "")
    en = _paragraph_after(body, "Highlights:") or first
    it = _paragraph_after(body, "In evidenza:") or en
    return {"en": en[:1500], "it": it[:1500]}


def latest_release(repo: str, *, force: bool = False, fetch=None) -> dict[str, Any] | None:
    """The latest release of `repo` (cached), or None if it is not known (yet)."""
    now = time.monotonic()
    with _lock:
        fresh = _cache["repo"] == repo and now - _cache["at"] < (RETRY_AFTER if _cache["error"] else CHECK_EVERY)
        if fresh and not force:
            return _cache["release"]
    try:
        data = (fetch or _fetch)(repo)
        version = parse_version(data.get("tag_name"))
        release = None if version is None else {
            "version": ".".join(map(str, version)),
            "published_at": (data.get("published_at") or "")[:10] or None,
            "url": data.get("html_url") or f"https://github.com/{repo}/releases",
            "highlights": highlights(data.get("body")),
        }
        error = None
    except Exception as exc:  # network, HTTP, JSON: never a problem for the portal
        release, error = (_cache["release"] if _cache["repo"] == repo else None), type(exc).__name__
    with _lock:
        _cache.update(at=now, repo=repo, release=release, error=error)
    return release


def is_newer(latest: str | None, current: str = __version__) -> bool:
    a, b = parse_version(latest), parse_version(current)
    return bool(a and b and a > b)
