# Date Spreader – RPM for Red Hat Enterprise Linux 10.3 and later (with EPEL) and for Fedora 44 and later.
# The portal uses the system Python 3 and the python3-* packages of the distribution (RHEL AppStream + EPEL,
# or Fedora): nothing is bundled. Build: packaging/rpm/build.sh --target rhel|fedora (mock or rpmbuild).
#
# Layout:
#   /usr/lib/datespreader            code, migrations, web interface (read-only)
#   /etc/datespreader/datespreader.env  configuration (kept on upgrade)
#   /var/lib/datespreader            database; backups in /var/lib/datespreader/backups
#   /usr/bin/datespreader            administration command (runs as the "datespreader" user)

%{!?ds_version: %global ds_version 0.29.0}
%global appdir %{_prefix}/lib/datespreader

# Tests during the build (needs python3-pytest and python3-httpx): rpmbuild --without check to skip
%bcond check 1

Name:           datespreader
Version:        %{ds_version}
Release:        1%{?dist}
Summary:        Web portal to plan and track technical interventions on servers
License:        AGPL-3.0-only
URL:            https://github.com/markhawks/date-spreader
Source0:        %{name}-%{version}.tar.gz
Source1:        datespreader.sysusers
BuildArch:      noarch

BuildRequires:  python3-devel
BuildRequires:  systemd-rpm-macros
%if %{with check}
BuildRequires:  python3-pytest
BuildRequires:  python3-httpx
BuildRequires:  python3-fastapi >= 0.115
BuildRequires:  python3-starlette >= 0.40
BuildRequires:  python3-pydantic >= 2.9
BuildRequires:  python3-uvicorn >= 0.35
BuildRequires:  python3-sqlalchemy >= 2.0.26
BuildRequires:  python3-alembic >= 1.13
BuildRequires:  python3-openpyxl >= 3.1
%endif

# RHEL: 10.3 and later only (not installable on 10.2 or earlier). Fedora: 44 and later.
%if 0%{?rhel}
Requires:       redhat-release >= 10.3
%endif
%if 0%{?fedora}
Requires:       fedora-release-common >= 44
%endif
Requires:       python3 >= 3.12
Requires:       python3-fastapi >= 0.115
Requires:       python3-starlette >= 0.40
Requires:       python3-pydantic >= 2.9
Requires:       python3-uvicorn >= 0.35
Requires:       python3-sqlalchemy >= 2.0.26
Requires:       python3-alembic >= 1.13
Requires:       python3-openpyxl >= 3.1
Requires:       firewalld-filesystem
Requires:       util-linux
%{?systemd_requires}
%{?sysusers_requires_compat}

%description
Date Spreader is a self-hosted, multi-user web portal to plan and track technical
interventions (migrations, upgrades, patching, configuration, maintenance) on servers
with any operating system: vertical calendar, projects per customer with commesse,
editable server tables, server inventory, Gantt per customer with hours and man-hours,
scheduling conflicts, audit log and verified nightly backups. English and Italian.

%prep
%autosetup -n %{name}-%{version}

%build
# Nothing to build: plain Python and static files.

%install
install -d %{buildroot}%{appdir}
cp -a app migrations static alembic.ini CHANGELOG.md CHANGELOG.it.md %{buildroot}%{appdir}/
find %{buildroot}%{appdir} -name '__pycache__' -prune -exec rm -rf {} +
# How this copy was installed: the interface shows "VERSION-RELEASE" (app/build.py)
printf '{"package": "rpm", "release": "%s"}\n' "%{release}" > %{buildroot}%{appdir}/build-info.json
%py_byte_compile %{python3} %{buildroot}%{appdir}

