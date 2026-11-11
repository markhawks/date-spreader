# Installing Date Spreader on a server

[Italiano](INSTALLAZIONE.md) · Back to the [README](../README.md)

This guide explains how to install the portal on a new Linux server, for example a company server, a work PC or an
installation at a customer's site, and how to upgrade it. Projects are moved from one installation to another with
**export / import**: see the README, section
["Export and import between installations"](../README.md#export-and-import-between-installations).

## Platforms

| System | Status |
|---|---|
| **Fedora Linux 44** (Server Edition, x86_64) | ✅ **Tested**: install script, service, upgrade |
| Red Hat Enterprise Linux 10.2 | 🔜 Planned, not verified yet |
| Fedora Linux 45 | 🔜 Planned, not verified yet |
| Other distributions with systemd and Python ≥ 3.11 | ⚠️ Manual installation (see below), at your own risk |

**Coming soon:** a guided **installer** and an **RPM package** (`dnf install datespreader`), together with support
for RHEL 10.2 and Fedora 45. Until then, the `deploy/install.sh` script is the recommended way.

The script refuses systems that have not been tested yet. With `--force` it goes ahead anyway, with a warning.

## Requirements

- Fedora 44 with **systemd** and **dnf**; **root** access (sudo).
- **Python 3.11 or later**: Fedora 44 already ships Python 3.14.
- **Internet access** during installation, to download the code from GitHub and the Python dependencies from PyPI.
  Offline installation will come with the RPM package.
- Disk space: about 150 MB, plus the database (a few MB even with thousands of servers).
- No external database is needed: data lives in a SQLite file, on a **local disk** (never on a network share).

## Quick install (recommended)

```bash
sudo dnf install -y git
git clone https://github.com/markhawks/date-spreader.git
cd date-spreader
sudo ./deploy/install.sh --admin-name "Jane Doe" --admin-email jane.doe@example.com
```

The script shows a summary and asks for confirmation. It then asks for the **first administrator's password** (at
least 10 characters) and at the end prints the portal address, for example `http://192.0.2.20:8000`.

The code is installed in **`/opt/datespreader`**, independently of the folder where you downloaded the script:
that folder can be deleted.

### What the script does

1. installs the `git`, `python3` and `curl` packages with `dnf`;
2. downloads the code from GitHub into `/opt/datespreader`;
3. creates the Python environment (`.venv`) and installs the dependencies (`requirements.txt`);
4. creates the **`datespreader`** system user, without shell or login:
   - the code stays owned by root, so the service cannot modify it;
   - the service can write **only** to `data/`, where the database and backups live;
   - the `.env` configuration is readable only by root and by the service;
5. creates the database and the **first administrator**;
6. installs and starts the **`datespreader`** systemd service:
   - started at boot and restarted automatically on failure;
   - applies the database migrations at startup;
   - systemd hardening: `ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`;
7. opens the port in the firewall, if `firewalld` is active, and checks that the portal answers (`/api/health`).

### Options

| Option | Effect |
|---|---|
| `--admin-name "…"`, `--admin-email …` | First administrator (required on the first installation) |
| `--admin-username name` | Username for login, as an alternative to the email |
| `--temporary-password` | Generates a temporary password, to be changed on first login, instead of asking for one. Useful without a terminal |
| `--demo` | Also loads the **sample data**, for a trial or a demo. Remove it later with `app.cli demo remove` |
| `--port N` | Portal port (default `8000`) |
| `--local-only` | Reachable only from the machine itself (`127.0.0.1`), for example behind an HTTPS proxy |
| `--dir PATH` | Installation folder (default `/opt/datespreader`). `/tmp` and home directories are not allowed |
| `--source URL\|PATH`, `--ref BRANCH\|TAG` | Where to download the code from and which version (defaults: GitHub, `main`). E.g. `--ref v0.22.0` |
| `--service NAME`, `--user NAME` | Name of the systemd service and of the system user. Used to install a second instance on the same machine |
| `--no-firewall` | Does not change the firewall |
| `--force` | Goes ahead on a system that has not been tested yet |
| `-y`, `--yes` | Does not ask for confirmation (unattended installations) |

Run `./deploy/install.sh --help` for the full list.

Example of a **trial installation** with sample data and a temporary password, without questions:

```bash
sudo ./deploy/install.sh --admin-name "Test" --admin-email test@example.com --demo --temporary-password --yes
```

## After the installation

- Open `http://<server-ip>:8000` and sign in with the administrator's email (or username).
- **Users**: Settings → Administration → Users. To let a colleague in, generate a temporary password, which they
  will have to change on first login.
- **Language**: each user chooses English or Italian in Settings → Appearance → Language (by default it follows the
  browser).
- **Importing projects** from another installation: Settings → Administration → "Import projects".
- Useful commands:

```bash
systemctl status datespreader              # status
journalctl -u datespreader -f              # live log
sudo systemctl restart datespreader        # restart
cd /opt/datespreader && sudo -u datespreader .venv/bin/python -m app.cli users list   # users
```

`app.cli` commands must always be run **as the `datespreader` user** and from the `/opt/datespreader` folder: if you
run them as root, the files they create block the service.

