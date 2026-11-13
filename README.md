# Date Spreader

[Italiano](README.it.md) · License: [GNU AGPL-3.0-only](LICENSE)

**Date Spreader** is a self-hosted, multi-user web portal for planning and tracking **technical interventions**:
migrations, upgrades, patching, configuration changes or any other scheduled maintenance work, on systems running
**any operating system** (the list of operating systems and versions is yours to define). It replaces the shared
spreadsheet that teams often use for this job with a vertical calendar, projects per customer, an editable table of
the servers involved in every intervention (maintenance window), a server inventory with full history, and several
users working at the same time with conflict detection and an audit log of every change.

It was born for IT operations teams, but nothing prevents using it wherever technical work has to be scheduled on a
list of machines or assets.
Original specification: [DateWeaver.md](DateWeaver.md) (the original document, written when the project was still
called "Time Dot").

Highlights:

- a **vertical calendar** centered on the current month, showing every intervention with its **progress** ("2/4"
  servers done, plus a thin bar that fills up), in a **month or week view**, with **7 days or Mon–Fri** (weekends
  shown only where there are interventions);
- a **project sidebar**, with projects grouped and filtered by **customer** and colored per customer, and expandable
  to list their **interventions** (date, status, time, commessa) and open one with a click;
- for each intervention, an **editable server table** (hostname, IP, current/target OS, environment, current/target
  kernel, check status, migration status, execution date, technician, notes) with auto-save;
- a persistent **server inventory**: servers survive across interventions, with search and full history;
- a **commessa** (job number) on every intervention, stored on the customer and proposed in a list;
- a **Location** column for each server (site, datacenter…), with the locations already used proposed in a list;
- **import servers from CSV or Excel** (or rows pasted from a spreadsheet) into an intervention, with column
  recognition and a preview of every row before saving;
- **scheduling conflicts**: a warning when the same server is in two interventions on the same day, or a technician
  is busy in two interventions at overlapping times, plus a **Technicians** view with each technician's week;
- **duplicate an intervention** to another date (e.g. when it must be run again), with every status reset;
- **calendar zoom**, Blender style: hold the **middle mouse button and move forward/back** (or pinch on a touchpad,
  or use the − % + control);
- **real multi-user editing**: optimistic locking (no silent overwrites), live updates from colleagues every
  10 seconds, and an **audit log** of every change with its author;
- **configuration interventions**: a reduced table with a full-width, auto-growing **notes row under each server**;
- **export and import between installations**: move a project or a whole customer to another Date Spreader;
- **sharing by email**: a formatted email with the full server table, ready to paste into Gmail;
- **automatic database backups**: verified copies every night, before every upgrade and on demand, with rotation,
  download from the portal and restore from the command line;
- a **read-only recap for smartphones**, for technicians and coordinators away from the office (the portal itself is
  meant for a desktop);
- **today's date and a clock** in the top bar, configurable per user;
- **multilingual interface**: **English** and **Italian**; each user picks the language in Settings → Appearance →
  Language (by default it follows the browser). Server messages, the sharing email and the "What's new" changelog
  follow the user's language too.

Planned and proposed features: [docs/ROADMAP.md](docs/ROADMAP.md).

The stack is deliberately small: **FastAPI + SQLite** on the backend and plain ES-module JavaScript (no framework,
no build step) on the frontend.

## Installing on a server
**Full guide: [docs/INSTALL.md](docs/INSTALL.md).** In short, on **Fedora 44** (the only system tested so far):

```bash
git clone https://github.com/markhawks/date-spreader.git && cd date-spreader
sudo ./deploy/install.sh --admin-name "Jane Doe" --admin-email jane.doe@example.com
```

The script installs the portal in `/opt/datespreader` as a systemd service and creates the first administrator.
Running it again upgrades the installation, after backing up the database. **Coming soon:** a guided installer,
an RPM package, and support for Red Hat Enterprise Linux 10.2 and Fedora 45.

## Quick start with the demo database
The repository ships `demo/datespreader-demo.sqlite3`, which contains **only sample data** (fictitious customers,
projects, servers and technicians, `example.com` hostnames, documentation IP ranges) and one demo administrator:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp demo/datespreader-demo.sqlite3 data/datespreader.sqlite3
.venv/bin/python -m app.main
```

Open <http://127.0.0.1:8000> and sign in as **`admin`** / **`demo-password-2026`**: on first login the portal asks
you to choose a new password. The sample dates are relative to the day the database was generated; to get them
around today: `.venv/bin/python scripts/make_demo_db.py` (or `init --demo`, below).

## Requirements
- Python 3.11 or later (developed with 3.14)
- No other service: the database is a local SQLite file.

## Local run (development or quick trial)
To install the portal on a server, use the script: see "Installing on a server" above and
[docs/INSTALL.md](docs/INSTALL.md). The steps below are for development or a quick trial.

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

Open <http://127.0.0.1:8000>. Other useful URLs:
- <http://127.0.0.1:8000/api/health>: application, database and schema status
- <http://127.0.0.1:8000/docs>: interactive API documentation (OpenAPI)

To reload the server automatically while developing, set `RELOAD=true` in `.env`.

### LAN access
The portal is meant to run on a **private LAN**. With `HOST=0.0.0.0` in `.env` it is reachable from the whole
network at `http://<server-ip>:8000`. With `HOST=127.0.0.1` it is reachable from the machine itself only.

You must sign in to see and edit data: see "Access and users".

### systemd service
In production the portal runs as the **`datespreader`** service. The `deploy/install.sh` script sets it up on its
own; the details below are for managing it or for a manual installation. The service:
- is enabled at boot and restarts automatically if it crashes;
- runs as the `datespreader` system user, without a shell, which can write **only** to `data/`;
- applies any new migrations before starting.

The unit file is `deploy/datespreader.service` (adjust the paths to your folder), to be copied to `/etc/systemd/system/`.

```bash
systemctl status datespreader          # status
systemctl restart datespreader         # restart (e.g. after updating the code)
journalctl -u datespreader -f          # live log
```

> **Important:** the database belongs to the `datespreader` user. Database commands must be run as that user,
> otherwise files created by root block the service:
>
> ```bash
> sudo -u datespreader .venv/bin/python -m app.cli demo remove
> ```

