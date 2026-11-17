#!/bin/sh
# Date Spreader administration command (RPM): runs "python3 -m app.cli" as the "datespreader" user,
# with the configuration in /etc/datespreader/datespreader.env.
#   datespreader --help · datespreader users list · datespreader backup --list · datespreader migrate
#   datespreader who · datespreader restart --when-idle [--timeout MIN]
set -e
APP_DIR=/usr/lib/datespreader
export DATESPREADER_CONFIG=/etc/datespreader/datespreader.env
export PYTHONDONTWRITEBYTECODE=1
cd "$APP_DIR"
# "datespreader restart --when-idle [--timeout MIN]": waits until nobody is editing, then restarts the portal
if [ "${1:-}" = restart ]; then
    [ "$(id -u)" -eq 0 ] || { echo "datespreader: run it as root (sudo datespreader restart)" >&2; exit 1; }
    shift
    if [ "${1:-}" = --when-idle ]; then
        shift
        runuser -u datespreader -- /usr/bin/python3 -m app.cli wait-idle "$@" || exit $?
    fi
    exec systemctl restart datespreader
fi
if [ "$(id -u)" -eq 0 ]; then
    exec runuser -u datespreader -- /usr/bin/python3 -m app.cli "$@"
elif [ "$(id -un)" = datespreader ]; then
    exec /usr/bin/python3 -m app.cli "$@"
else
    echo "datespreader: run it as root (e.g. sudo datespreader $*)" >&2
    exit 1
fi