**Forgotten password** of the administrator:

```bash
cd /opt/datespreader && sudo -u datespreader .venv/bin/python -m app.cli users admin jane.doe@example.com
```

## Upgrading

Just run the script again from the installed folder:

```bash
sudo /opt/datespreader/deploy/install.sh
```

What happens:
1. **database backup** in `data/backups/…-pre-aggiornamento.sqlite3`;
2. the new version is downloaded from GitHub. For a specific version: `--ref v0.22.0`;
3. the dependencies are updated and the service is restarted;
4. at startup, the service brings the database to the new schema (migrations).

Data, users and configuration (`.env`) stay as they are.

## Backup

**Automatic.** The database (`data/datespreader.sqlite3`) is backed up to `data/backups/`:

- **every night** at about 02:30, by the `datespreader-backup.timer` systemd timer installed by the script (if the
  server was off, the backup runs at the next boot);
- **before every schema upgrade** (when a new version changes the database, at service start);
- **on demand**: Settings → Administration → "Database backups" → "Back up now", or
  `sudo -u datespreader .venv/bin/python -m app.cli backup`.

Every backup is a consistent copy made with SQLite's backup API (safe while the portal is running) and checked
with `PRAGMA integrity_check`. **Rotation:** everything from the last 48 hours, then one backup per day for 7 days,
one per week for 4 weeks and one per month for 12 months (`BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`,
`BACKUP_KEEP_MONTHLY` in `.env`). Other files in the folder (e.g. the `…-pre-aggiornamento` copies made by the
install script before an update, or copies made by hand) are never deleted automatically.

**Off the machine:** a backup on the same disk does not protect against a broken server. Make sure the company
backup system copies `/opt/datespreader/data/backups/` (or the whole `data/` folder) to another machine.

Administrators can also **download** any backup from Settings → Administration → "Database backups".

```bash
cd /opt/datespreader
sudo -u datespreader .venv/bin/python -m app.cli backup --list     # list the backups
systemctl list-timers datespreader-backup.timer                     # next nightly run
journalctl -u datespreader-backup                                    # log of the nightly backups
```

### Restoring a backup

```bash
sudo systemctl stop datespreader
cd /opt/datespreader
sudo -u datespreader .venv/bin/python -m app.cli restore datespreader-backup-20261111-023012-daily.sqlite3
sudo systemctl start datespreader
```

The file (a name in `data/backups/` or a path) is checked first; the current database is saved as a
"pre-restore" backup, so a restore can always be undone; then the backup is copied in and brought to the current
schema (a backup from an older version works too).

## Security

- The portal is meant for an **internal network**. Do not expose it to the Internet without HTTPS and proper access
  controls.
- **HTTPS**: over plain HTTP, passwords travel unencrypted on the network. In production:
  1. reinstall or configure with `--local-only` (`HOST=127.0.0.1` in `.env`);
  2. put an HTTPS proxy in front (Apache `mod_proxy` or nginx) forwarding to `http://127.0.0.1:8000`;
  3. set `COOKIE_SECURE=true` in the `.env` file;
  4. restart the service.
- **SELinux**: Fedora has it enabled by default (`Enforcing`). The script runs `restorecon` on the folder, but the
  configuration with SELinux enforcing **has not been verified yet**. If the service does not start:
  `journalctl -u datespreader` and `ausearch -m avc -ts recent`.
- **AGPL-3.0 license**: if you modify the portal and make it available to others, even only over a network, set
  `SOURCE_URL` in the `.env` file to the location of your version's source code.

## Uninstalling

```bash
sudo systemctl disable --now datespreader datespreader-backup.timer
sudo rm /etc/systemd/system/datespreader.service /etc/systemd/system/datespreader-backup.{service,timer}
sudo systemctl daemon-reload
sudo firewall-cmd --permanent --remove-port=8000/tcp && sudo firewall-cmd --reload   # if it had been opened
sudo userdel datespreader
sudo rm -rf /opt/datespreader        # WARNING: also deletes the database and backups in data/
```

## Manual installation

On other distributions, or to understand what the script does, follow the same steps by hand. See the README,
section ["Local run"](../README.md#local-run-development-or-quick-trial), and the `deploy/datespreader.service` file,
where the paths and the user must be adapted.

## Troubleshooting

| Symptom | Likely cause and solution |
|---|---|
| «sistema … non ancora testato» (system not tested yet; the script's messages are in Italian) | The script is verified only on Fedora 44. Use `--force` at your own risk |
| The portal does not answer from another PC | Firewall: `sudo firewall-cmd --permanent --add-port=8000/tcp && sudo firewall-cmd --reload`. Or `HOST=127.0.0.1` in `.env` |
| `Address already in use` in the log | The port is taken: reinstall with `--port 8080`, or change `PORT` in `.env` and restart |
| The service does not start after an `app.cli` command | The command was run as root: `sudo chown -R datespreader: /opt/datespreader/data` |
| Blank page after an upgrade | Reload the page; if it persists, check the browser console and `journalctl -u datespreader` |
