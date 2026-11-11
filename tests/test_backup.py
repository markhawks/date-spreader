"""Database backups: verified copies, rotation, restore, pre-migration backup, admin API."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

import pytest

from app import backup as backups
from app import cli
from app.config import Settings
from app.db import create_db_engine
from app.migrations import downgrade_database, upgrade_database
from tests.test_auth import ADMIN_PW, TECH_PW, accounts, login  # noqa: F401  (fixture reused)


def _count_users(path) -> int:
    con = sqlite3.connect(path)
    try:
        return con.execute("SELECT count(*) FROM users").fetchone()[0]
    finally:
        con.close()


def test_backup_is_a_verified_copy_and_is_listed(settings, engine, accounts):  # noqa: F811
    info = backups.create_backup(settings, "manual")
    assert info.kind == "manual" and info.path.parent == settings.database_path.parent / "backups"
    assert info.name.startswith("datespreader-backup-") and info.name.endswith("-manual.sqlite3")
    assert _count_users(info.path) == _count_users(settings.database_path) > 0
    assert [b.name for b in backups.list_backups(settings)] == [info.name]
    assert not list(info.path.parent.glob(".*.tmp"))  # no temporary file left
    # two backups in the same second get different names
    again = backups.create_backup(settings, "manual", now=info.created)
    assert again.name != info.name


def _fake(folder, when: datetime, kind="daily"):
    path = folder / f"datespreader-backup-{when:%Y%m%d-%H%M%S}-{kind}.sqlite3"
    path.write_bytes(b"x")
    return path


def test_rotation_keeps_7_days_4_weeks_12_months_and_never_touches_other_files(settings):
    folder = backups.backup_dir(settings)
    folder.mkdir(parents=True)
    now = datetime(2026, 11, 11, 3, 0)
    for d in range(400):  # one nightly backup a day for 400 days
        _fake(folder, now - timedelta(days=d, hours=0.5))
    for h in range(1, 6):  # several manual backups in the last hours
        _fake(folder, now - timedelta(hours=h), "manual")
    other = folder / "datespreader-20261110-1758-fine-sessione.sqlite3"
    other.write_bytes(b"x")
    old_other = folder / "old-copy.sqlite3"
    old_other.write_bytes(b"x")

    removed = backups.rotate(settings, now=now)
    left = backups.list_backups(settings)
    names = {b.name for b in left}
    assert other.name in names and old_other.name in names           # never rotated
    assert all(now - b.created <= timedelta(hours=48) or b.kind == "daily" for b in left if b.rotated)
    assert all(b.name.startswith("datespreader-backup-") for b in removed)
    ours = [b for b in left if b.rotated]
    # last 48 hours: everything (5 manual + 2 daily); then 7 days, 4 weeks, 12 months (overlapping)
    assert sum(1 for b in ours if b.kind == "manual") == 5
    months = {(b.created.year, b.created.month) for b in ours}
    assert len(months) == 12
    assert len(ours) <= 5 + 2 + 7 + 4 + 12
    oldest = min(b.created for b in ours)
    assert oldest > now - timedelta(days=370)


def test_restore_puts_the_backup_back_and_saves_the_current_state(settings, engine, accounts):  # noqa: F811
    saved = backups.create_backup(settings, "manual")
    before = _count_users(settings.database_path)
    con = sqlite3.connect(settings.database_path)
    con.execute("PRAGMA foreign_keys = OFF")
    con.execute("DELETE FROM users")
    con.commit()
    con.close()
    assert _count_users(settings.database_path) == 0
    engine.dispose()
    pre = backups.restore_backup(settings, saved.path)
    assert pre.kind == "pre-restore" and _count_users(pre.path) == 0
    assert _count_users(settings.database_path) == before


def test_restore_rejects_files_that_are_not_date_spreader_databases(settings, engine, tmp_path):
    junk = tmp_path / "junk.sqlite3"
    junk.write_bytes(b"not a database at all, just text" * 10)
    with pytest.raises(backups.BackupError):
        backups.restore_backup(settings, junk)
    other = tmp_path / "other.sqlite3"
    con = sqlite3.connect(other)
    con.execute("CREATE TABLE t (x)")
    con.commit()
    con.close()
    with pytest.raises(backups.BackupError, match="not a Date Spreader database"):
        backups.restore_backup(settings, other)
    with pytest.raises(backups.BackupError):
        backups.restore_backup(settings, tmp_path / "missing.sqlite3")
    assert not backups.list_backups(settings)  # nothing touched: no pre-restore backup


def test_find_backup_accepts_only_plain_names(settings, engine):
    info = backups.create_backup(settings, "manual")
    assert backups.find_backup(settings, info.name).path == info.path
    for bad in ("../test.sqlite3", "/etc/passwd", "..", "", "a/b.sqlite3", ".hidden.sqlite3", "x.db"):
        assert backups.find_backup(settings, bad) is None


# --- command line -------------------------------------------------------------------------


@pytest.fixture
def cli_db(tmp_path, monkeypatch):
    path = tmp_path / "cli.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    return path


def test_cli_backup_list_and_restore(cli_db, capsys, monkeypatch):
    assert cli.main(["init"]) == 0
    assert cli.main(["backup"]) == 0
    assert "Backup created" in capsys.readouterr().out
    assert cli.main(["backup", "--scheduled"]) == 0
    assert cli.main(["backup", "--list"]) == 0
    out = capsys.readouterr().out
    assert "manual" in out and "daily" in out
    name = sorted(p.name for p in (cli_db.parent / "backups").glob("*-manual.sqlite3"))[0]
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert cli.main(["restore", name]) == 1           # no terminal and no --yes: nothing happens
    assert cli.main(["restore", name, "--yes"]) == 0
    out = capsys.readouterr().out
    assert "Backup restored" in out and "pre-restore" in out


def test_migrate_makes_a_backup_only_when_the_schema_changes(cli_db, capsys):
    assert cli.main(["migrate"]) == 0                  # new database: no backup
    folder = cli_db.parent / "backups"
    assert not list(folder.glob("*.sqlite3")) if folder.exists() else True
    assert cli.main(["migrate"]) == 0                  # already up to date: no backup
    assert not (folder.exists() and list(folder.glob("*-pre-migration.sqlite3")))
    eng = create_db_engine(Settings("t", cli_db, 1000, "127.0.0.1", 0, False))
    downgrade_database(eng, "-1")                      # pretend an older version
    eng.dispose()
    capsys.readouterr()
    assert cli.main(["migrate"]) == 0
    assert "backup first" in capsys.readouterr().out
    assert len(list(folder.glob("*-pre-migration.sqlite3"))) == 1
    eng = create_db_engine(Settings("t", cli_db, 1000, "127.0.0.1", 0, False))
    upgrade_database(eng)
    eng.dispose()


# --- admin API ----------------------------------------------------------------------------


def test_backup_api_is_for_administrators_only(anon, accounts):  # noqa: F811
    login(anon, "tecnico1", TECH_PW)
    assert anon.get("/api/backups").status_code == 403
    assert anon.post("/api/backups").status_code == 403


def test_backup_api_list_create_download(anon, accounts, settings):  # noqa: F811
    login(anon, "admin@azienda.it", ADMIN_PW)
    res = anon.post("/api/backups")
    assert res.status_code == 201, res.text
    name = res.json()["name"]
    data = anon.get("/api/backups").json()
    assert data["keep_daily"] == 7 and data["keep_weekly"] == 4 and data["keep_monthly"] == 12
    assert [b["name"] for b in data["backups"]] == [name] and data["backups"][0]["kind"] == "manual"
    dl = anon.get(f"/api/backups/{name}")
    assert dl.status_code == 200 and dl.content[:16] == b"SQLite format 3\x00"
    assert name in dl.headers["content-disposition"]
    assert anon.get("/api/backups/..%2Ftest.sqlite3").status_code == 404
    assert anon.get("/api/backups/nope.sqlite3").status_code == 404
