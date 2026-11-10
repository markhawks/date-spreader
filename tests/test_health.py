def test_health_ok_and_wal(client, settings):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"]["journal_mode"] == "wal"
    assert body["database"]["schema"]["up_to_date"] is True
    assert settings.database_path.exists()


def test_health_reports_unmigrated_db(settings):
    from fastapi.testclient import TestClient

    from app.main import create_app

    # Nessuna fixture `engine`: il database è vuoto, senza migrazioni.
    with TestClient(create_app(settings)) as c:
        body = c.get("/api/health").json()
    assert body["status"] == "schema_non_aggiornato"
    assert body["database"]["schema"]["revision"] is None


def test_frontend_served(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Date Spreader" in res.text


def test_js_modules_served_as_javascript(client):
    """I moduli ES vengono rifiutati dal browser se il MIME type non è JavaScript."""
    for name in ("main", "api", "calendar", "sidebar", "dates", "colors", "labels", "chooser", "detail", "sheet", "resize", "filters", "eventstatus", "projectform", "people", "inventory", "auth", "projectdialog", "osdialog", "prefs", "settings", "customers", "confirm", "session", "timepick", "contextmenu", "share"):
        res = client.get(f"/js/{name}.js")
        assert res.status_code == 200, name
        assert "javascript" in res.headers["content-type"], name


def test_versions_are_consistent():
    """__version__, pyproject.toml e CHANGELOG.md devono indicare la stessa versione."""
    import re
    import tomllib

    from app import __version__
    from app.config import PROJECT_ROOT

    pyproject = tomllib.loads((PROJECT_ROOT / "pyproject.toml").read_text())["project"]["version"]
    changelog = (PROJECT_ROOT / "CHANGELOG.md").read_text()
    first_release = re.search(r"^## \[(\d+\.\d+\.\d+)\]", changelog, re.M).group(1)
    assert __version__ == pyproject == first_release


def test_static_files_are_revalidated(client):
    """I browser devono ricontrollare i file a ogni caricamento (niente moduli JS vecchi in cache)."""
    for path in ("/", "/js/main.js", "/js/labels.js", "/css/app.css"):
        res = client.get(path)
        assert res.headers.get("cache-control") == "no-cache", path
    etag = client.get("/js/labels.js").headers["etag"]
    assert client.get("/js/labels.js", headers={"If-None-Match": etag}).status_code == 304
