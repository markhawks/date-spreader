"""Version shown in the interface: release date, package release (RPM), consistency with the changelog."""

import json
import re

from app import __release_date__, __version__
from app import build
from app.config import PROJECT_ROOT


def test_release_date_matches_the_changelog():
    for name in ("CHANGELOG.md", "CHANGELOG.it.md"):
        text = (PROJECT_ROOT / name).read_text(encoding="utf-8")
        m = re.search(rf"^## \[{re.escape(__version__)}\] - (\d{{4}}-\d{{2}}-\d{{2}})$", text, flags=re.M)
        assert m, f"{name}: no section for {__version__}"
        assert m.group(1) == __release_date__, name


def test_build_info_without_and_with_package(tmp_path, monkeypatch):
    monkeypatch.setattr(build, "PROJECT_ROOT", tmp_path)
    build.build_info.cache_clear()
    try:
        info = build.build_info()
        assert (info["package"], info["full_version"], info["release_date"]) == (None, __version__, __release_date__)
        (tmp_path / "build-info.json").write_text(json.dumps({"package": "rpm", "release": "2.el10"}))
        build.build_info.cache_clear()
        info = build.build_info()
        assert (info["package"], info["full_version"]) == ("rpm", f"{__version__}-2.el10")
    finally:
        build.build_info.cache_clear()


def test_version_api(client):
    data = client.get("/api/version").json()
    assert data["version"] == __version__ and data["release_date"] == __release_date__
    assert data["full_version"].startswith(__version__)
