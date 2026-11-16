"""How this copy of the portal was installed: version, release date and, for the packages, the package release.

The RPM writes `build-info.json` next to the code (see packaging/rpm/datespreader.spec), e.g.
    {"package": "rpm", "release": "1.el10"}
so the interface can show "0.26.0-1.el10": the package release grows with the fixes of the package
(patches) that do not change the portal version. Installs from git have no file: only the version.
"""

from __future__ import annotations

import json
from functools import lru_cache

from app import __release_date__, __version__
from app.config import PROJECT_ROOT


@lru_cache(maxsize=1)
def build_info() -> dict:
    path = PROJECT_ROOT / "build-info.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    release = str(data.get("release") or "").strip() or None
    package = str(data.get("package") or "").strip() or None
    return {
        "version": __version__,
        "release_date": __release_date__,
        "package": package,                  # "rpm", or None (installed from git)
        "package_release": release,          # e.g. "1.el10" / "1.fc44"
        "full_version": f"{__version__}-{release}" if release else __version__,
    }