If you change `deploy/datespreader.service`:

```bash
sudo cp deploy/datespreader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart datespreader
```

**To develop** with a manual start (`python -m app.main`) you must stop the service first, because port 8000 is
taken: `systemctl stop datespreader`.

## Access and users
- Every page requires **login** with email or username and password. Only `/api/health`, `/api/version` and
  `/api/changelog` are public.
- **Users and technicians are the same thing**: people with a password can sign in; the others are just names to
  assign to interventions.
- **Roles**:
  - *administrator*: manages users, from the **Users** button at the top;
  - *coordinator* and *technician*: work on projects, interventions and servers.
- **Giving someone access** (administrator): Users → "Enable access" (or "New password") → confirm. A temporary
  password is shown **only once**; pass it on to the person, who must choose their own on first login.
- **Passwords**: at least 10 characters, must not contain the username or the email. The database stores only the
  `scrypt` hash. Change it from the user menu at the top right; changing it closes the sessions open on other devices.
- **Session**: `HttpOnly` / `SameSite=Lax` cookie. It expires after `SESSION_HOURS` (12) of inactivity and in any
  case after 7 days. If it expires while you are working, the login screen appears again.
- **Protections**:
  - after 5 failed attempts, login is blocked for 5 minutes (per IP and name);
  - an anti-CSRF header is required on every change;
  - a deactivated user is signed out immediately;
  - the last administrator cannot be deactivated or demoted.
- **Audit log**: every change records the user who made it.
- **HTTPS**: over plain HTTP, passwords travel unencrypted on the network. Behind an HTTPS proxy (e.g. Apache or
  nginx) set `COOKIE_SECURE=true`. The portal is meant for an internal network: do not expose it to the Internet
  without HTTPS and proper controls.

### Account commands
| Command | Effect |
|---|---|
| `python -m app.cli users list` | List users with role and login status |
| `python -m app.cli users admin LOGIN` | Make an existing user (email or username) an administrator and have them set the password |
| `python -m app.cli users admin LOGIN --temporary` | As above, with a generated temporary password (to be changed on first login) |
| `python -m app.cli users create-admin --name … --email … [--username …] [--temporary]` | Create a new administrator |

On a systemd installation, run them as `sudo -u datespreader .venv/bin/python -m app.cli …`. They are also the way
to **recover access** if the administrator forgets the password.

