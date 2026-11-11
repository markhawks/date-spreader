#!/usr/bin/env bash
# Date Spreader - script di installazione (e aggiornamento) su un server Linux.
#
# Testato su: Fedora Linux 44 (Server Edition), x86_64.
# Altre distribuzioni (RHEL 10.2, Fedora 45) sono previste ma non ancora verificate:
# lo script le accetta solo con --force. Guida completa: docs/INSTALLAZIONE.md
#
# Uso tipico (come root):
#   sudo ./deploy/install.sh --admin-name "Mario Rossi" --admin-email mario.rossi@azienda.it
#
# Cosa fa:
#   1. installa i pacchetti di sistema (git, python3) con dnf;
#   2. scarica il codice in /opt/datespreader (o usa quello già presente);
#   3. crea l'ambiente Python (.venv) e installa le dipendenze da PyPI;
#   4. crea l'utente di sistema "datespreader", che può scrivere solo in data/;
#   5. crea il database e il primo amministratore;
#   6. installa e avvia il servizio systemd (avvio al boot, riavvio automatico);
#   7. apre la porta nel firewall (se firewalld è attivo) e verifica che il portale risponda.
# Se l'installazione esiste già, la AGGIORNA: backup del database, nuovo codice, dipendenze,
# riavvio (le migrazioni del database partono da sole all'avvio del servizio).
#
# SPDX-License-Identifier: AGPL-3.0-only

set -Eeuo pipefail

# --- valori predefiniti ------------------------------------------------------------------------
REPO_URL="https://github.com/markhawks/date-spreader.git"
REF="main"
INSTALL_DIR="/opt/datespreader"
SERVICE="datespreader"
SVC_USER="datespreader"
PORT="8000"
HOST_ADDR="0.0.0.0"
ADMIN_NAME=""
ADMIN_EMAIL=""
ADMIN_USERNAME=""
TEMP_PASSWORD=0
DEMO=0
OPEN_FIREWALL=1
ASSUME_YES=0
FORCE=0
PORT_SET=0
HOST_SET=0

TESTED_OS="fedora 44"   # "ID VERSION_ID" da /etc/os-release
MIN_PY="3.11"

usage() {
  cat <<'EOF'
Date Spreader - installazione e aggiornamento (testato su Fedora 44)

Uso: sudo ./deploy/install.sh [opzioni]

Amministratore (solo alla prima installazione):
  --admin-name "Nome Cognome"   nome del primo amministratore
  --admin-email EMAIL           email (si usa anche per accedere)
  --admin-username NOME         nome utente per l'accesso (facoltativo)
  --temporary-password          genera una password temporanea invece di chiederla
                                (da cambiare al primo accesso; utile senza terminale)

Installazione:
  --dir PERCORSO                cartella di installazione (predefinita: /opt/datespreader)
  --port N                      porta del portale (predefinita: 8000)
  --local-only                  raggiungibile solo da questa macchina (127.0.0.1)
  --demo                        carica anche i dati di esempio (solo prima installazione)
  --source URL|PERCORSO         repository git da cui scaricare (predefinito: GitHub)
  --ref RAMO|TAG                ramo o tag da installare (predefinito: main)
  --service NOME                nome del servizio systemd (predefinito: datespreader)
  --user NOME                   utente di sistema del servizio (predefinito: datespreader)
  --no-firewall                 non toccare il firewall
  --force                       procedi anche su un sistema non ancora testato
  -y, --yes                     non chiedere conferma
  -h, --help                    questo aiuto
EOF
}

# --- messaggi ------------------------------------------------------------------------------------
if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '    %s!%s %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '\n%sErrore:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
trap 'die "comando non riuscito alla riga $LINENO: $BASH_COMMAND"' ERR

