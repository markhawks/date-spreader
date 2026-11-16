"""Versione del portale e changelog (pubblici: non contengono dati)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app import DEFAULT_SOURCE_URL, __license__, __version__
from app import updates
from app.auth import require_admin
from app.build import build_info
from app.config import PROJECT_ROOT
from app.i18n import current_language, tr

router = APIRouter(tags=["portale"])


class VersionOut(BaseModel):
    name: str
    version: str
    release_date: str            # ISO date of the release of this version
    full_version: str            # with the package release, e.g. "0.26.0-1.el10" (RPM); otherwise = version
    package: str | None          # "rpm", or None (installed from git)
    license: str
    source_url: str


class ChangelogOut(BaseModel):
    version: str
    markdown: str


@router.get("/version", response_model=VersionOut)
def version(request: Request) -> VersionOut:
    settings = getattr(request.app.state, "settings", None)
    source = (settings.source_url if settings else "") or DEFAULT_SOURCE_URL
    b = build_info()
    return VersionOut(name="Date Spreader", version=__version__, release_date=b["release_date"],
                      full_version=b["full_version"], package=b["package"], license=__license__, source_url=source)


@router.get("/changelog", response_model=ChangelogOut)
def changelog() -> ChangelogOut:
    """CHANGELOG.md (English) or, for Italian, CHANGELOG.it.md."""
    path = PROJECT_ROOT / ("CHANGELOG.it.md" if current_language() == "it" else "CHANGELOG.md")
    if not path.is_file():
        path = PROJECT_ROOT / "CHANGELOG.md"
    text = path.read_text(encoding="utf-8") if path.is_file() else tr("common.changelog_missing")
    return ChangelogOut(version=__version__, markdown=text)


class UpdateOut(BaseModel):
    enabled: bool                 # UPDATE_CHECK of this installation
    current: str
    latest: str | None            # latest release on GitHub (None = not known: no Internet, error…)
    newer: bool                   # latest > current
    published_at: str | None
    url: str | None               # page of the release
    highlights: str | None        # summary of the release notes, in the user's language
    package: str | None           # "rpm" or None: how to upgrade
    app_dir: str                  # where the portal is installed (for the upgrade command)


@router.get("/updates", response_model=UpdateOut, dependencies=[Depends(require_admin)])
def check_updates(request: Request, force: bool = False) -> UpdateOut:
    """Is there a newer release on GitHub? (administrators; cached on the server, at most every 6 hours)"""
    settings = request.app.state.settings
    b = build_info()
    out = dict(enabled=settings.update_check, current=__version__, latest=None, newer=False, published_at=None,
               url=None, highlights=None, package=b["package"], app_dir=str(PROJECT_ROOT))
    if settings.update_check:
        rel = updates.latest_release(settings.update_repo, force=force)
        if rel:
            out.update(latest=rel["version"], newer=updates.is_newer(rel["version"]), published_at=rel["published_at"],
                       url=rel["url"], highlights=rel["highlights"]["it" if current_language() == "it" else "en"])
    return UpdateOut(**out)
