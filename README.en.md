# Date Spreader

[Versione italiana](README.md) · License: [GNU AGPL-3.0-only](LICENSE)

**Date Spreader** is a self-hosted, multi-user web portal for planning and tracking **server migrations and
upgrades** (designed around Red Hat Enterprise Linux). It replaces the shared spreadsheet that teams often use for
this job with:

- a **vertical calendar** centred on the current month, showing every intervention (maintenance window);
- a **project sidebar**, with projects grouped and filtered by **customer** and coloured per customer;
- for each intervention, an **editable server table** (hostname, IP, current/target OS, environment, current/target
  kernel, check status, migration status, execution date, technician, notes) with auto-save;
- a persistent **server inventory**: servers survive across interventions, with search and full history;
- **real multi-user editing**: optimistic locking (no silent overwrites), live updates from colleagues every
  10 seconds, and an **audit log** of every change with its author;
- **configuration interventions** (type «Configurazione»): a reduced table (hostname, IP, OS, environment,
  execution date, technician) with a full-width, auto-growing **notes row under each server** for the
  configuration details;
- **sharing by email**: a formatted email with the full server table, ready to paste into Gmail.

The user interface is in **Italian**. The stack is deliberately small: **FastAPI + SQLite** on the backend and
plain ES-module JavaScript (no framework, no build step) on the frontend.

## Quick start with the demo database

The repository ships `demo/datespreader-demo.sqlite3`, which contains **only sample data** (fictitious customers,
projects, servers and technicians, `example.com` hostnames, documentation IP ranges) and one demo administrator.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp demo/datespreader-demo.sqlite3 data/datespreader.sqlite3
.venv/bin/python -m app.main
```

Open <http://127.0.0.1:8000> and sign in as **`admin`** / **`demo-password-2026`**. You will be asked to choose a
new password on first login.

The demo dates are relative to the day the database was generated. To get sample data around today's date,
regenerate it with `.venv/bin/python scripts/make_demo_db.py`, or start from an empty database as shown below.

## Installation

Requirements: **Python 3.11+**. Nothing else is needed: the database is a local SQLite file.

```bash
# 1. Virtual environment and dependencies (requirements-dev.txt also installs the test tools)
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# 2. (Optional) configuration
cp .env.example .env

# 3. Create the database (add --demo to also load the sample data)
.venv/bin/python -m app.cli init --demo

# 4. Create the first administrator (the password is prompted for, hidden)
.venv/bin/python -m app.cli users create-admin --name "Jane Doe" --email jane.doe@example.com

# 5. Run
.venv/bin/python -m app.main
```

Useful URLs:
- <http://127.0.0.1:8000/api/health>: application, database and schema status;
- <http://127.0.0.1:8000/docs>: interactive API documentation (OpenAPI).

### LAN access and systemd

By default the server listens on `127.0.0.1` only. Set `HOST=0.0.0.0` in `.env` to reach it from your network at
`http://<server-ip>:8000`. The portal is meant for an **internal network**: do not expose it to the Internet
without HTTPS and proper access controls.

A hardened systemd unit is provided in `deploy/datespreader.service` (adjust the paths to your install directory).
It runs as a dedicated `datespreader` system user that can only write to `data/`, and applies pending migrations
before starting:

```bash
sudo cp deploy/datespreader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now datespreader
```

Run database commands as the service user, so that files are not created as root:
`sudo -u datespreader .venv/bin/python -m app.cli …`

### HTTPS

Over plain HTTP, passwords travel unencrypted on the network. Put the portal behind an HTTPS reverse proxy
(Apache, nginx…) and set `COOKIE_SECURE=true`.

## Configuration

