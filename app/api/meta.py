"""Versione del portale e changelog (pubblici: non contengono dati)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app import DEFAULT_SOURCE_URL, __license__, __version__
from app.config import PROJECT_ROOT
from app.i18n import current_language, tr

router = APIRouter(tags=["portale"])


class VersionOut(BaseModel):
    name: str
    version: str
    license: str
    source_url: str


class ChangelogOut(BaseModel):
    version: str
    markdown: str


@router.get("/version", response_model=VersionOut)
def version(request: Request) -> VersionOut:
    settings = getattr(request.app.state, "settings", None)
    source = (settings.source_url if settings else "") or DEFAULT_SOURCE_URL
    return VersionOut(name="Date Spreader", version=__version__, license=__license__, source_url=source)


@router.get("/changelog", response_model=ChangelogOut)
def changelog() -> ChangelogOut:
    """CHANGELOG.md (English) or, for Italian, CHANGELOG.it.md."""
    path = PROJECT_ROOT / ("CHANGELOG.it.md" if current_language() == "it" else "CHANGELOG.md")
    if not path.is_file():
        path = PROJECT_ROOT / "CHANGELOG.md"
    text = path.read_text(encoding="utf-8") if path.is_file() else tr("common.changelog_missing")
    return ChangelogOut(version=__version__, markdown=text)