## Version and changelog
- The version is in `app/__init__.py` (`__version__`) and in `pyproject.toml`; it follows
  [Semantic Versioning](https://semver.org/).
- Changes are listed in [`CHANGELOG.md`](CHANGELOG.md) (English) and [`CHANGELOG.it.md`](CHANGELOG.it.md)
  (Italian), in the "Keep a Changelog" format; the version headings are identical in both files.
- In the portal the version is next to the name, at the top left: clicking it opens the changelog (also from the
  user menu → "What's new"), in the user's language.
- New changes are recorded in both changelogs under "Unreleased" / "Non rilasciato"; the version changes only at
  release time.
- **To make a release**:
  1. update `__version__` (`app/__init__.py`), `pyproject.toml` and the version heading in `CHANGELOG.md` (English)
     **and** in `CHANGELOG.it.md` (Italian). A test checks that the version, `pyproject.toml` and `CHANGELOG.md`
     match;
  2. update `README.md` (English) and `README.it.md` (Italian) where needed;
  3. regenerate the demo database with `scripts/make_demo_db.py`;
  4. run the tests;
  5. commit, tag `vX.Y.Z` and push to GitHub, together with the tag;
  6. create the GitHub release with the changelog notes;
  7. restart the service.

  Installations made with the script are upgraded with `sudo /opt/datespreader/deploy/install.sh`, or with
  `--ref vX.Y.Z` for a specific version.

## Interface (home)
- **Vertical calendar**: one block per month, from top to bottom, weeks starting on Monday. On opening it shows the
  previous, current and next month, with the **current month centered** in the view. Scrolling near the top or
  bottom edge loads more months without making the view jump. The blue **Today** button, in the middle of the top
  bar, brings you back to today's month (or week).
- **Date and time** in the top bar, next to the portal name. What to show (date and time, with seconds, date only,
  time only, nothing) is chosen in Settings → Appearance.
- **Filter by customer**: the customer menu at the top of the project column, or a click on a customer's group
  header or name in the project column, a right click on an intervention ("Show only …"), or a click on the customer
  name in the intervention card. Calendar, Technicians view, project column and day preview then show only that customer; a
  colored label "Customer: … ✕" at the top of the calendar shows it and clears it.
- **7 days or Mon–Fri**: the **"Mon–Fri"** button in the top bar, next to Month, Week and Technicians (also the
  "7 days / Mon–Fri" switch at the bottom right of the calendar and Settings → Appearance; personal preference). With **Mon–Fri**, Saturday and Sunday are hidden and come back only where
  they are needed: in the weeks (week and Technicians views) or months (month view) that have interventions on a
  weekend, so exceptions are never missed.
- **Smartphones**: the portal is meant for a desktop. On a phone it opens a **read-only recap** for technicians and
  coordinators away from the office: interventions still to close (last 14 days), today's and the next 7 days',
  "Mine" or "All", with status, progress, conflicts and technicians; a tap shows the servers and lets you change the
  intervention status. "Full version" opens the normal portal anyway; its "Recap" button goes back.
- **Scheduling conflicts**: the portal warns when the **same server** is in two interventions on the **same day**, or
  a **technician** (participant or assigned to a server row) is in two interventions whose times **overlap** (an
  intervention without a time counts as the whole day; cancelled interventions are ignored). The calendar marks
  those interventions with a warning icon; the intervention card and the full-screen table list the conflicts, with a
  link to the other intervention.
- **Technicians view** (the **Technicians** button, next to Month and Week): one row per technician and one column per
  day of the week, with the interventions each technician is in. Double-booked technicians are highlighted; a last
  row lists the interventions without technicians; "Show all technicians" also shows those with a free week. Arrows
  move by week, "Today" goes back to the current week, a click opens the intervention, filters apply. When the area
  is narrow (preview on the right, phone) each technician becomes a block with only the busy days.
- **Month or week view**: the **Month** and **Week** buttons, next to "Today" and with the same look (the active
  one is solid blue), switch view staying on the same day (the choice is a personal preference). In the week view
  each week is a block with a title ("Week 46 · 9 – 15 November 2026") and seven columns as tall as needed:
  **every intervention is shown, never "+N"**, each with name, progress, customer, title and time, type and
  technicians. Scrolling loads more weeks; zoom changes the minimum height of the days. When the calendar is
  narrow (phone, or preview open on the right) the days are stacked one below the other.
- **Calendar zoom** (as in Blender): **hold the middle mouse button and move the mouse forward/back**; forward zooms
  in, back zooms out, from 50% to 250%. The day under the cursor stays put. Alternatively, **pinch** on the
  touchpad or use the **− % +** control at the bottom right of the calendar; a click on the percentage goes back to
  100%. The level is a personal preference. Ctrl + mouse wheel remains the browser's page zoom.
  - Zooming out shows more months, and interventions become colored bars.
  - Zooming in, each day shows more interventions; where there is room, the title and full time appear too.
  - Each day chooses by itself how to draw its interventions (detailed, two lines, name only) without ever
    cutting the text; those that do not fit become "+N".
- **Days with interventions**: they are highlighted and show, in the project color, name, **progress** ("2/4":
  completed servers out of the total, with a bar at the bottom that fills up; green with ✓ when the work is
  done), customer and time (as many as fit in the cell, then "+N"). Hovering shows the details. A completed
  intervention is dimmed, a postponed one has a dashed border, a cancelled one is struck through.
- **Empty days**: a day without interventions can also be selected with a click; it opens the empty preview, with
  buttons to create an intervention in an existing project or a new project on that date.
- **Project sidebar**: tiles with "**Next**: date" (the next scheduled intervention) or, if the project only has
  past interventions, "**Last**: date" (the most recent one); "No interventions" if it has none. Dates always
  include the year. The "2 dates" label (or more) means several interventions. The instant search ignores case and accents.
- **Phone** (below 760 px): projects become a scrolling row and events become colored bars.
- **Dark theme**: follows the operating system setting.
- **Language**: the interface is in English or Italian, as each user chooses (Settings → Appearance → Language).
- **Click on a project**:
  - with a single intervention, the calendar scrolls to the date (loading the missing months), highlights it and
    opens the **intervention card**;
  - with several interventions, a menu lists the dates (arrows, Enter, Esc) with the **next future intervention
    already selected**; if they are all in the past, the last one is selected;
  - in the card, the "Project dates" buttons move from one intervention to another;
  - without interventions, a notice appears.
- **Right click on a day** (on phones/tablets: long press): a menu to create a **new project** with its first
  intervention on that date, a **new intervention** in an existing project, or open the day's interventions. Date
  and suggested time are already filled in.
- **"+ Intervention"** in the preview bar (at the bottom or on the right, next to ✕): a new intervention on the day
  shown, in an existing project, with the date already filled in.
- **Click on a day** with interventions, or Enter from the keyboard: opens the details of **all the day's
  interventions**. Clicking a single event brings its card into view.
- **Card**: status and type, time, participants, notes, a summary ("check OK 2/3 · migrated 1/3"; the status column
  and the summary are named after the type: Migration/migrated, Upgrading/upgraded, Patching/patched,
  Execution/completed for "Other") and the compact, read-only server table, which scrolls horizontally. Above
  1100 px it is a column on the right and the calendar shrinks; below, it covers the whole screen. Close it with ✕
  or Esc.

### Server inventory
- Servers are an **inventory** of their own: removing a server from an intervention does not delete it. It stays
  in the database, with its data and history, ready for future interventions.
- The **Servers** button at the top opens the inventory: all servers, including those that are no longer in any
  intervention.
  - For each one: IP, operating system, environment, current kernel, number of interventions, **last**
    intervention (date and migration status) and **next** scheduled one.
  - **Search** on hostname, IP, operating system, environment, kernel and notes.
  - Keyboard navigation: ↓ from the search box to the list, ↑/↓ between rows, Enter to open the history.
  - Resizable columns.
- Selecting a server shows its **intervention history**, most recent first:
  - for each one: date, project, intervention status, check, migration, target kernel, execution date,
    technician and notes;
  - future interventions are marked as "scheduled";
  - **Open intervention** takes you to the intervention with the server's row highlighted;
  - below is the history of **changes to the server's data** (e.g. IP changed: old → new, with date and time).
- **Reusing a server**: in the full-screen table, typing the hostname in "Add server" shows **suggestions** from the
  inventory (IP, OS, environment, number of interventions). Pick one with the mouse or with ↓ and Enter, and the
  server is linked with all its data. Those already in the intervention are marked and cannot be selected. If the
  hostname does not exist, Enter creates a new server.
- **Importing many servers** ("Import from CSV/Excel…", next to "Add server", in the full-screen table and in the
  bottom preview): choose a **CSV** or **Excel (.xlsx)** file, or **paste rows** copied from a spreadsheet. Columns are
  recognised from their names, in English or Italian (hostname/server, IP, OS, environment, kernel, target OS/kernel,
  technician, notes) or, without a header, from the content; each column can be changed or ignored. A **preview**
  shows what will happen to every row (new server, server from the inventory, skipped, error) before anything is
  saved. Operating systems are matched to the list even when written differently ("RHEL 9.8" = "Red Hat Enterprise
  Linux 9.8"); unknown OS, environments or technicians are left empty with a warning. Servers already in the inventory
  keep their data unless "Update the data of servers already in the inventory" is ticked (differences are shown).

### Technicians
- People live in the database (`users` table) and are managed from the **Technicians** button at the top: name,
  company email (optional), role (technician, coordinator, administrator) and **Active**. Changes are saved
  automatically.
- **New technician on the fly**: in the participant menus, "**+ New technician…**" (at the bottom of the list) opens
  a field for the name. The technician is saved in the database and added to the intervention; if a technician
  with that name already exists (case and spaces ignored), that one is used. Every user can do it, but it only
  creates the name: *technician* role, no email, no login. If the name belongs to a deactivated technician a notice
  appears: an administrator must reactivate them.
- **Adding**: "Add technician" form at the bottom of the window. Name and email are unique, case-insensitive.
- **Never deleted, only deactivated**: a deactivated technician disappears from the selection menus but stays
  where already assigned (shown as "(deactivated)"), in the audit log and in the calendar filter, so past
  interventions can still be reviewed.
- **Drop-down menus** with the active technicians in:
  - the "Technician" column of the server table;
  - the intervention **participants**, both in the card and in the "New project" window: pick from the
    "+ Add technician…" menu and remove with the × on the label; in the card the change is saved immediately;
  - the calendar filter by technician.
- The 4 initial technicians (Luca Bianchi, Sara Verdi, Marco Neri, Giulia Gallo) are **fictitious** and come from
  the sample data: they can be renamed or deactivated.
- A technician added by a colleague appears in the menus within about 10 seconds.

### Settings
The **⚙** icon at the top opens Settings, the place where configuration and customization options are collected.

**Appearance** (personal, every user has their own):
- **Language**: English or Italian. The default, "Same as the browser", uses Italian if the browser prefers it,
  otherwise English. Server messages (errors, notices), the sharing email and the "What's new" changelog
  (`CHANGELOG.md` in English, `CHANGELOG.it.md` in Italian) follow the chosen language too.
- **Intervention preview**:
  - *on the right*: compact and read-only, editing opens full screen;
  - *at the bottom, below the calendar*: full width, with the **complete, editable server table** (as in full
    screen). The project column stays on the left.
  - You can also switch between the two with the **button in the preview bar**, next to ✕. The height is adjusted
    by dragging the top edge of the preview (or with ↑/↓ when it is selected) and is remembered.
- **Theme**: same as the system, light or dark.
- **Time format**: 24-hour (European, default) or 12-hour with AM/PM.
- **Date and time in the top bar**: date and time (default), with seconds, date only, time only, or hidden.
- **Project column**:
  - *view* as squares or as rectangles (one per row);
  - *sorting* alphabetical or by date (chronological, from top to bottom, by the first intervention of each
    project; those without interventions at the bottom);
  - *width*: drag the right edge of the column (←/→ arrows from the keyboard, double click to go back to 280 px).
  View and sorting can also be changed with the buttons at the top of the column.

**Administration** (administrators only): access to Users and Operating systems.

Preferences are saved on the server, in the `user_preferences` table, and follow the user on any computer. To add a
new one:
1. a field with a default value in `app/schemas/preferences.py` (no migration needed);
2. the control in the right section of `static/js/settings.js`;
3. applying it in `static/js/prefs.js`.

### Operating systems
- The server table has two drop-down columns: **OS** (current operating system, a server attribute) and
  **Target OS** (destination operating system in that intervention, an attribute of the row like the target
  kernel). The headers are abbreviated; the full name appears on hover.
- Administrators find **"+ Add version…"** at the bottom of the menus: one or more versions can be typed ("9.6" or
  "9.5, 9.6") without leaving the table.
- The **OS** column is a drop-down with the **active** entries of the list, shown in short form ("RHEL 9.8"). The
  server stores the full name ("Red Hat Enterprise Linux 9.8").
- The initial list (from the migration) contains Red Hat Enterprise Linux 7.9, 8.10, 9.8 and 10.2.
- **New versions** (minor or major): an administrator adds them from Settings → Administration →
  **Operating systems** (or from the table menu), giving the family and one or more comma-separated versions.
  Other families can be added too (Rocky Linux, Oracle Linux…). The order is numeric: 9.8, 9.9, 10.2, 10.3, 11.0.
- **Outdated versions** are **deactivated**. They disappear from the menu, but the servers that have them keep them
  (shown as "not in list"). An entry can be deleted only if no server uses it, e.g. if it was added by mistake.
- Entries are not renamed: that would change the meaning of the servers that use them. To fix a mistake, add the
  right entry and delete or deactivate the wrong one.
- The server accepts only active entries; a value already present may stay unchanged.

### Customers
- Each project can have a **customer** (optional), chosen from a drop-down in the "New project" window and in the
  project card. **"+ New customer…"** creates one on the fly; if the name already exists, even with different
  case, that one is used.
- **Grouping**: in the menu at the top of the project column choose "Customer · A → Z" or "Customer · by date" (or
  Settings → Appearance → Grouping). A heading appears for each customer, with the number of projects; those
  without a customer go at the bottom.
- **Filtering**: Filters → **Customer**. The filter applies to the calendar **and** to the project column.
- The customer name appears on the tiles, **in the calendar** (second line of each intervention:
  "2/4 · Customer · time"), in the intervention card and in tooltips; the column search finds it.
- **Color per customer**: in Settings → Administration → Customers you choose each customer's color, which
  applies to all its projects (tiles, calendar, cards). "Automatic" goes back to the portal palette, also used for
  projects without a customer. On light colors the text turns dark to stay readable.
- **Management** (administrators): Settings → Administration → **Customers**. Renaming a customer updates all its
  projects; only customers without projects can be deleted.

### Editing projects and interventions
- **Project card**:
  - opens from the **pencil** on the tile (visible on hover; always visible on phones), from the **Project**
    button in the intervention card, or with a click on the tile of a project that has no interventions yet;
  - edit name (unique), description and status (active, suspended, closed);
  - shows all the project's interventions, each with an **Open** button;
  - **+ New intervention** adds another date to the same project.
- **Times** are chosen from menus in 30-minute steps. For a new intervention **9:00–13:00** is suggested, or
  **14:00–18:00** if there is already an intervention on that date (the suggestion follows the date until you touch
  the times). 24-hour or AM/PM format from Settings → Appearance.
- **Edit intervention** (**Edit** button in the card): date, type, title, times and notes. Status, participants and
  servers are changed from the card and the table, as before. When the date moves, server rows whose planned date
  was the old one follow it.
- **Duplicating an intervention** (**Duplicate** button in the card, between "Share" and "Edit"), for example when
  it must be run again: choose the new date (suggested: one week later) and the time. A "Planned" intervention is
  created in the same project with the original's type, title, notes and technicians and, if you want, the same
  server table: target, technician and notes of each row are kept, statuses start over (check "To do", migration
  "Planned", no execution date). The original does not change.
- **Deleting an intervention**: from the "Edit" button of the intervention card, or from the bin in the list of the
  project card. Its server rows and participants are removed; **the servers stay in the inventory**. If it contains
  servers, the coordinator or administrator role is required; technicians can delete only empty interventions.
  Alternatively it can be marked as "cancelled" to keep its history.
- **Deleting a project** (coordinators and administrators): project card → "Delete project". All its interventions
  are removed; the customer and the servers stay.
- **Confirmation**: before every deletion a window lists what will be deleted and what stays. For a project with
  interventions you must **type the project name**. Every deletion stays in the audit log, with its author.
- All changes use version control: if a colleague changed the same data, the save is refused with a notice.

### New project
- At the bottom of the project list there is the **"+ New project"** tile, as large as the others and always
  visible, even during a search.
- The window asks for a **name** (required and unique, case-insensitive) and a description.
- For the first intervention you also choose the participating **technicians** from the drop-down.
- The **First intervention** section (date, type, title, times) is on by default: without an intervention the
  project does not appear in the calendar. It can be turned off.
- After creation the new project's tile is highlighted and, if there is an intervention, the calendar goes to its
  date and opens the card. From there you add the servers with "Full screen · edit".
- Colleagues see the new project and its intervention within about 10 seconds, without reloading the page.

### Search and filters
- **Search** (sidebar), after at least 2 characters:
  - filters projects by name and looks for **servers** by hostname, IP or operating system in all interventions;
  - each result shows project, date and statuses;
  - a click opens the intervention and highlights the server's row;
  - the `%` and `_` characters are searched literally.
- **Calendar filters** (**Filters** button at the top):
  - intervention status (multiple choice), technician (participant or assigned to a row) and **Problems only**
    (at least one check KO or one failed migration);
  - they apply to all months, including those loaded while scrolling, and are **remembered in the browser**;
  - a day with interventions hidden by the filters has its number dotted-underlined.
- **Row filter** in the full-screen table: free text (hostname, IP, kernel, notes, technician) and check or
  migration status. A row just edited or added stays visible until you change the filter.

### Statuses and concurrency
- **Intervention status** (planned, confirmed, in progress…): changed from the colored menu in the card or in the
  full-screen table. It uses the same version control as the rows (409 if another user changed it).
- **Automatic updates**:
  - every 10 seconds, and immediately when you return to the browser tab, the app asks the server what changed
    (`GET /api/changes`);
  - it updates the calendar, the side card and the open table;
  - in the table, rows changed by others flash light blue;
  - cells being edited are not touched;
  - a server attribute (e.g. the IP) changed in one intervention also updates the other interventions where that
    server appears.

### Resizable columns
- Both in the compact table and in the full-screen one: **drag the right edge of the header**.
- From the keyboard: Tab to the edge, then ←/→ arrows.
- **Double click** on the edge resets the column to its default width; **Default widths** in the full-screen table
  resets them all.
- The last column (Notes) takes the remaining space.
- Widths are **remembered in the browser**, separately for the two tables.

### Sharing an intervention by email
- The **"Share"** button (on every intervention card and in the full-screen table) opens the email preview: a
  header with customer, project, date, time, type, status, participants and notes, the summary and the **server
  table with all the portal's columns** (colored statuses, current and target kernel and OS, technician, notes).
- **Recipients** already filled with the participants' emails (editable) and **subject** already written:
  customer, project, date and time, intervention status.
- **"Copy and open Gmail"**: copies the formatted email and opens a new Gmail message with recipients and subject.
  Paste into the body with **Ctrl+V** and the table stays formatted. "Copy email" only copies; "Copy as plain text"
  is for programs that do not accept formatted text.
- The email is written in the language of the user who shares it.
- **Gmail account (sender)**: the Google account used to open Gmail; by default the email of your portal profile.
  Change it in the window or in Settings → Appearance → "Sharing by email"; it is remembered. The account must be
  signed in to the browser (even alongside the personal sync account), otherwise Gmail opens the default one: in
  that case turn on **"Let me choose the Google account each time I send"**, which goes through Google's account
  chooser (with the address already suggested) and lets you select it or sign in.
- The portal does not need to be connected to Google: the user sends the email from their own mailbox.
- At the bottom of the email there is the **link to the intervention** in the portal (`http://…/#intervento-ID`):
  whoever opens it lands directly on that intervention after logging in.

### Configuration interventions
- The **"Configuration"** type (in the intervention window, "Type" menu) is meant for interventions without kernel,
  check and migration.
- The server table has only **hostname, IP, OS, environment, status, executed on and technician**. The **status** of
  each server's activity (Planned, In progress, Completed, Failed, Postponed, Cancelled) is what counts for the
  progress in the calendar ("1/2"); "executed on" is only the date the work was actually done. Below each server there
  is a **full-width notes row** for the configuration details (steps, parameters, modified files, checks): it
  starts two lines high and **grows with the text**; it can also be stretched by dragging the corner. **Enter**
  starts a new line, leaving the field saves, **Esc** cancels.
- The notes (up to 20,000 characters) keep their line breaks in the compact card and in the sharing **email**,
  below each server. The summary shows how many servers are completed.
- Changing the type of an intervention changes the table columns; the data of hidden columns stays saved.

### Full-screen table (editing)
The **"Full screen · edit"** button in the card opens the complete table with its **11 columns**:

hostname, IP, operating system, environment, current kernel, target kernel, check, migration, execution date,
technician, notes.

From about 1300 px all columns are visible; below that, the table scrolls horizontally with the hostname pinned on
the left.

- **Auto-save** of each cell: when leaving the cell, with **Enter** (which saves and moves to the row below) or when
  picking from a menu. A cell just saved flashes green; the one being edited has an amber dot.
- **Esc** cancels the cell edit; if no cell is being edited, it closes the table. Closing saves the open cell first.
- **Adding a server**: hostname at the bottom and Enter. If the hostname already exists (even in another project),
  **that** server is linked with its data; if it is already in the intervention, the addition is refused.
  Hostnames are stored in lowercase.
- **Removing a server**: bin icon, confirmed with a second click. The server stays in the inventory and in the other
  interventions.
- **Underlined columns** (hostname, IP, OS, environment, current kernel): they are **server** attributes, shared by
  all the interventions where it appears. The others apply to this intervention only.
- **Validation**: valid IP, hostname with allowed characters only, statuses among the expected ones. A cell with an
  error turns red and the reason is shown in the tooltip.
- **Concurrency**: if another user saved the same row in the meantime, the save is **refused**. The row shows the
  updated values, the cell turns amber and a notice asks you to redo the change. Nothing is overwritten without the
  user knowing.
- **Audit log**: every change, addition and removal is recorded in `audit_log` (field, old and new value, date and
  time). Without login the user is empty.
- Closing the table updates the side card and the calendar (number of servers).

### Export and import between installations
To move projects from one Date Spreader installation to another: for example from the company portal to an
installation on a PC or at a customer's site.

- **Export** (coordinators and administrators):
  - a **project**: project card → "This project";
  - a **whole customer**, with all its projects: project card → "All of customer “…”", or Settings → Administration →
    Customers → "Export".

  You download a `datespreader-progetto-….json` or `datespreader-cliente-….json` file with interventions, complete
  server tables, participants, customer (with its color) and the operating system versions used. It **never
  contains** passwords, logins, preferences or audit log. Every export stays in the audit log (who, what, when).
  The file contains customer data (hostnames, IPs): treat it with the same care as the database.
- **Import** (administrators): Settings → Administration → **"Import projects"**, choosing or dragging the file.
  - The **preview** shows what will be created: projects, interventions and server rows, customers, servers,
    technicians and OS versions, new or already present. It is faithful: the server runs the import and rolls it
    back.
  - What already exists is **recognized and reused, without modifying it**: customers by name, servers by
    hostname, technicians by email and then by name, OS versions by family and number. If an existing server has
    different data in the file (e.g. another IP), the preview reports it and the current data is kept here.
  - **Projects with the same name**: skipped, or imported as a copy "… (imported)".
  - New technicians are created with the *technician* role and without access to the portal.
  - The import runs in a single transaction: all or nothing.
- The format (`"format": "datespreader-export"`, `"format_version": 1`) is described in `app/schemas/transfer.py`.
  A file created by a newer version with an incompatible format is refused with a clear message.

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Application, database and schema status (public) |
| `GET /api/version`, `GET /api/changelog` | Version and changelog (public; the changelog in the user's language) |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/change-password` | Access |
| `POST /api/users/{id}/temporary-password` | Temporary password for a user (administrators only) |
| `GET /api/projects` | Projects with the dates of their interventions, in order |
| `GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD` | Interventions in the range (both ends included, at most 400 days), with project name, number of servers and progress (`migrated`, `executed`) |
| `GET /api/events/{id}` | Details of an intervention: participants and server rows, with `version` for concurrency control |
| `GET /api/days/YYYY-MM-DD` | Details of all the interventions of a day (empty list if there are none) |
| `PATCH /api/event-servers/{id}` | Partial update of a row. Requires `version` (and `server_version` if server fields are touched). Returns **409** with `detail.current` if the data changed, **422** if a value is invalid |
| `POST /api/events/{id}/servers` | Adds a server to the intervention (reuses the server if the hostname exists). 409 if already present |
| `POST /api/events/{id}/servers/import` | Imports a server list (`kind`: `text` for CSV/TSV/pasted rows, `xlsx` for a base64 Excel file; optional `mapping`, `has_header`, `update_existing`). `dry_run: true` (default) = preview, nothing saved |
| `DELETE /api/event-servers/{id}?version=N` | Removes the server from the intervention (it stays in the inventory). 409 if the row changed |
| `GET /api/users[?all=true]` | Active technicians (with `all=true` also deactivated ones) |
| `POST /api/users` | New technician (`display_name`, `email`, `role`). 409 if the name or email already exists |
| `POST /api/users/technicians` | On-the-fly technician, for all users (`display_name`): returns the one with the same name (200) or creates it with the technician role (201); 409 if deactivated |
| `PATCH /api/users/{id}` | Edits name, email, role, `is_active` (with `version`, 409 if changed) |
| `PUT /api/events/{id}/participants` | Replaces the participants (`user_ids`). A deactivated technician can stay but cannot be added |
| `GET /api/options` | Allowed values for the choice columns |
| `POST /api/projects` | Creates a project (`name`, `description`, `status`), with optional `first_event` (`event_date`, `title`, `event_type`, `start_time`, `end_time`). 409 if the name already exists |
| `GET /api/me/preferences` · `PATCH /api/me/preferences` | Personal preferences of the current user (preview position and height, theme, `language`: `auto`, `en` or `it`, project column width/view/sorting) |
| `GET /api/operating-systems[?all=true]` | List of operating systems (active; with `all` also deactivated), with `server_count` |
| `POST /api/operating-systems` · `PATCH /api/operating-systems/{id}` · `DELETE /api/operating-systems/{id}` | List management (administrators only): add (`family`, `major`, `minor`), activate/deactivate, delete if never used |
| `GET /api/customers` · `POST /api/customers` | Customers with number of projects; creation (all users) |
| `PATCH /api/customers/{id}` · `DELETE /api/customers/{id}` | Rename and color (`name`, `color` "#RRGGBB" or null), and deletion if without projects (administrators only) |
| `PATCH /api/projects/{id}` | Edits project name, description, status (`version`, 409 if changed or name already used) |
| `POST /api/projects/{id}/events` | New intervention in the project (date, type, title, times, notes, `participant_ids`) |
| `POST /api/events/{id}/duplicate` | Copies the intervention to another date (`event_date`; time copied or `keep_times: false` with `start_time`/`end_time`; `include_servers`: server table with reset statuses) |
| `PATCH /api/events/{id}` | Edits date, type, title, times, status, notes of an intervention (`version` required, 409 if changed) |
| `DELETE /api/events/{id}?version=N` | Deletes an intervention with its server rows (the servers stay). With servers: coordinators and administrators only (403 for technicians) |
| `DELETE /api/projects/{id}?version=N` | Deletes a project with its interventions (coordinators and administrators only) |
| `GET /api/servers[?q=…&limit=…]` | Inventory: all servers (even without interventions) with number of interventions, last and next. `total` = total matches |
| `GET /api/servers/{id}` | Server data, intervention history (most recent first) and changes to its data |
| `GET /api/export/projects/{id}` · `GET /api/export/customers/{id}` | JSON file with one project, or with all the projects of a customer (coordinators and administrators) |
| `POST /api/import/preview` · `POST /api/import` | Preview (writes nothing) and import of an export file (`data`, `on_conflict`: `skip` or `copy`; administrators only) |
| `GET /api/search?q=…` | Projects (name, description) and server rows (hostname, IP, OS) containing the text |
| `GET /api/changes[?since=N]` | Change feed. Without `since` it returns the starting point (`last_id`); with `since` also the interventions touched after that id, `projects_changed` (new projects or interventions: reload the sidebar) and `users_changed` (technicians changed: reload the menus) |

`GET /api/events` also returns the indicators used by the filters: `check_ko`, `migration_failed`, `migrated` and
`user_ids` (participants and assigned technicians).

Server messages (errors, notices) are returned in the language of the request's `Accept-Language` header (English
by default; the web client sends the user's language).

## Database commands

| Command | Effect |
|---|---|
| `.venv/bin/python -m app.cli init` | Applies the migrations (creates the database if missing). Safe to repeat |
| `.venv/bin/python -m app.cli init --demo` | As above, plus the sample data (for a demo or a trial installation) |
| `.venv/bin/python -m app.cli migrate` | Applies the migrations only |
| `.venv/bin/python -m app.cli demo load` | Loads the sample data next to the rest; does nothing if already present |
| `.venv/bin/python -m app.cli demo remove` | Shows what would be removed and asks for confirmation (`--yes` to skip it) |

**No command deletes data entered by users.** The old `seed --reset`, which emptied everything, has been removed.

### Sample data (demo)
Sample projects, servers and technicians have the `is_demo` field. In the interface they carry the **sample**
label, both on the project tiles and in the "Technicians" list.

- **New / demo installation** (e.g. after cloning the open-source repository): `init --demo`.
- **Switching to real data**: `demo remove`. What it does:
  - deletes the sample projects, with their interventions, server rows and participants;
  - deletes the sample servers, **except** those used in real interventions: they stay and stop being "sample";
  - deletes the sample technicians, **except** those used by real data: they are only deactivated;
  - real data is never touched.
- Sample data can be loaded again at any time with `demo load`.
- On a systemd installation the commands must be run as the service user:
  `sudo -u datespreader .venv/bin/python -m app.cli demo remove`.
- Users who have the portal open see projects and technicians disappear within about 10 seconds; to clean up the
  calendar as well, reload the page (Ctrl+F5).

### Backup
The database is backed up automatically to `data/backups/`: every night (systemd timer `datespreader-backup.timer`),
before every schema upgrade and on demand (Settings → Administration → "Database backups", where administrators
can also download them). Every copy is verified; rotation keeps 7 daily, 4 weekly and 12 monthly backups. Details,
restore and off-machine copies: [install guide, "Backup"](docs/INSTALL.md#backup).

```bash
sudo -u datespreader .venv/bin/python -m app.cli backup            # backup now (+ rotation)
sudo -u datespreader .venv/bin/python -m app.cli backup --list     # list
sudo -u datespreader .venv/bin/python -m app.cli restore FILE      # restore (stop the service first)
```

`data/` (database and backups) is excluded from git: **it must never end up in the repository**, because it holds
real customer data. The public demo database is `demo/datespreader-demo.sqlite3`, generated from scratch by
`scripts/make_demo_db.py` (never copied from a real database).

> **Migrations and SQLite.** To alter a SQLite table, Alembic recreates it (copy, drop, rename). With foreign keys
> enabled, dropping a "parent" table would trigger `ON DELETE CASCADE` and empty the child tables. That is why
> `app.migrations.upgrade_database` **disables foreign keys during migrations**, checks integrity at the end
> (`PRAGMA foreign_key_check`) and re-enables them. `migrations/env.py` refuses to start if it finds them enabled.
> The `test_migrations_do_not_cascade_delete_children` test checks this.

If you change a model in `app/models/` you must generate a new migration and review it before applying it, then
regenerate the demo database:

```bash
.venv/bin/alembic revision --autogenerate -m "describe the change"
.venv/bin/python -m app.cli migrate
.venv/bin/python scripts/make_demo_db.py
```

If you forget, the `test_models_match_migrations` test fails.

## Tests

```bash
.venv/bin/pytest
.venv/bin/python -m pyflakes app/
```

The tests use a temporary database and never touch `data/`. In the data tests the user is a fictitious
administrator (`tests/conftest.py`, `authed_app`). The access tests (`tests/test_auth.py`) use the real login
instead.

## Configuration
Configured through environment variables, or a `.env` file (see `.env.example`).

| Variable | Default | Notes |
|---|---|---|
| `APP_NAME` | `Date Spreader` | Displayed name |
| `DATABASE_PATH` | `data/datespreader.sqlite3` | Relative to the project folder. **Local disk only, never a network share.** |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000` | Wait time when the database is locked by another write |
| `HOST` | `127.0.0.1` | `0.0.0.0` for LAN access (see above) |
| `PORT` | `8000` | |
| `RELOAD` | `false` | `true` for development only |
| `SESSION_HOURS` | `12` | Hours of inactivity after which the session expires |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `SOURCE_URL` | official repository | Where to download the source code (see License) |

## Data model

| Table | Content |
|---|---|
| `projects` | Projects (unique name, description, status) |
| `events` | Interventions: project, date, start and end time (optional), type, status, notes |
| `servers` | Stable machine attributes: hostname (unique), IP, operating system, environment, current kernel |
| `event_servers` | One row of an intervention's server table: target kernel, check status, migration status, planned and actual date, technician, notes, order. The same server can appear in several interventions, but only once per intervention. |
| `users`, `event_users` | Users (fictitious company identity) and intervention participants |
| `audit_log` | Audit log: user, date and time, table, record, field, old and new value |
| `custom_field_definitions`, `custom_field_values` | Configurable extra columns, without changing the SQL schema |

- **Concurrency**: every editable table has a `version` column. If two users save the same record, the second save
  fails (`StaleDataError`) instead of silently overwriting the first; the API turns it into an HTTP 409 response
  and the interface shows a notice.
- **Deletions**: deleting a project also deletes its interventions and their rows. A server used in an intervention
  cannot be deleted.
- **Statuses**: the allowed values are in `app/models/statuses.py`. They are stored as text, so changing them needs
  no migration.

### Fictitious data
`app/seed.py` creates (all flagged `is_demo`):
- 3 projects, 4 interventions, 10 servers and 4 users;
- `*.example.com` hostnames and IPs in the blocks reserved for documentation (192.0.2.x, 198.51.100.x, 203.0.113.x);
- dates computed relative to today, spread over the previous, current and next month.

Some cases are included on purpose to exercise the interface:
- **Alfa Logistica** has **two interventions** on different dates;
- **alfa-db01** appears in both (postponed to the second window);
- **beta-app01** has its check in the `ko` status.

## Project layout

```
app/
  main.py          creates the FastAPI app, mounts the APIs and static files
  config.py        settings from environment variables / .env
  db.py            SQLite engine (WAL, busy_timeout, foreign keys), sessions
  cli.py           init / migrate / demo load / demo remove / users commands
  migrations.py    applies and checks migrations from code
  seed.py          sample data (load, preview and removal)
  api/             HTTP routers under /api (health, calendar, servers…)
  audit.py         writes the audit log (with the author)
  transfer.py      export and import of projects between installations (format in schemas/transfer.py)
  auth.py          access control: session, roles, CSRF
  security.py      passwords (scrypt), tokens, login rate limiting
  i18n.py          server messages in English and Italian (language from Accept-Language)
  models/          ORM models and allowed status values
  repositories/    data access: the only layer that queries the database
  schemas/         API input/output schemas
migrations/        Alembic migrations (alembic.ini in the main folder)
static/            frontend without build steps
  js/main.js       startup and wiring of the components
  js/calendar.js   vertical calendar and progressive loading of months
  js/sidebar.js    project tiles (clickable) and search
  js/chooser.js    date choice for projects with several interventions
  js/detail.js     detail panel with the compact server table
  js/sheet.js      full-screen table, editable inline
  js/resize.js     resizable columns (reused by both tables)
  js/filters.js    calendar filter bar
  js/eventstatus.js intervention status menu
  js/projectform.js "New project" window
  js/projectdialog.js project card and intervention form (new / edit)
  js/osdialog.js   management of the operating system list (administrators)
  js/settings.js   Settings window (Appearance, Administration)
  js/prefs.js      personal preferences: loading, saving, theme and layout
  js/customers.js  customers: shared list, menu with "new customer", management
  js/confirm.js    confirmation window for deletions
  js/session.js    current user and permissions derived from the role
  js/timepick.js   time menus (30-minute steps) and suggested time
  js/contextmenu.js context menu (right click / long press)
  js/share.js      sharing an intervention by email (Gmail)
  js/transfer.js   import of projects from an export file (preview and import)
  js/people.js     technicians: shared list, participant picker, "Technicians" window
  js/inventory.js  server inventory with search and history
  js/auth.js       login, password change, user menu, changelog
  js/labels.js     status labels and colors
  js/api.js        backend calls
  js/i18n.js       interface translations (texts in js/i18n/, English and Italian)
  js/dates.js      date utilities (weeks from Monday, formats in the user's language)
  js/colors.js     stable color for each project
tests/             automated tests (pytest)
demo/              demo database with sample data only
scripts/           make_demo_db.py (regenerates the demo database)
deploy/            systemd unit and install.sh (installation and upgrade)
docs/              installation guide (INSTALL.md in English, INSTALLAZIONE.md in Italian)
data/              local database (excluded from git)
```

## Default choices (documented as the specification asks)
- **Name**: "Date Spreader" as in the specification; the folder is called DateSpreader. Change it with `APP_NAME`.
- **Frontend without framework and without build**: HTML, CSS and JavaScript served directly by FastAPI.
- **SQLAlchemy + Alembic** for data access and migrations, so that a move to PostgreSQL remains possible.
- The code default is `127.0.0.1`; for LAN access set `HOST=0.0.0.0` in `.env`.
- **Migrations do not run by themselves when the app starts**: apply them with `app.cli` (the systemd service does
  it before starting). If the schema is not up to date, `/api/health` answers `schema_non_aggiornato`.
- **Provisional statuses** (the specification leaves them open):
  - check: `da_fare`, `in_corso`, `ok`, `ko`, `non_applicabile`;
  - migration: `pianificata`, `in_corso`, `completata`, `fallita`, `rinviata`, `annullata`;
  - intervention: `pianificato`, `confermato`, `in_corso`, `completato`, `rinviato`, `annullato`.

  These stored values are Italian identifiers; the interface shows them translated.
- **`audit_log`**: records every change, with the intervention involved (`event_id`), and is also the source of the
  `/api/changes` feed. There is no interface to browse it yet.
- **Automatic updates**: the server is polled every 10 seconds instead of using WebSockets. With few concurrent
  users it is simple and reliable; the interval is `POLL_MS` in `static/js/main.js`.
- **Explicit commit** in the write APIs, before the response: a save error never reaches the browser as a success.
- **Languages**: English is the primary language of the interface, the server messages and the documentation;
  Italian is the second language. Interface texts are in `static/js/i18n/`, server messages in `app/i18n.py`.

## License
Copyright (C) 2026 Mark Hawks

Date Spreader is free software: you can redistribute it and/or modify it under the terms of the
**GNU Affero General Public License, version 3** (`AGPL-3.0-only`), as published by the Free Software Foundation.
It is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

In short, under the AGPL: if you make a **modified** version of the portal available to other users, even only over
a network, you must offer them the source code of your version. The portal shows the source-code link on the login
screen and in "What's new": set `SOURCE_URL` to the location of your version.