Environment variables, or a `.env` file (see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `APP_NAME` | `Date Spreader` | Displayed name |
| `DATABASE_PATH` | `data/datespreader.sqlite3` | Relative to the project folder. **Local disk only, never a network share.** |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000` | Wait time when the database is locked by another write |
| `HOST` | `127.0.0.1` | `0.0.0.0` for LAN access |
| `PORT` | `8000` | |
| `RELOAD` | `false` | `true` for development only |
| `SESSION_HOURS` | `12` | Session expiry after inactivity |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `SOURCE_URL` | official repository | Where users can download the source code (see License) |

## Users and security

- Every page requires **login** (email or username + password). Only `/api/health`, `/api/version` and
  `/api/changelog` are public.
- **Users and technicians are the same thing**: people with a password can sign in; the others are just names to
  assign to interventions.
- **Roles**: *admin* (manages users, customers and the OS list), *coordinatore* (coordinator) and *tecnico*
  (technician). Deleting projects, or interventions that contain servers, requires coordinator or admin.
- Administrators grant access with a **one-time temporary password**; the user must change it on first login.
- Passwords: at least 10 characters, stored as **scrypt** hashes. Session cookie is `HttpOnly` / `SameSite=Lax`;
  writes require an anti-CSRF header; 5 failed logins lock the account/IP for 5 minutes.

Account commands:

| Command | Effect |
|---|---|
| `python -m app.cli users list` | List users with role and login status |
| `python -m app.cli users admin LOGIN [--temporary]` | Make an existing user an administrator and set their password (also used to recover access) |
| `python -m app.cli users create-admin --name … --email … [--username …] [--temporary]` | Create a new administrator |

## Database commands

| Command | Effect |
|---|---|
| `python -m app.cli init [--demo]` | Apply migrations (creates the database if missing), optionally with sample data. Safe to repeat |
| `python -m app.cli migrate` | Apply migrations only |
| `python -m app.cli demo load` | Add the sample data next to existing data (no-op if already present) |
| `python -m app.cli demo remove [--yes]` | Remove the sample data; real data is never touched |

Sample records are flagged `is_demo` and labelled **ESEMPIO** in the UI. **No command deletes user-entered data.**

**Backups**: use SQLite's online backup API, which is safe while the service is running:

```bash
sudo -u datespreader .venv/bin/python -c "import sqlite3; s=sqlite3.connect('data/datespreader.sqlite3'); d=sqlite3.connect('data/backups/backup.sqlite3'); s.backup(d)"
```

> **Migrations on SQLite.** To alter a table, Alembic recreates it (copy, drop, rename). With foreign keys enabled,
> dropping a parent table would trigger `ON DELETE CASCADE` and wipe child tables. `app.migrations.upgrade_database`
> therefore **disables foreign keys during migrations**, then runs `PRAGMA foreign_key_check` and re-enables them.
> A regression test guards this.

After changing a model in `app/models/`, generate and review a migration, then regenerate the demo database:

```bash
.venv/bin/alembic revision --autogenerate -m "describe the change"
.venv/bin/python -m app.cli migrate
.venv/bin/python scripts/make_demo_db.py
```

## Development

```bash
.venv/bin/pytest -q                 # tests use a temporary database and never touch data/
.venv/bin/python -m pyflakes app/
```

Project layout:

```
app/
  main.py          FastAPI app, API routers and static files
  config.py        settings from environment / .env
  db.py            SQLite engine (WAL, busy_timeout, foreign keys) and sessions
  cli.py           init / migrate / demo / users commands
  migrations.py    applies and checks migrations from code
  seed.py          sample data (load, preview, removal)
  auth.py          access control: session, roles, CSRF
  security.py      passwords (scrypt), tokens, login rate limiting
  audit.py         audit log writer
  api/             HTTP routers under /api
  models/          ORM models and allowed status values
  repositories/    data access (the only layer that queries the database)
  schemas/         API input/output schemas
migrations/        Alembic migrations
static/            frontend (HTML, CSS, ES modules, no build step)
demo/              demo database with sample data only
scripts/           make_demo_db.py
deploy/            systemd unit
tests/             pytest suite
data/              local database and backups (git-ignored)
```

Design notes:
- **Optimistic locking**: every editable table has a `version` column; a stale write returns **HTTP 409** with the
  current data, and the UI asks the user to redo the edit.
- **Live updates** use polling (`GET /api/changes`, every 10 s) rather than WebSockets: simple and reliable for a
  small team.
- **SQLAlchemy + Alembic** keep a future move to PostgreSQL possible.
- Status values live in `app/models/statuses.py` and are stored as text, so changing them needs no migration.

The full user guide and the API reference (in Italian) are in [README.md](README.md); the change history is in
[CHANGELOG.md](CHANGELOG.md).

## License

Copyright (C) 2026 Mark Hawks

Date Spreader is free software: you can redistribute it and/or modify it under the terms of the
**GNU Affero General Public License, version 3** (`AGPL-3.0-only`), as published by the Free Software Foundation.
It is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

Under the AGPL, if you make a **modified** version available to other users over a network, you must offer them the
source code of your version. The portal shows a source-code link on the login screen and in the "Novità"
(changelog) dialog: set `SOURCE_URL` to the location of your version.
