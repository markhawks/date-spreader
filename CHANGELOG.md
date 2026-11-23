# Changelog

All notable changes to the Date Spreader portal.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versions: [Semantic Versioning](https://semver.org/).
Italian version: [CHANGELOG.it.md](CHANGELOG.it.md).

## [Unreleased]
### Added
- **Check «Warning»** (Italian «Attenzione»), in yellow, between OK and FAIL: a check done with something to watch. It fills in «check executed on», does not count as a missing pre-check, is in the summaries («check Warning N»), in «Only with problems» and among the quick choices of «Share».
- **Modular sharing**: in «Share» tick the servers to put in the email («All», «None», a click on statuses of the work and check results, combined; search), for updates to the customer that follow the work; with fewer servers the subject says «(partial update: N servers)» and the summary «Servers shared: N of M». **Notes**: none by default; tick the notes of the intervention and choose those of the servers (none, all, server by server). New tip of the day.
- **Sorting the servers of an intervention** by any column (click on the header, again to reverse), in the full-screen table, the preview below and the compact table on the right. The order is saved on the intervention (`events.server_sort`, migration `b80a7d0e4efb`) and is the same for everybody: colleagues see it within seconds, servers added later fall into place, the email follows it, «Duplicate» keeps it. Texts alphabetical, IPs numeric, OS and kernels natural, dates chronological, statuses in the order of the work, empty values last. API: `server_sort` in `PATCH /api/events/{id}`. New tip of the day.
- **SteamRoller Inventory** column in the server table, after Location: the SteamRoller inventory the machine belongs to, a server field (the same in all its interventions), free text with the values already used proposed in a drop-down list. Also in the server inventory (column, sorting, card, Edit, search), the compact preview, the shared email, the phone recap, the CSV/Excel import (headers «SteamRoller», «Inventory», «Inventario»), export/import and the sync (only when set: the other servers do not look changed). Database: `servers.steamroller_inventory` (migration `1e04dba1541e`). API: `inventories` in `GET /api/options`. New tip of the day.
- **Bigger preview**: with the preview below the calendar, «⇔» in its bar makes it as wide as the window (the project column stops above it; personal preference `detail_full_width`); «⛶» in the same bar shows the preview on the whole screen over calendar and project column (a second click or Esc brings it back). With the preview below, «Full screen · edit» is no longer shown in the intervention's buttons (the table there is already editable). New tip of the day.

### Changed
- The underlined headers of the server table (data of the server) show the hand cursor, like the other sortable headers, instead of the question mark; the tooltip still explains them.
- Check **KO is now shown as FAIL** (the saved value does not change). **In progress** is light blue (it was amber), so yellow is only for warnings: badges, status menus, Gantt, email and Excel.
- **Postponed in violet**: the «Postponed» status of interventions and server rows now has its own violet color (it was amber like «In progress»), well visible among the completed ones: badges, status menus of the server table, Gantt (bar, blocks, legend), shared email and Excel.

## [0.30.0] - 2026-11-17
> See who is working on the portal before a restart, warn everybody with one message, and check for new versions whenever you want.

### Added
- **Users connected now**: button with a bust and the number of connected users next to «Gantt»; a click lists them with their state (active / open in the background), what they are doing and who is **editing** (open form, cell being changed); browser and IP for administrators. **Notice to everybody** from the same list (administrators): a banner at the top of every open page within seconds, for a chosen time or until the restart. Command line: `who`, `wait-idle`; RPM: `datespreader who`, `datespreader restart --when-idle`. API: `/api/presence`, `/api/presence/notice`. New tip of the day.
- **Check for updates now** (administrators): Settings → Administration → «Updates» shows the installed version, the latest on GitHub, the last check and why GitHub cannot be reached, with «Check now» (skips the 6-hour memory; at most every 10 seconds); also user menu → «Check for updates». The «new versions» option moved there from Appearance. `GET /api/updates` also returns `checked_at`, `error`, `full_version`.

### Documentation
- The old name of the project no longer appears in the guides, the READMEs and the changelog.

### Changed
- Top bar on medium screens: «Mon–Fri» shows only its icon below 1700 px and the user menu only the initials below 1500 px, so that the bar stays on one line from 1100 to 1920 px.

## [0.29.0] - 2026-11-17
> Plan the check before a patching without a second intervention, see at a glance which servers are not up to date, and keep the server data right when the work is done.

### Added
- **Pre-check of an intervention** (e.g. the day before a patching), without a second intervention: day (proposed: the working day before), times and technicians of the check in the intervention form. Yellow «CHECK» entry (own color, project color in the left stripe, clipboard symbol) with project, title of the intervention, check progress and «→ day» of the intervention in the calendar and in the Technicians view; the intervention shows the symbol with the day of its check; hovering one highlights both; the preview of the check day shows «Pre-check of this intervention» at the top with a link to the intervention, and the card a link to the check day; own yellow row in the Gantt and in its Excel (hours: «Hours worked on the check», otherwise its times; included in the hours of projects, commesse and total, «of which pre-checks», and in the hours of the check's technicians); technician conflicts include the checks. «Check executed on» filled in when a server's check becomes OK or KO. Warning (icon in the calendar, yellow line in the card) when the check day is over and servers still have the check to do or KO. The check follows the intervention when it is moved or duplicated, and travels with export/import and the sync (only when planned, so the other interventions do not look changed). Database: `events.check_date`, `check_start_time`, `check_end_time`, table `event_check_users`, `event_servers.check_executed_date`, `events.check_worked_hours` (migrations `1f0b9884c6a3`, `1222992c1c85`). API: `PATCH /api/events/{id}` (check fields), `PUT /api/events/{id}/check-participants`; `GET /api/events` also returns `kind: "check"` entries.
- **Work completed on a server**: «Executed on» is filled in with today's date when the status of a row becomes «Completed» and the date is empty (on the server: also via API). If target OS or target kernel differ from the current ones, a green bar above the server table proposes «Update the server's data» (one bar for all the servers just completed, «Update all» / «Leave as it is»). New tip of the day.
- **Outdated operating systems in yellow**: for each family and major an administrator sets the up-to-date minor (Settings → Administration → Operating systems → «Up-to-date versions»; at first RHEL 7.9, 8.10, 9.8, 10.3). Servers with an older minor have their OS highlighted in yellow, with the up-to-date version in the tooltip, in the server inventory (list, card, statistics), in the intervention preview and in the full-screen table. API: `GET`/`PUT /api/os-baselines` (stored in `app_meta`, no migration). New tip of the day about it.


## [0.28.0] - 2026-11-17
> A tip of the day to discover the portal little by little, and administrators now hear about new versions as soon as they are published.

### Added
- **New version notice** (administrators): the server checks the latest release on GitHub (public API, anonymous, cached for 6 hours, silent without Internet); if newer, a green ↑ badge on the version and, at start, a card with the highlights, the link and the upgrade command for this installation (RPM, script or git). «Ignore this version»; off per user in Settings or for the installation with `UPDATE_CHECK=false` (`UPDATE_REPO` for a fork). API: `GET /api/updates` (administrators). Preferences `update_notice`, `update_dismissed`.
- **Tip of the day**: once a day, a small card at the bottom right with a tip about a feature of the portal (49 tips, English and Italian, some for administrators only), rotating so that each user sees all of them; ‹ › to browse, «Show me» to open the screen it talks about, «Don't show tips any more» (back on in Settings → Appearance; also from the user menu). Not shown on the day of the news window. Preferences `tips`, `tips_last_day`, `tips_seen`.


## [0.27.0] - 2026-11-16
> The server inventory becomes a place to work: edit and delete servers, sort the columns, divide them by customer and see which operating system versions you have.

### Added
- **What's new after an update**: the first time each user opens the portal after an update, a window shows the changes of the new version (from this changelog, in the user's language, with its message at the top). "Don't show the news after updates any more" turns it off; back on in Settings → Appearance (preferences `whats_new`, `whats_new_seen`).
- Server inventory: **Customer** menu (all, divided by customer with a heading per customer, no customer, one customer) and a small **Operating systems** box at the bottom right with the count of the OS versions of the listed servers; visible by default, hidden with its ×, the «OS stats» button or in Settings (preference `inventory_os_stats`). API: `customer_id` and `customers` in `GET /api/servers`.
- Server inventory: **sorting** by clicking a column header (hostname, IP, OS, environment, location, kernel, interventions, last, next), again to reverse; IPs in numeric order, versions in natural order, empty values last.
- Server inventory: **Edit** a server (hostname, IP, operating system, environment, location, current kernel) from its card; the change applies to all its interventions, past and future. **Delete** a server that is in no intervention (refused, with the number of interventions, otherwise). API: `PATCH` and `DELETE /api/servers/{id}`.

### Fixed
- Customer menu in the project column: in the dark theme the open list showed the customer names in light text on a white background (unreadable). The options now use the colors of the theme.
- After upgrading the RPM package, the browser could keep using the JavaScript of the previous version (new features missing, e.g. the horizontal zoom and the release date at the top) until the cache was cleared: packages built on the same day give the files the same date, and the Starlette of RHEL 10 then confirmed the old copy. Static files are now validated by ETag only, and the ETag changes with every installed version.

### Documentation
- Installation guides brought up to date with the RPM packages: download and checksum check of the RPM, server without Internet access → RPM, Fedora 44 RPM test described precisely; READMEs and roadmap no longer list the RPM and RHEL 10.2 as coming soon.

## [0.26.0] - 2026-11-16
### Fixed
- Project column: an intervention of **today** already *Completed* or *Cancelled* is no longer highlighted as upcoming, and "Next" moves on to the following one.
- RPM: the firewalld service file was invalid XML (two hyphens in a comment) and stopped firewalld from starting; fixed in 0.25.0-2, and the packaging files are now checked by the tests (`tests/test_packaging.py`, also run during the RPM build).

### Added
- **Calendar width with the middle mouse button**: besides forward/back (height of the days), moving the mouse **right/left** with the middle button pressed makes the calendar wider (from 100% to 250%, with horizontal scrolling; month titles and the zoom controls stay in view) or narrower (down to 60%, centered). Each direction starts after a few pixels, so a vertical gesture does not change the width by mistake. The width is a personal preference (`calendar_zoom_x`); the zoom indicator shows it when it is not 100% ("100% · ↔150%"), and a click on it brings back height and width.
- **"Calendar" button** in the middle of the header of the Gantt and of the server inventory, in the style of "Today" / "Month": it goes back to the calendar (like "Close" and Esc).
- **Calendar: status, commessa and technicians on the interventions.** Every day shows its interventions in the richest form in which they all fit: name → + progress, customer and time → + **status** (colored badge) and **commessa** → + title and full time → + **technicians** (participants and the ones assigned to the servers). With several interventions on the same day, or with the calendar zoomed out (middle mouse button, pinch, − / +), the additional lines disappear; zooming in brings them back. In the week view the status and the commessa have their own line.
- **Sync a customer between two installations** (Settings → Administration → *Sync a customer*, administrators): export the customer on the other installation, choose the file here and you get a **report of the differences** grouped by project (field by field, server rows included) before anything changes. Each item is marked *changed there*, *changed here*, *conflict* (changed on both sides: you choose), *new*, *deleted there*, *deleted here* or *only here*; the changes made on the other side are preselected, deletions happen only if you tick them. *Apply* takes a backup first (`…-pre-sync.sqlite3`) and writes everything in one transaction, recorded in the history. The two installations remember what they last agreed on (also carried in the export file), so the sync works in both directions and recognizes who changed what. API: `POST /api/sync/preview`, `POST /api/sync/apply`. Database: projects and interventions get a `sync_uid`, the same on every installation (existing rows get it from their id and creation time, so copies of the same database match), plus the tables `app_meta`, `sync_baselines`, `sync_peers` (migration `b7a9629f1729`). Export files carry these identities; restoring a backup gives the installation a new sync identity.
- **RPM packages for RHEL 10.3+ (with EPEL) and Fedora 44+**, attached to the GitHub release; guide: [docs/INSTALL-RPM.md](docs/INSTALL-RPM.md). Tested on RHEL 10.3 (install, upgrade, restore of an existing database, sync with another installation): `packaging/rpm/` (spec, systemd units, sysusers, firewalld service, `datespreader` administration command, `build.sh` with mock or rpmbuild). It uses the system Python 3.12 and the python3-* packages of RHEL and EPEL, nothing bundled; code in `/usr/lib/datespreader`, configuration in `/etc/datespreader/datespreader.env`, data and backups in `/var/lib/datespreader`. The test suite passes with the RHEL 10.3 + EPEL versions (Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Alembic 1.13). New setting `DATESPREADER_CONFIG`: path of the configuration file (default: the project's `.env`).
- **Banner** at the top of the READMEs and project images in `docs/images/branding/` (wallpaper, social preview).
- **Screenshots** in the READMEs (`docs/images/screenshots/`): calendar, preview, server table, Gantt, Technicians view, dark theme.
- `scripts/make_screenshots.py`: screenshots for the READMEs (calendar, preview, server table, Gantt, Technicians view, dark theme; English and Italian), taken from a temporary instance with the sample data only. Needs Playwright.
- Sample data: some servers have a Location (DC1, DC2, Sede Gamma).


## [0.25.0] - 2026-11-13
### Changed
- **"By date" sort of the project column is now chronological**, from top to bottom, by the first intervention of each project (before: projects with upcoming interventions first, then those with only past ones), so with the projects expanded the dates go upwards. Interventions on the same day are listed by start time.

### Added
- **Gantt per customer** ("Gantt" button at the top): full-screen view of a customer (the one of the customer filter, or all) over a period, with presets (this month, last + this month, 3 months, whole customer). Summary of interventions and statuses, commesse, machines, hours, man-hours and technicians; one group per commessa (collapsible), its projects as bars from the first to the last intervention and every intervention on its day colored by status, with technicians, hours, man-hours, machines and status next to each row; a click opens the intervention. Below, hours per technician and commessa. Printable in landscape (also as PDF) and downloadable as Excel (Gantt, hours per technician, summary). Hours = hours worked if entered, otherwise end − start; man-hours = hours × technicians. API: `GET /api/reports/gantt` and `/api/reports/gantt.xlsx`.
- **"Hours worked" on the intervention** (optional, in the intervention form): when entered, they replace end − start in the Gantt and its totals. Exported and imported between installations. Database: new column `events.worked_hours` (migration `30f9aa5e1df9`). API: `worked_hours` on interventions.
- **Projects expandable in the project column**: the arrow on a project shows its interventions under it (date, title, status, time, commessa, number of servers; upcoming ones have the date in the project color, past ones are faded); a click on one opens it, and the intervention open in the preview is highlighted. The button next to the sort menu expands or collapses all the visible projects. Works with squares and rectangles, grouping by customer, search and the customer filter; the expanded projects are remembered in the browser. API: `start_time`, `end_time` and `order_code` on the interventions of `GET /api/projects`.
- **Commessa editable from the preview** (on the right or at the bottom): a click on "Commessa …" next to the customer name, or on "+ Commessa", opens a field with the customer's commesse in a drop-down list; Enter or leaving the field saves (an empty field removes it), Esc cancels.
- **Commessa (job number) on every intervention**, stored on the customer: in the intervention form (new, edit, and the first intervention of a new project) the "Commessa" field proposes the customer's commesse in a drop-down list; a new code is saved on the customer and proposed from then on (same code in another case = same commessa). Shown next to the customer name in the intervention card, in the full-screen table header, in the sharing email (subject included), in the week view and calendar tooltips, in the Technicians view and in the smartphone recap. Copied by "Duplicate", exported and imported between installations. A project without a customer cannot have a commessa. Database: new table `customer_orders` and column `events.order_id` (migration `bf5644296b5d`). API: `order_code` on interventions, `GET /api/customers/{id}/orders`.
- **"Location" column** in the server table (where the server is: site, datacenter, room…), after "Environment", also for configuration interventions. It is server data, shared by all its interventions and kept in the server inventory. The locations already used are proposed in a drop-down list, and a new one can be typed. Also shown in the intervention card, the sharing email, the server inventory (searchable) and the smartphone recap, and recognised by the CSV/Excel import (headers location, site, sede, datacenter…). Exported and imported between installations. Database: new column `servers.location` (migration `f5834fb4d654`). API: `locations` in `GET /api/options`.
- **Filter by customer, always at hand**: a customer menu at the top of the project column (with the customer color and ✕ to clear it) and, while a customer is chosen, a colored label "Customer: … ✕" at the top of the calendar and of the Technicians view. A customer can also be picked by clicking its group header or its name in the project column, with a right click on an intervention ("Show only …") or by clicking the customer name in the intervention card. Calendar, Technicians view, project column and the day preview (on the right or at the bottom) then show only that customer; the preview says how many interventions of other customers are hidden, with "Show all customers". The choice is the same as in the Filters panel and is remembered.

## [0.24.0] - 2026-11-11
### Changed
- Top bar on medium screens (below 1360 px): the view buttons show only their icon (the name stays in the tooltip) and the clock only the time below 1500 px, so the bar stays on one line.
- **Configuration interventions have a "Status" column** (Planned, In progress, Completed…) in the full-screen table, the bottom preview, the card, the filters and the sharing email. The progress in the calendar ("1/2") and the summary now count the servers with status "Completed", as for the other types, and no longer those with an "executed on" date: a date filled in as a planned date no longer marks the work as done.

### Added
- **Roadmap** of the proposed features: [docs/ROADMAP.md](docs/ROADMAP.md) (Italian: `docs/ROADMAP.it.md`), linked from the READMEs and the install guide.
- **Recap for smartphones**: on a phone the portal (meant for a desktop) opens a single read-only page for technicians and coordinators away from the office: interventions still to close (last 14 days), today's and the next 7 days', "Mine" or "All", with status, progress, conflicts and technicians; a tap shows the servers and lets you change the intervention status. "Full version" opens the normal portal (remembered in the browser), whose "Recap" button goes back.
- **7 days or Mon–Fri** in the calendar: **"Mon–Fri" button in the top bar**, next to Month, Week and Technicians (also a switch at the bottom right of the calendar and in Settings → Appearance). With Mon–Fri, Saturday and Sunday appear only in the weeks (week and Technicians views) or months (month view) with interventions on a weekend. Personal preference `calendar_days`.
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
- **The project takes the name Date Spreader**. The name appears in the interface, in the documentation and in the API (`/api/version`).
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
- CSRF protection: requests that change data must have the `X-Requested-With` header of the portal.
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
