# Installing Date Spreader on a server

[Versione italiana](INSTALLAZIONE.md) (more detailed) · Back to the [README](../README.en.md)

## Platforms

| System | Status |
|---|---|
| **Fedora Linux 44** (Server Edition, x86_64) | ✅ **Tested**: install script, service, upgrade |
| Red Hat Enterprise Linux 10.2 | 🔜 Planned, not verified yet |
| Fedora Linux 45 | 🔜 Planned, not verified yet |
| Other systemd distributions with Python ≥ 3.11 | ⚠️ Manual install, at your own risk |

**Coming soon:** a guided **installer** and an **RPM package**, together with RHEL 10.2 and Fedora 45 support.
Until then, `deploy/install.sh` is the recommended way. The script refuses untested systems unless you pass `--force`.

## Requirements

- Fedora 44 with systemd and dnf, root access.
- Python 3.11+ (Fedora 44 ships 3.14).
- Internet access during installation (GitHub and PyPI). Offline installation will come with the RPM.
- No external database: data lives in a local SQLite file (local disk only, never a network share).

## Quick install

```bash
sudo dnf install -y git
git clone https://github.com/markhawks/date-spreader.git
cd date-spreader
sudo ./deploy/install.sh --admin-name "Jane Doe" --admin-email jane.doe@example.com
```

The script shows a summary and asks for confirmation. It then asks for the first administrator's password and
prints the portal URL at the end. The code is installed in `/opt/datespreader`.

What it does:
1. installs `git`, `python3` and `curl`;
2. clones the code into `/opt/datespreader`;
3. creates the virtualenv and installs the dependencies;
4. creates the `datespreader` system user, which can write only to `data/`. The code stays owned by root;
5. creates the database and the first administrator;
6. installs and starts the hardened `datespreader` systemd service, which runs migrations at startup;
7. opens the port in firewalld, if active, and checks `/api/health`.

Useful options:
- `--demo`: also load sample data;
- `--temporary-password`: generate a one-time password instead of prompting;
- `--port N`;
- `--local-only`: bind to 127.0.0.1, behind an HTTPS proxy;
- `--dir PATH`;
- `--ref TAG`: install a specific version;
- `--service NAME` and `--user NAME`: run a second instance on the same host;
- `--no-firewall`;
- `--yes`;
- `--force`.

Run `./deploy/install.sh --help` for the full list.

## Upgrade

```bash
sudo /opt/datespreader/deploy/install.sh
```

The script:
1. backs up the database to `data/backups/`;
2. fetches the new version (or `--ref vX.Y.Z`);
3. updates the dependencies;
4. restarts the service, which migrates the schema.

Data, users and `.env` are kept.

## Security notes

- The portal is meant for an internal network.
- Over plain HTTP, passwords travel unencrypted: in production, use `--local-only` with an HTTPS reverse proxy and
  set `COOKIE_SECURE=true`.
- SELinux in enforcing mode has not been verified yet.
- AGPL-3.0: if you offer a modified version over a network, set `SOURCE_URL` in `.env` to your source code.

See the Italian guide for backups, uninstalling and troubleshooting.
