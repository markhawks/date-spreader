"""Check for new releases on GitHub (app/updates.py, GET /api/updates). GitHub is never called."""

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app import __version__, updates
from tests.conftest import authed_app

BODY = """Highlights: the **server inventory** gets better.

**Install with the RPM**: …

<details><summary>🇮🇹 Note di rilascio in italiano</summary>

In evidenza: l'**anagrafica server** migliora.

</details>"""


def bump(v, i=1):
    a, b, c = map(int, v.split("."))
    return f"{a}.{b + i}.0"


@pytest.fixture(autouse=True)
def clean_cache():
    updates._cache.update(at=0.0, repo=None, release=None, error=None, checked_at=None)
    yield
    updates._cache.update(at=0.0, repo=None, release=None, error=None, checked_at=None)


def fake(tag, calls):
    def fetch(repo):
        calls.append(repo)
        return {"tag_name": tag, "published_at": "2026-12-01T10:00:00Z", "html_url": "https://example.com/r", "body": BODY}
    return fetch


def test_versions_and_highlights():
    assert updates.parse_version("v1.2.3") == (1, 2, 3) and updates.parse_version("nightly") is None
    assert updates.is_newer(bump(__version__)) and not updates.is_newer(__version__) and not updates.is_newer("0.1.0")
    h = updates.highlights(BODY)
    assert h["en"].startswith("the **server inventory**") and h["it"].startswith("l'**anagrafica server**")
    assert updates.highlights("Just one line.")["it"] == "Just one line."


def test_cache_and_errors():
    calls = []
    rel = updates.latest_release("o/r", fetch=fake("v9.9.9", calls))
    assert rel["version"] == "9.9.9" and rel["published_at"] == "2026-12-01"
    assert updates.latest_release("o/r", fetch=fake("v9.9.10", calls))["version"] == "9.9.9"   # cached
    assert len(calls) == 1

    def broken(repo):
        raise OSError("no network")
    assert updates.latest_release("o/r", force=True, fetch=broken)["version"] == "9.9.9"         # < 10 s: cached
    assert len(calls) == 1
    updates._cache["at"] -= updates.FORCE_MIN + 1
    assert updates.latest_release("o/r", force=True, fetch=broken)["version"] == "9.9.9"         # keeps the last one
    assert updates.last_check("o/r")["error"] == "OSError" and updates.last_check("o/r")["checked_at"]
    updates._cache.update(at=0.0, repo=None, release=None, error=None, checked_at=None)
    assert updates.latest_release("o/r", fetch=broken) is None


def test_api_admin_only_and_disabled(settings, client, monkeypatch):
    calls = []
    monkeypatch.setattr(updates, "_fetch", fake("v" + bump(__version__), calls))
    off = client.get("/api/updates").json()                        # tests run with UPDATE_CHECK off
    assert off["enabled"] is False and off["latest"] is None and not calls
    with TestClient(authed_app(replace(settings, update_check=True))) as c:
        out = c.get("/api/updates", headers={"Accept-Language": "it"}).json()
        assert out["newer"] is True and out["latest"] == bump(__version__)
        assert out["highlights"].startswith("l'**anagrafica")
        assert out["checked_at"] and out["error"] is None and out["full_version"]
    assert calls == ["markhawks/date-spreader"]
