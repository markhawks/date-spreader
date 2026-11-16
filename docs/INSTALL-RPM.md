# Installing the RPM package (RHEL 10.3+ and Fedora 44+)

Italian version: [INSTALLAZIONE-RPM.md](INSTALLAZIONE-RPM.md). Other ways to install: [INSTALL.md](INSTALL.md).

The package uses the **Python and the libraries of the system** (nothing bundled):
- **Red Hat Enterprise Linux 10.3 or later**, with the **EPEL** repository (some python3-* libraries come from there);
- **Fedora 44 or later**: everything comes from the Fedora repositories.

Download the package of your system from the [release page](https://github.com/markhawks/date-spreader/releases/latest)
on GitHub: `datespreader-VERSION-RELEASE.el10.noarch.rpm` (RHEL) or `…fc44.noarch.rpm` (Fedora), together with
`SHA256SUMS`, and check it. For example, version 0.27.0 for RHEL:
```
V=0.27.0; B=https://github.com/markhawks/date-spreader/releases/download/v$V
curl -LO $B/datespreader-$V-1.el10.noarch.rpm -LO $B/SHA256SUMS
sha256sum -c SHA256SUMS --ignore-missing          # must print "OK"
```

## Install

RHEL only, once: enable EPEL (and CodeReady Builder, as the EPEL documentation recommends).
```
sudo subscription-manager repos --enable codeready-builder-for-rhel-10-$(arch)-rpms
sudo dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-10.noarch.rpm
```

Then, on both systems:
```
sudo dnf install ./datespreader-*.noarch.rpm
sudo datespreader init                     # creates the database
sudo datespreader users create-admin       # first administrator (asks for the password)
sudo systemctl enable --now datespreader datespreader-backup.timer
```
The portal answers on `http://127.0.0.1:8000`. To reach it from the network:
1. in `/etc/datespreader/datespreader.env` set `HOST=0.0.0.0`, then `sudo systemctl restart datespreader`;
2. open the port: `sudo firewall-cmd --permanent --add-service=datespreader && sudo firewall-cmd --reload`.

## Where things are

| Path | Content |
|---|---|
| `/usr/lib/datespreader` | code and web interface (replaced by every update) |
| `/etc/datespreader/datespreader.env` | configuration (kept by updates) |
| `/var/lib/datespreader` | database; backups in `/var/lib/datespreader/backups` |
| `/usr/bin/datespreader` | administration command (runs as the `datespreader` user) |

`datespreader --help` lists the commands: `init`, `migrate`, `backup` (`--list` shows the backups), `restore`, `users list | admin | create-admin`.

## Update

```
sudo dnf upgrade ./datespreader-NEW.noarch.rpm
```
The service is restarted: before applying the database changes of the new version it takes a backup by itself.
In the portal, the version and the release date are next to the name, at the top left (e.g. `v0.27.0-1.el10`:
the number after the dash is the release of the package).

## Move an existing installation to the package

1. On the old server: `datespreader backup` (or the Backups screen), then copy the `.sqlite3` file to the new one.
2. On the new server, after installing the package:
   ```
   sudo install -o datespreader -g datespreader -m 0640 FILE.sqlite3 /var/lib/datespreader/backups/
   sudo systemctl stop datespreader
   sudo datespreader restore /var/lib/datespreader/backups/FILE.sqlite3 --yes
   sudo systemctl start datespreader
   ```
   Users, passwords and data come with the database. The restored installation gets a new identity for the sync
   between installations.

## Remove

`sudo dnf remove datespreader`. The data in `/var/lib/datespreader` and the configuration are kept: delete them
by hand if you no longer need them.
