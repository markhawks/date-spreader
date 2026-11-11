# Changelog

All notable changes to the Date Spreader portal (called "Time Dot" up to version 0.9.0).
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versions: [Semantic Versioning](https://semver.org/).
Italian version: [CHANGELOG.it.md](CHANGELOG.it.md).

## [Unreleased]
### Changed
- **Configuration interventions have a "Status" column** (Planned, In progress, Completed…) in the full-screen table, the bottom preview, the card, the filters and the sharing email. The progress in the calendar ("1/2") and the summary now count the servers with status "Completed", as for the other types, and no longer those with an "executed on" date: a date filled in as a planned date no longer marks the work as done.

### Added
- **Import servers from CSV/Excel** into an intervention ("Import from CSV/Excel…" next to "Add server"): a CSV or .xlsx file, or rows pasted from a spreadsheet. Columns recognised from their English or Italian names (or from the content), changeable; a preview shows the result of every row before saving; OS names matched to the list even when written differently; servers already in the inventory are linked and updated only on request; bad rows never block the others. New dependency: `openpyxl` (reading .xlsx). API: `POST /api/events/{id}/servers/import`.
- **Scheduling conflicts**: warning when the same server is in two interventions on the same day, or a technician (participant or assigned to a server row) is in two interventions at overlapping times (no time = whole day; cancelled interventions ignored). Warning icon on the calendar, list of conflicts with a link to the other intervention in the card and in the full-screen table. API: `conflict_users` and `conflict_servers` in `GET /api/events`, `conflicts` in the intervention details.
- **Technicians view** (button next to Month and Week): each technician's week, one column per day, with double-booked technicians highlighted, a row for interventions without technicians, week navigation, filters, and a compact layout when the area is narrow. The chosen view is remembered (`calendar_view: "team"`).

### Fixed
- Week view: live updates from other users redraw every changed week (before, two changed weeks in the same month redrew only one).

## [0.23.0] - 2026-11-11
### Added
- **Automatic database backups**: a verified copy (SQLite backup API + integrity check) every night at about 02:30 (systemd timer `datespreader-backup.timer`, installed by `deploy/install.sh`), before every schema upgrade and on demand. Rotation: everything from the last 48 hours, then 7 daily, 4 weekly and 12 monthly backups (configurable); other files in `data/backups/` are never deleted. New commands `app.cli backup [--list]` and `app.cli restore FILE` (the current state is saved first as a "pre-restore" backup). Administrators: Settings → Administration → "Database backups", with the list, "Back up now", download and restore instructions. Copying the backups to another machine is left to the company backup system.
- **Interface in English and Italian**. Each user picks the language in Settings → Appearance → "Language": "Same as the browser" (default: Italian if the browser prefers it, otherwise English), English or Italiano. Server messages, the sharing email and the "What's new" changelog (`CHANGELOG.md` in English, `CHANGELOG.it.md` in Italian) follow the chosen language too. Personal preference `language`.
- **Documentation primarily in English**, for worldwide use: `README.md` and `docs/INSTALL.md` are now complete and in English; the Italian versions are `README.it.md` and `docs/INSTALLAZIONE.md`. The Italian changelog is `CHANGELOG.it.md`.
- **Date and time in the top bar**, next to the portal name: "Wed 11 November 2026 · 14:32". In Settings → Appearance → "Date and time in the top bar" you choose: date and time (default), with seconds, date only, time only, hide. The time follows the 24h/12h format; hovering shows the full date. On medium screens only the time is shown, on phones it is hidden. Personal preference `topbar_clock`.
- **Duplicate intervention**: a **"Duplicate"** button in the intervention card, between "Share" and "Edit", for when the same intervention must be run again on another date. You choose the date (suggested: one week later), the time (the original's, editable) and whether to copy the server table. The new intervention, in the same project, is "Planned" and has the original's type, title, notes and active technicians; the server rows keep target, technician and notes, with statuses reset (check "To do", migration "Planned", no execution date). After the copy the new intervention opens. API: `POST /api/events/{id}/duplicate`.
- **Weekly calendar view**: two buttons, **Month** and **Week**, next to "Today", with the same look (the active view's button is solid blue, the other has a blue border; on phones only the icon). Each week is a block ("Week 46 · 9 – 15 November 2026") with seven columns that grow with the interventions: **all** of them are shown, without "+N", with name, progress, customer, title and time, type and technicians. Switching view stays on the same day; continuous scrolling with progressive loading, zoom (minimum height of the days), filters, right click and live updates work as in the monthly view. When the calendar is narrow (phone, preview on the right) the days are stacked one below the other. The chosen view is a personal preference (`calendar_view`).
- **Intervention progress in the calendar**: each intervention shows how many tasks are completed out of the total number of servers (e.g. **"2/4"**, at the start of the second line) and a **thin bar** at the bottom that fills up in the project color; when the work is done the number turns green with ✓. For configuration interventions it counts the servers with "executed on" filled in, for the others the completed migrations. The tooltip says "completed 2/4 servers". API: new `executed` field in `GET /api/events`.

### Changed
- **New project description**: Date Spreader plans and tracks any kind of technical intervention (migrations, upgrades, patching, configuration, maintenance) on servers with any operating system, not only RHEL migrations and upgrades. README, package metadata and service description updated.
- **Empty calendar days can also be selected with a click**, like those with interventions: the day lights up and the empty preview opens ("No interventions on this date"), with the "+ Intervention in an existing project" and "New project on this date" buttons.
- **The subject of the sharing email also contains the intervention status**, at the end: "Intervention: Customer · Project · 18 Nov 2026 21:00 · Confirmed".
- **The status column of the server table is named after the intervention type**: "Migration" for migrations, "Upgrading" for upgrades, "Patching" for patching, "Execution" for "Other". The table filter, the card summary ("migrated / upgraded / patched / completed 2/4") and the sharing email change too. When the type changes, the open table (also in the bottom preview) updates by itself, without reloading.

### Fixed
- In the bottom preview, changes made by other users to the intervention data (type, title, time, notes) now also update the card header, not only the table rows.

## [0.22.0] - 2026-11-11
### Added
- **New "Configuration" intervention type**. The server table shows only hostname, IP, OS, environment, "executed on" and technician; below each server there is a **full-width notes row**, two lines high, that grows with the text (Enter starts a new line, leaving the field saves). It applies to the full-screen table, the bottom preview, the compact card (notes with line breaks) and the sharing email. The summary shows the executed servers ("executed 1/2"). Changing the type of an intervention changes the table columns; the data stays.
- **"+ Intervention"** button in the preview bar (next to move-preview and ✕, at the bottom and on the right): creates an intervention on the day shown, choosing the project; the form has the date already filled in, as from the right click on the calendar.
- **New technician directly from the participants**: at the bottom of the "+ Add technician…" menu there is **"+ New technician…"**, which opens a field for the name (Enter adds, Esc cancels). The technician is saved in the database and appears immediately in all menus; if the name already exists (even with different case or spaces) that one is used, without duplicates. It works in the intervention card, in "New project" and in the intervention form, for all users: it creates only the name, with the technician role and without access to the portal. API: `POST /api/users/technicians`.
- **Calendar zoom**, as in Blender: **hold the middle mouse button and move the mouse forward/back** (forward zooms in), from 50% to 250%. The day under the cursor stays put. Alternatively: pinch on the touchpad and the **− % +** control in the bottom right corner of the calendar (click on the percentage = 100%). Zoom is a personal preference. Ctrl + mouse wheel remains the normal page zoom.
- **Zoom shows more information**: zooming out shows more months, with interventions as colored bars; zooming in, each day shows more interventions and, if there is room, also the title and full time.
- **Export and import between Date Spreader installations** (e.g. from the company portal to an installation on a PC or at a customer's site):
  - **export** of a project, or of a **whole customer** with all its projects, to a JSON file: interventions, complete server tables, participants, customer with its color, OS versions used. From the project card ("This project" / "Whole customer") and from Settings → Administration → Customers ("Export"). Reserved for coordinators and administrators; every export stays in the audit log. Never passwords, logins or audit log in the file;
  - **import** (administrators) from Settings → Administration → "Import projects", with a faithful **preview** before importing. Customers, servers, technicians and OS versions already present are recognized and reused, without changing their data (differences on servers are reported). Projects with the same name are skipped or imported as a copy "… (imported)". The import is all or nothing.
- **Install script** `deploy/install.sh`, **tested on Fedora 44**:
  - installs the portal in `/opt/datespreader` with a dedicated system user, systemd service, firewall and first administrator;
  - run again, it **upgrades** the installation, backing up the database first;
  - options for port, sample data, temporary password, version to install and a second instance on the same machine.
- **Installation guide**: `docs/INSTALLAZIONE.md` (with a shorter English version), with upgrade, backup, HTTPS, uninstall and troubleshooting. Coming soon: guided installer, RPM package and support for RHEL 10.2 and Fedora 45.
### Changed
- The **"Today"** button is in the **middle of the top bar**, solid blue like the title of the current month and with a calendar icon, so it is found at once. On phones it sits next to the portal name.
- The notes of a server row accept up to 20,000 characters (previously 2,000).
### Fixed
- On days with several interventions the boxes were squashed and the text cut. Now each day chooses how to draw them: two lines if there is room, otherwise the name only, and "+N" for those that do not fit.

## [0.21.0] - 2026-11-10
### Added
- **Open-source project**, released under the **GNU AGPL-3.0-only** license (`LICENSE` file). The link to the source code appears on the login screen and in "What's new"; whoever publishes a modified version sets it with the `SOURCE_URL` variable.
- **README in English**.
- **Demo database** `demo/datespreader-demo.sqlite3`, with sample data only and a demo administrator; regenerated with `scripts/make_demo_db.py`.
- **Share by email** ("Share" button on every intervention and in the full-screen table): prepares a formatted email with a header (customer, project, date, time, type, status, participants, notes), summary and **complete server table** with colored statuses. "Copy and open Gmail" copies it to the clipboard and opens a new Gmail message with recipients (participants) and subject already filled in: just paste with Ctrl+V. Copying as plain text is also available.
- **Direct link to an intervention** (`/#intervento-ID`), included in the email: opens the portal on that intervention.
- **Choice of the Gmail account** for sharing by email: "Gmail account (sender)" field in the Share window and in Settings → Appearance, remembered as a personal preference (previously the profile email was always used, and Gmail opened the browser's personal account if it did not recognize it). Option "Let me choose the Google account each time I send" to go through Google's account chooser.
- **Portal logo** at the top left, before the name "Date Spreader" (next to the version), and as the browser tab icon.
- Button in the intervention preview bar (next to ✕) to move it **to the bottom** or **to the right** on the fly; the choice is saved as in Settings → Appearance.

## [0.20.0] - 2026-11-10
### Added
- **"Target OS" column** in the server table of every intervention: destination operating system, chosen from the same drop-down as the operating system list. It is an attribute of the single row, like the target kernel. It also appears in the compact card ("→ RHEL 9.6 · kernel") and in the server history.
- **"+ Add version…"** in the OS and Target OS menus (administrators): creates a new version without leaving the table. If you create just one, it is set in the cell immediately.
- **Several versions at once** ("9.5, 9.6, 10.3") both from the menu and from Settings → Administration → Operating systems; those already present are reported without blocking the others.

### Changed
- Abbreviated headers: "OS" and "Target OS", with the full name on hover; values show the full name ("Red Hat Enterprise Linux 9.6") in the tooltip.
- A version used as target OS counts as "in use": it cannot be deleted, only deactivated.

### Fixed
- Closing the full-screen table with Esc also closed the intervention preview, which stayed on "Loading…".

## [0.19.0] - 2026-11-10
### Added
- **Right click on a calendar day**: a menu with
  - "New project on this date…" (first intervention already on that date);
  - "New intervention in an existing project…" (project choice, grouped by customer);
  - "Open the day's interventions", if there are any.
  Date and suggested time (9–13, or 14–18 if the day is already busy) are pre-filled.
- On touch devices the same menu opens with a **long press** on the day; from the keyboard with the Menu key or Shift+F10 on a selected day.

## [0.18.0] - 2026-11-10
### Added
- **Time menus in 30-minute steps** in the "New project" (first intervention), "New intervention" and "Edit" forms, instead of the browser's time field.
- **Suggested time** for a new intervention: **9:00–13:00**, or **14:00–18:00** if there is already an intervention on that date. The suggestion follows date changes until the times are edited by hand.
- If the start time goes past the end time, the end moves automatically (+4 hours).
- **Time format** in Settings → Appearance: **24-hour** (European, default) or **12-hour AM/PM**. It applies to forms, calendar and cards.

### Fixed
- Pressing Esc to close a window (e.g. "Edit intervention") also closed the intervention preview below.

## [0.17.0] - 2026-11-10
### Added
- **Customer in the calendar**: each intervention shows the customer in the second line ("Customer · time · N srv") and in the tooltip.
- **Color per customer** (Settings → Administration → Customers): a color for each customer, used by all its projects in the project column, in the calendar and in the cards. "Automatic" goes back to the colors assigned by the portal; projects without a customer use them too.
- Readable text on solid colors: dark on light colors (e.g. yellow), white on dark ones.
- Color changes reach colleagues immediately, without reloading the page.

## [0.16.0] - 2026-11-10
### Added
- **Deleting a project** (project card → "Delete project"), with all its interventions. The customer and the servers in the inventory stay.
- **Deleting an intervention even if it contains servers** (from "Edit" in the intervention card, or from the bin in the list of the project card). The server table rows are removed; the servers stay in the inventory.
- **Confirmation before every deletion**: a window lists what will be deleted and what stays. For a project with interventions you must **type its name** to enable the button. Focus starts on "Cancel".
- The audit log records every deletion: who made it, the intervention and the servers it contained.

### Changed
- Permissions: deleting a project, or an intervention that contains servers, is reserved for **coordinators and administrators**. Technicians can delete only empty interventions.

## [0.15.1] - 2026-11-10
### Changed
- **Dates always with the year** throughout the portal (e.g. "15 Nov 2026"): project tiles, intervention card, server inventory, search results.
- On the project tiles a tooltip explains "Next" (next scheduled intervention) and "Last" (the most recent one, when none is scheduled).

### Fixed
- In the squares view the customer name covered the project icon and name: it is no longer shown in the squares (it stays in the tooltip, in the rectangles, in the grouping and in the filter).
- Long names on two lines are no longer cut in the squares; in the rectangles the date is no longer truncated.

## [0.15.0] - 2026-11-10
### Added
- **Customers**: each project can have a customer, chosen from a drop-down at creation and in the project card. "+ New customer…" creates one on the fly; names are unique, case-insensitive.
- **Grouping by customer** in the project column ("Customer · A → Z" / "Customer · by date"), with a heading for each customer and "No customer" at the bottom.
- **Filter by customer** in the Filters panel: it applies both to the calendar and to the project column.
- Customer name on the project tiles and in the intervention card. The column search also finds the customer name.
- **Customer management** (Settings → Administration → Customers): rename, and deletion of customers without projects.
- Sample customers in the demo data; `demo remove` removes them, except those assigned to real projects.

## [0.14.0] - 2026-11-10
### Added
- **Resizable project column**: drag the right edge (←/→ arrows from the keyboard, double click for the default width). With a wider column the squares are laid out in several columns.
- **Project view**: as **squares** or as **rectangles**, one per row with the full name. Chosen from the buttons at the top of the column or from Settings → Appearance.
- **Project sorting**: **alphabetical** or **by date**. By date, projects with the nearest next intervention come first, then those with only past interventions (most recent first), finally those without interventions.
- Width, view and sorting are personal preferences, remembered on the server.

## [0.13.0] - 2026-11-10
### Added
- **Settings** (⚙ icon at the top), the place where configuration and customization options are collected:
  - *Appearance*, for each user: preview position and theme;
  - *Administration*, for administrators only: access to Users and Operating systems.
- **Bottom preview**: as an alternative to the right column, the intervention details appear below the calendar at full width. The project column stays unchanged. At the bottom the server table is **complete and editable**: 11 columns, auto-save, adding and removing servers, filters, adjustable columns. Colleagues' changes arrive without touching the cells being edited.
- The height of the bottom preview is adjusted by **dragging the edge** (or with the ↑/↓ arrows) and is remembered.
- **Theme**: light, dark or same as the system.
- **Preferences are personal** and saved on the server (`/api/me/preferences`): they follow the user on any computer.

## [0.12.0] - 2026-11-10
### Added
- **Operating system list**: in the server table the "Operating system" column is a drop-down. Initial versions: Red Hat Enterprise Linux 7.9, 8.10, 9.8 and 10.2.
- **List management** (administrators, user menu → "Operating systems"):
  - new minor or major versions, also of other families (e.g. Rocky Linux), sorted by version number (10.2 comes after 9.8);
  - outdated versions are **deactivated**: they leave the menu, but the servers keep them;
  - only an entry that was never used can be deleted.
- A server's operating system must be an active entry of the list. A previous value not in the list stays visible as "(not in list)" until it is changed.

## [0.11.0] - 2026-11-10
### Added
- **Project card**: edit name, description and status (active, suspended, closed) and see the list of its interventions with status and number of servers. It opens from the pencil on the project tile or from the "Project" button in the intervention card. For projects without interventions a click on the tile is enough.
- **New interventions in an existing project** ("+ New intervention"), with date, type, title, times, notes and technicians.
- **Editing the intervention** ("Edit" button): date, type, title, times and notes. When the date moves, the server rows with the same planned date follow it.
- **Deleting an intervention** created by mistake, only if it contains no servers. An intervention with servers should be marked as "cancelled", so that the server history is kept.
- Colleagues' changes also update the starting month of an intervention that was moved or deleted.

### Fixed
- On phones the top bar went off the screen (since 0.9.0, with the user menu).
- After an upgrade the browser could use old JavaScript files from the cache and show an empty page. Static files now have `Cache-Control: no-cache` and are revalidated on every load.

## [0.10.0] - 2026-11-10
### Changed
- **The project is now called Date Spreader** (previously "Time Dot"). The new name appears in the interface, in the documentation and in the API (`/api/version`).
- Technical names aligned: `DateSpreader` folder, `datespreader` systemd service and system user, `data/datespreader.sqlite3` database, `datespreader` package.
- Anti-CSRF header now `X-Requested-With: datespreader` and session cookie `datespreader_session`. After the upgrade **you must sign in again**.
- Preferences saved in the browser (filters, column widths) start again from the default values.

## [0.9.0] - 2026-11-10
### Added
- **Login**: sign-in screen with email or username and password. All data APIs require authentication.
- Secure sessions: `HttpOnly` cookie; only the token hash in the database. Expiry after 12 hours of inactivity (`SESSION_HOURS`) and in any case after 7 days.
- Temporary lock after 5 failed login attempts.
- **User management** (administrators only): creation, role, username, activation and deactivation, **temporary password** to be changed on first login.
- **Password change** from the user menu, with minimum rules (10 characters, must not contain the username or email). Changing it closes the other open sessions.
- `users list`, `users admin` and `users create-admin` commands to create the first administrator.
- The **audit log records the author** of every change.
- **Portal version** visible at the top and **changelog** viewable from the portal (`/api/version`, `/api/changelog`).

### Security
- CSRF protection: requests that change data must have the `X-Requested-With: timedot` header.
- It is impossible to be left without administrators: the last active administrator cannot be deactivated or demoted.
- A deactivated user is signed out of all sessions immediately.

## [0.8.0] - 2026-11-10
### Added
- **Server inventory** ("Servers" button): all servers, including those no longer present in any intervention, with search, last and next intervention.
- **Intervention history** of each server, with the changes to its data. The intervention can be opened directly from the history.
- Suggestions from the inventory in "Add server": a server already entered is reused with all its data.
- **Sample data flagged** (`is_demo`), with the "ESEMPIO" (sample) label in the interface. New `init --demo`, `demo load` and `demo remove` commands, which never touch real data.

### Removed
- The `seed --reset` command, which deleted all data, including real data.

### Fixed
- **Migrations on SQLite**: when a table was recreated with foreign keys enabled, cascading DELETEs could delete interventions and server rows. Foreign keys are now disabled during migrations and integrity is checked at the end.
- Project initials with dashes in the name (e.g. "Delta - Update" → "DU").

## [0.7.0] - 2026-11-10
### Added
- **"+ New project"** tile with an optional first intervention.
- **Technicians** managed in the database: add, edit and deactivate (no deletion).
- Intervention **participants** chosen from a drop-down, both in the card and when creating the project.

## [0.6.0] - 2026-11-10
### Added
- **Search** for projects and servers (hostname, IP, operating system) from the sidebar.
- Calendar **filters** (status, technician, problems only), remembered in the browser.
- Row filter in the full-screen server table.
- Editable **intervention status**.
- **Automatic updates** with other users' changes, every 10 seconds.
- **Resizable columns** in the tables, with remembered widths.

## [0.5.0] - 2026-11-10
### Added
- **Full-screen server table** with 11 columns editable inline and auto-save.
- Adding and removing servers from an intervention.
- **Concurrency control** (optimistic locking): no silent overwrites between users.
- Change history (`audit_log`).

## [0.4.0] - 2026-11-10
### Added
- Click on a project: the calendar goes to the intervention, with a choice of date if there are several interventions.
- Click on a day: details of the interventions with the server table.

## [0.3.0] - 2026-11-10
### Added
- Home page with a **vertical calendar** (previous, current and next month, centered on today) and project sidebar.
- Phone layout and dark theme.

## [0.2.0] - 2026-11-10
### Added
- Database schema, Alembic migrations and sample data.

## [0.1.0] - 2026-11-10
### Added
- Project structure (FastAPI + SQLite + build-free frontend), local run, systemd service.
