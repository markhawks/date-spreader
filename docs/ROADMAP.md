# Roadmap

[Italiano](ROADMAP.it.md) · Back to the [README](../README.md)

Features **proposed** for the next versions of Date Spreader, roughly in the suggested order. They are ideas, not
commitments: priorities change with the needs of the people using the portal. Done features are listed in the
[changelog](../CHANGELOG.md).

## Suggested next

| Feature | Why | Effort |
|---|---|---|
| **Calendar feed (ICS)** per technician, for Outlook and Google Calendar | Everyone sees their own interventions in their usual calendar, updated automatically | low |
| **Export of the server table** to Excel/CSV and a **project report** (PDF/Excel; the customer Gantt already exists) | Completes the CSV/Excel import: a document for the customer at the end of the work | medium |
| **"Executed on" filled in automatically** when a server's status becomes "Completed" | One click less, and the date of the work is never forgotten | low |

## Planning and daily work

| Feature | Why | Effort |
|---|---|---|
| **Configurable columns** per project or type of intervention (hide "Kernel", add custom fields such as firmware version or ticket number) | Fits any operating system and kind of work, not only Linux servers | medium-high |
| **Recurring interventions** (e.g. monthly patching on the second Tuesday) | No more recreating the same interventions by hand every month | medium |
| **Checklists per type of intervention** (snapshot, customer notice, service checks…) | Repeatable procedures that can be ticked off | medium |
| **Email reminders** the day before an intervention | Nobody misses a maintenance window | medium |
| **Attachments** and **comments** on interventions (rollback plans, logs, discussion with author and date) | Documentation and communication stay with the intervention | medium |

## Integration and access

| Feature | Why | Effort |
|---|---|---|
| **API tokens** for automation (Ansible, ticketing systems, scripts) | E.g. a patching playbook marks its servers "Completed" by itself | medium |
| **Company sign-in**: LDAP/Active Directory, Microsoft or Google SSO | No extra password for the users | high |

## Installation and platforms

| Feature | Why | Effort |
|---|---|---|
| Support for **Red Hat Enterprise Linux 10.2** and **Fedora 45** (today only Fedora 44 is tested) | More systems where the portal can be installed | medium |
| **Guided installer** and **RPM package** (`dnf install datespreader`, also offline) | Simpler installations, also without Internet access | medium-high |
| **Docker image** | Try the portal in a minute on any system | low-medium |
| **Android app** (or an installable web app, PWA), starting from the smartphone recap | Quick check of interventions away from the office, with an icon on the phone | medium |

## English first

| Feature | Why | Effort |
|---|---|---|
| **Demo data in English** | The first impression for people trying the portal from GitHub | low |
| **Install script messages in English** (with Italian as the second language) | Same languages as the portal | low |
| **Code comments in English** | Easier contributions from developers worldwide | medium |
