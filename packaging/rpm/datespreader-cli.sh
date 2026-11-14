#!/bin/sh
# Date Spreader administration command (RPM): runs "python3 -m app.cli" as the "datespreader" user,
# with the configuration in /etc/datespreader/datespreader.env.
#   datespreader --help · datespreader users list · datespreader backup --list · datespreader migrate
set -e
APP_DIR=/usr/lib/datespreader
export DATESPREADER_CONFIG=/etc/datespreader/datespreader.env
export PYTHONDONTWRITEBYTECODE=1
cd "$APP_DIR"
if [ "$(id -u)" -eq 0 ]; then
    exec runuser -u datespreader -- /usr/bin/python3 -m app.cli "$@"
elif [ "$(id -un)" = datespreader ]; then
    exec /usr/bin/python3 -m app.cli "$@"
else
    echo "datespreader: run it as root (e.g. sudo datespreader $*)" >&2
    exit 1
fi