# --- argomenti -----------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-name) ADMIN_NAME="${2:?}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:?}"; shift 2 ;;
    --admin-username) ADMIN_USERNAME="${2:?}"; shift 2 ;;
    --temporary-password) TEMP_PASSWORD=1; shift ;;
    --dir) INSTALL_DIR="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; PORT_SET=1; shift 2 ;;
    --local-only) HOST_ADDR="127.0.0.1"; HOST_SET=1; shift ;;
    --demo) DEMO=1; shift ;;
    --source) REPO_URL="${2:?}"; shift 2 ;;
    --ref) REF="${2:?}"; shift 2 ;;
    --service) SERVICE="${2:?}"; shift 2 ;;
    --user) SVC_USER="${2:?}"; shift 2 ;;
    --no-firewall) OPEN_FIREWALL=0; shift ;;
    --force) FORCE=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "opzione sconosciuta: $1" ;;
  esac
done

[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) || die "porta non valida: $PORT"
[[ "$SERVICE" =~ ^[a-zA-Z0-9_.-]+$ ]] || die "nome del servizio non valido: $SERVICE"
[[ "$SVC_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "nome utente non valido: $SVC_USER"
INSTALL_DIR="${INSTALL_DIR%/}"
[[ "$INSTALL_DIR" == /* ]] || die "--dir deve essere un percorso assoluto"
case "$INSTALL_DIR" in /tmp/*|/var/tmp/*|/home/*|/root/*)
  die "$INSTALL_DIR non va bene: il servizio non può usare /tmp o le home (protezioni systemd). Usa ad es. /opt/datespreader" ;;
esac

# --- controlli iniziali ---------------------------------------------------------------------------
step "Controlli"
[[ $EUID -eq 0 ]] || die "serve root: esegui con sudo."
[[ -r /etc/os-release ]] || die "/etc/os-release mancante: sistema non riconosciuto."
# shellcheck disable=SC1091
. /etc/os-release
THIS_OS="${ID:-?} ${VERSION_ID:-?}"
if [[ "$THIS_OS" == "$TESTED_OS" ]]; then
  ok "Sistema: ${PRETTY_NAME:-$THIS_OS} (testato)"
elif (( FORCE )); then
  warn "Sistema: ${PRETTY_NAME:-$THIS_OS} NON ancora testato (procedo per --force)."
else
  die "sistema ${PRETTY_NAME:-$THIS_OS} non ancora testato (testato: Fedora 44). Riprova con --force a tuo rischio."
fi
command -v systemctl >/dev/null || die "systemd non trovato."
command -v dnf >/dev/null || die "dnf non trovato: per ora sono supportati solo i sistemi Fedora/RHEL."

UPDATE=0
if [[ -d "$INSTALL_DIR/.git" && -f "$INSTALL_DIR/app/__init__.py" ]]; then
  UPDATE=1
  info "Trovata un'installazione in $INSTALL_DIR: verrà AGGIORNATA (backup del database prima)."
elif [[ -e "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
  die "$INSTALL_DIR esiste e non è vuota (e non è un'installazione di Date Spreader)."
fi

DB="$INSTALL_DIR/data/datespreader.sqlite3"
NEW_DB=1
[[ -f "$DB" ]] && NEW_DB=0

if (( NEW_DB )); then
  [[ -n "$ADMIN_NAME" && -n "$ADMIN_EMAIL" ]] || die "prima installazione: indica --admin-name e --admin-email del primo amministratore."
  [[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "email non valida: $ADMIN_EMAIL"
  if (( ! TEMP_PASSWORD )) && [[ ! -r /dev/tty ]]; then
    warn "Nessun terminale per chiedere la password: userò una password temporanea."
    TEMP_PASSWORD=1
  fi
fi

cat <<EOF

    Cartella:   $INSTALL_DIR $( ((UPDATE)) && echo "(aggiornamento)" || echo "(nuova installazione)")
    Sorgente:   $REPO_URL ($REF)
    Servizio:   $SERVICE (utente di sistema: $SVC_USER)
    Indirizzo:  $HOST_ADDR:$PORT
EOF
(( NEW_DB )) && printf '    Admin:      %s <%s>%s\n' "$ADMIN_NAME" "$ADMIN_EMAIL" "$( ((DEMO)) && echo ' + dati di esempio')"
if (( ! ASSUME_YES )) && [[ -r /dev/tty ]]; then
  read -r -p $'\n    Procedo? [s/N] ' answer </dev/tty
  [[ "$answer" =~ ^[sSyY] ]] || die "annullato."
fi

# --- 1. pacchetti ----------------------------------------------------------------------------------
step "1/7 Pacchetti di sistema"
dnf install -y -q git python3 curl >/dev/null
ok "git, python3, curl"

find_python() {
  local c
  for c in python3 python3.14 python3.13 python3.12 python3.11; do
    if command -v "$c" >/dev/null && "$c" -c "import sys; sys.exit(0 if sys.version_info >= (${MIN_PY/./, }) else 1)" 2>/dev/null; then
      command -v "$c"; return 0
    fi
  done
  return 1
}
PY="$(find_python)" || die "serve Python $MIN_PY o superiore (es. dnf install python3.11)."
ok "$("$PY" --version) ($PY)"

# --- 2. codice ------------------------------------------------------------------------------------
step "2/7 Codice"
if (( UPDATE )); then
  if (( ! NEW_DB )); then
    mkdir -p "$INSTALL_DIR/data/backups"
    BK="$INSTALL_DIR/data/backups/datespreader-$(date +%Y%m%d-%H%M%S)-pre-aggiornamento.sqlite3"
    "$PY" - "$DB" "$BK" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close()
PYEOF
    chown "$SVC_USER:$SVC_USER" "$BK" 2>/dev/null || true
    ok "Backup del database: $BK"
  fi
  git -C "$INSTALL_DIR" fetch --quiet --tags origin
  git -C "$INSTALL_DIR" checkout --quiet "$REF"
  if git -C "$INSTALL_DIR" symbolic-ref -q HEAD >/dev/null; then
    git -C "$INSTALL_DIR" merge --quiet --ff-only "origin/$REF" || die "aggiornamento non lineare: ci sono modifiche locali in $INSTALL_DIR."
  fi
  ok "Aggiornato a $(git -C "$INSTALL_DIR" describe --tags --always)"
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --quiet --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
  ok "Scaricato in $INSTALL_DIR ($(git -C "$INSTALL_DIR" describe --tags --always))"
fi
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' "$INSTALL_DIR/app/__init__.py")"
info "Versione di Date Spreader: $VERSION"

# --- 3. ambiente Python ---------------------------------------------------------------------------
step "3/7 Ambiente Python e dipendenze"
[[ -x "$INSTALL_DIR/.venv/bin/python" ]] || "$PY" -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip
"$INSTALL_DIR/.venv/bin/python" -m pip install --quiet --disable-pip-version-check -r "$INSTALL_DIR/requirements.txt"
ok "Dipendenze installate in $INSTALL_DIR/.venv"

# --- 4. utente, permessi e configurazione ----------------------------------------------------------
step "4/7 Utente di sistema, permessi e configurazione"
if ! id "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$INSTALL_DIR" --shell /sbin/nologin "$SVC_USER"
  ok "Creato l'utente di sistema $SVC_USER"
else
  ok "Utente di sistema $SVC_USER già presente"
fi
ENV_FILE="$INSTALL_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$INSTALL_DIR/.env.example" "$ENV_FILE"
  PORT_SET=1; HOST_SET=1
fi
(( PORT_SET )) && sed -i "s/^PORT=.*/PORT=$PORT/" "$ENV_FILE"
(( HOST_SET )) && sed -i "s/^HOST=.*/HOST=$HOST_ADDR/" "$ENV_FILE"
PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE")"
HOST_ADDR="$(sed -n 's/^HOST=//p' "$ENV_FILE")"
# Il codice resta di root (il servizio non può modificarlo); il servizio scrive solo in data/
chown -R root:root "$INSTALL_DIR"
chmod -R go-w "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data/backups"
chown -R "$SVC_USER:$SVC_USER" "$INSTALL_DIR/data"
chmod 750 "$INSTALL_DIR/data"
chown "root:$SVC_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"
ok "Configurazione: $ENV_FILE (HOST=$HOST_ADDR, PORT=$PORT)"
if command -v getenforce >/dev/null && [[ "$(getenforce)" == "Enforcing" ]]; then
  restorecon -R "$INSTALL_DIR" >/dev/null 2>&1 || true
  warn "SELinux attivo (Enforcing): configurazione non ancora testata. Se il servizio non parte: ausearch -m avc -ts recent"
fi

as_svc() { (cd "$INSTALL_DIR" && runuser -u "$SVC_USER" -- "$@"); }

# --- 5. database e amministratore -----------------------------------------------------------------
step "5/7 Database"
if (( NEW_DB )); then
  if (( DEMO )); then as_svc .venv/bin/python -m app.cli init --demo; else as_svc .venv/bin/python -m app.cli init; fi
  ok "Database creato: $DB"
  args=(users create-admin --name "$ADMIN_NAME" --email "$ADMIN_EMAIL")
  [[ -n "$ADMIN_USERNAME" ]] && args+=(--username "$ADMIN_USERNAME")
  if (( TEMP_PASSWORD )); then
    as_svc .venv/bin/python -m app.cli "${args[@]}" --temporary
  else
    info "Scegli la password dell'amministratore (almeno 10 caratteri):"
    as_svc .venv/bin/python -m app.cli "${args[@]}" </dev/tty
  fi
else
  as_svc .venv/bin/python -m app.cli migrate
  ok "Database esistente aggiornato allo schema attuale"
fi

# --- 6. servizio systemd ----------------------------------------------------------------------------
step "6/7 Servizio systemd"
UNIT="/etc/systemd/system/$SERVICE.service"
sed -e "s#/var/www/html/DateSpreader#$INSTALL_DIR#g" \
    -e "s#^User=.*#User=$SVC_USER#" -e "s#^Group=.*#Group=$SVC_USER#" \
    -e "s#^Documentation=.*#Documentation=file://$INSTALL_DIR/docs/INSTALLAZIONE.md#" \
    "$INSTALL_DIR/deploy/datespreader.service" > "$UNIT"
chmod 644 "$UNIT"
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"
ok "Servizio $SERVICE abilitato al boot e avviato ($UNIT)"

# --- 7. firewall e verifica ---------------------------------------------------------------------------
step "7/7 Firewall e verifica"
if (( OPEN_FIREWALL )) && [[ "$HOST_ADDR" != "127.0.0.1" ]] && systemctl is-active --quiet firewalld; then
  firewall-cmd --quiet --permanent --add-port="$PORT/tcp"
  firewall-cmd --quiet --reload
  ok "Porta $PORT/tcp aperta nel firewall"
else
  info "Firewall non modificato (firewalld non attivo, --no-firewall o --local-only)."
fi

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
HEALTH="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null)" || {
  journalctl -u "$SERVICE" -n 30 --no-pager >&2 || true
  die "il portale non risponde sulla porta $PORT. Log: journalctl -u $SERVICE"
}
[[ "$HEALTH" == *'"status":"ok"'* ]] || warn "Stato del portale: $HEALTH"
ok "Il portale risponde: $HEALTH"

ADDR="$HOST_ADDR"
[[ "$ADDR" == "0.0.0.0" ]] && ADDR="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

${G}${B}Date Spreader $VERSION è $( ((UPDATE)) && echo "aggiornato" || echo "installato").${N}

    Indirizzo:   http://${ADDR:-<ip-del-server>}:$PORT
    Servizio:    systemctl status $SERVICE   ·   log: journalctl -u $SERVICE -f
    Cartella:    $INSTALL_DIR  (database e backup in data/)
    Aggiornare:  sudo $INSTALL_DIR/deploy/install.sh
EOF
if (( NEW_DB )); then
  printf '    Accesso:     %s\n' "${ADMIN_USERNAME:-$ADMIN_EMAIL}"
  (( TEMP_PASSWORD )) && printf '                 con la password temporanea qui sopra: al primo accesso ne sceglierai una nuova.\n'
fi
printf '\n    In HTTP le password viaggiano in chiaro: in produzione usa un proxy HTTPS (vedi docs/INSTALLAZIONE.md).\n'