install -Dpm 0755 packaging/rpm/datespreader-cli.sh %{buildroot}%{_bindir}/datespreader
install -Dpm 0644 packaging/rpm/datespreader.service %{buildroot}%{_unitdir}/datespreader.service
install -Dpm 0644 packaging/rpm/datespreader-backup.service %{buildroot}%{_unitdir}/datespreader-backup.service
install -Dpm 0644 packaging/rpm/datespreader-backup.timer %{buildroot}%{_unitdir}/datespreader-backup.timer
install -Dpm 0644 %{SOURCE1} %{buildroot}%{_sysusersdir}/datespreader.conf
install -Dpm 0640 packaging/rpm/datespreader.env %{buildroot}%{_sysconfdir}/datespreader/datespreader.env
install -Dpm 0644 packaging/rpm/datespreader.firewalld.xml %{buildroot}%{_prefix}/lib/firewalld/services/datespreader.xml
install -d %{buildroot}%{_sharedstatedir}/datespreader/backups

%if %{with check}
%check
%{python3} -m pytest -q -p no:cacheprovider tests
%endif

%pre
%sysusers_create_compat %{SOURCE1}

%post
%systemd_post datespreader.service datespreader-backup.timer

%preun
%systemd_preun datespreader.service datespreader-backup.timer

%postun
# On upgrade the portal is restarted (if it was running): it applies the new migrations itself,
# after an automatic backup. On removal the data in /var/lib/datespreader are kept.
%systemd_postun_with_restart datespreader.service
%systemd_postun datespreader-backup.timer

%files
%license LICENSE
%doc README.md README.it.md CHANGELOG.md CHANGELOG.it.md
%{appdir}
%{_bindir}/datespreader
%{_unitdir}/datespreader.service
%{_unitdir}/datespreader-backup.service
%{_unitdir}/datespreader-backup.timer
%{_sysusersdir}/datespreader.conf
%dir %attr(0750,root,datespreader) %{_sysconfdir}/datespreader
%config(noreplace) %attr(0640,root,datespreader) %{_sysconfdir}/datespreader/datespreader.env
%{_prefix}/lib/firewalld/services/datespreader.xml
%dir %attr(0750,datespreader,datespreader) %{_sharedstatedir}/datespreader
%dir %attr(0750,datespreader,datespreader) %{_sharedstatedir}/datespreader/backups

%changelog
* Tue Nov 17 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.29.0-1
- Date Spreader 0.29.0 (see /usr/share/doc/datespreader/CHANGELOG.md).
- Database migrations 1f0b9884c6a3 and 1222992c1c85 (pre-check), applied at the restart after a backup.

* Tue Nov 17 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.28.0-1
- Date Spreader 0.28.0 (see /usr/share/doc/datespreader/CHANGELOG.md).
- New setting UPDATE_CHECK in datespreader.env (check of new releases on GitHub).

* Mon Nov 16 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.27.0-1
- Date Spreader 0.27.0 (see /usr/share/doc/datespreader/CHANGELOG.md).

* Mon Nov 16 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.26.0-2
- Fix: after the upgrade the browser kept the JavaScript of the previous package (files with
  the same date, 304 by If-Modified-Since in Starlette 0.47). Static files are now validated by
  an ETag that changes with the installed version.

* Mon Nov 16 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.26.0-1
- Date Spreader 0.26.0 (see /usr/share/doc/datespreader/CHANGELOG.md).
- Also built for Fedora 44 and later.
- build-info.json: the interface shows the package release next to the version.

* Mon Nov 16 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.25.0-3
- Test build with the sync of a customer between two installations (not released yet):
  migration b7a9629f1729, applied automatically at the restart after a backup.

* Mon Nov 16 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.25.0-2
- Fix the firewalld service file: an XML comment contained "--", the file was invalid
  and firewalld refused to start. The packaging files are now checked by the tests.

* Sat Nov 14 2026 Mark Hawks <10862036+markhawks@users.noreply.github.com> - 0.25.0-1
- First RPM for RHEL 10.3 + EPEL (system Python, no bundled libraries).
  Changes of the portal: see /usr/share/doc/datespreader/CHANGELOG.md
