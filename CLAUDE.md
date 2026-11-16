# Date Spreader — note per Claude Code

Portale per pianificare migrazioni/upgrade di server (FastAPI + SQLite + frontend JS senza build).
Documentazione utente e API: `README.md` (inglese) e `README.it.md`. Storia delle modifiche: `CHANGELOG.md` (inglese), `CHANGELOG.it.md` e `git log`.
Specifica iniziale (nome storico "Time Dot"): `DateWeaver.md`.

## Regole di lavoro concordate con l'utente
- **Versioni**: NON creare una nuova versione a ogni modifica. Annotare le novità sotto
  `## [Unreleased]` in `CHANGELOG.md` e `## [Non rilasciato]` in `CHANGELOG.it.md`; fare il rilascio
  (`app/__init__.py`, `pyproject.toml`, intestazione di entrambi i changelog)
  **solo quando l'utente lo chiede**.
- **Git**: a fine di ogni modifica richiesta, `git add` + commit con messaggio in italiano.
- Rispondere all'utente in **italiano**.
- **Inglese lingua principale del progetto, italiano seconda** (dal 2026-11-11, per la diffusione open source):
  - ogni testo dell'interfaccia passa da `t("<modulo>.<chiave>")` con "en" e "it" in `static/js/i18n/<modulo>.js`
    (formato JSON: vedi `static/js/i18n.js`); i testi di `index.html` con `data-i18n*`;
  - ogni messaggio del server passa da `tr("<area>.<chiave>")` con "en" e "it" in `app/i18n.py`;
  - i valori salvati (stati, tipi, ruoli: "pianificata", "configurazione"…) restano in italiano: si traducono solo le etichette;
  - inglese americano (color, recognized); `tests/test_i18n.py` controlla chiavi e segnaposto.

## Installazione
- Le note della singola installazione (indirizzo, servizio, dati reali) stanno in `CLAUDE.local.md`,
  escluso da git. Se esiste, leggerlo: di solito il database contiene **dati reali dei clienti**.
- Servizio systemd `datespreader` (utente di sistema `datespreader`). All'avvio esegue `app.cli migrate`.
- Database: `data/datespreader.sqlite3`; backup in `data/backups/`. `data/` NON va mai in git.
- Comandi CLI sul DB reale: `sudo -u datespreader .venv/bin/python -m app.cli …`
- Dopo modifiche al codice: `systemctl restart datespreader`.

## Progetto open source (AGPL-3.0-only)
- Repository pubblico: mai dati reali (clienti, hostname, persone, IP interni) nel codice, nei test,
  nella documentazione o nei messaggi di commit. Nei test usare nomi di fantasia ed `example.com`.
- Il database di prova `demo/datespreader-demo.sqlite3` si rigenera con `scripts/make_demo_db.py`
  dopo ogni nuova migrazione (lo verifica un test).
- Documentazione in inglese (`README.md`, `docs/INSTALL.md`, `CHANGELOG.md`) e in italiano (`README.it.md`,
  `docs/INSTALLAZIONE.md`, `CHANGELOG.it.md`): aggiornarle sempre entrambe.

## Funzioni future e uso da smartphone
- Le funzioni proposte stanno in `docs/ROADMAP.md` (inglese) e `docs/ROADMAP.it.md`: quando una viene fatta,
  toglierla da lì e annotarla nei changelog; le idee nuove concordate con l'utente si aggiungono lì.
- Il portale è pensato per il **computer** (verificare a 1100–1920 px). Sul telefono c'è solo il riepilogo in
  sola lettura (`static/js/recap.js`): non investire nella modifica da smartphone. In programma: app Android/PWA.

## Installazione su altri server (deploy/install.sh)
- Lo script è testato **solo su Fedora 44** (RHEL 10.3: solo con l'RPM). Fedora 45 e installatore guidato sono pianificati. Tenere aggiornata la
  tabella «Piattaforme» in `docs/INSTALL.md` e `docs/INSTALLAZIONE.md`.
- Per provarlo su questa macchina senza toccare il servizio reale: istanza separata
  `--source <repo> --dir /opt/datespreader-test --port 8011 --service datespreader-test --user dstest`
  (lo script clona l'HEAD *committato*), poi disinstallarla come da guida.

## Pacchetti RPM per RHEL 10.3+ e Fedora 44+ (packaging/rpm/, pubblicati dalla 0.26.0)
- Scelte dell'utente: **solo RHEL 10.3 e successive** (`Requires: redhat-release >= 10.3`), **Python e librerie
  di sistema** (RHEL AppStream + EPEL), niente librerie incluse; pacchetto `noarch`.
- Build da qui: `packaging/rpm/build.sh` (RHEL: mock `alma+epel-10-x86_64`) e `build.sh --target fedora` (mock
  `fedora-44-x86_64`); sorgenti da `git archive` del commit (committare prima) → `dist/rpm/` (escluso da git).
  Lo spec scrive `build-info.json` (release del pacchetto, mostrata nella barra in alto). A ogni rilascio: RPM allegati
  alla release GitHub (`gh release upload`), `Version`/`Release`/`%changelog` dello spec, `__release_date__` in
  `app/__init__.py` (un test la confronta con i changelog).
- Versioni su RHEL 10.3 + EPEL (2026-11-14): Python 3.12, FastAPI 0.115, Starlette 0.47, Pydantic 2.9,
  SQLAlchemy 2.0.26, Alembic 1.13, uvicorn 0.35, openpyxl 3.1.2. Non usare funzioni più nuove: la build esegue
  i test in quell'ambiente (`%check`). Per provarle a mano: venv Python 3.12 con quelle versioni (`pip --no-deps`).
- Sulla RHEL dell'utente i comandi li esegue l'utente: dargli i passi e chiedere l'output.
- I file di sistema del pacchetto possono rompere la macchina, non solo il portale (2026-11-16: un commento XML
  con `--` nel servizio firewalld ha fermato firewalld sulla RHEL dell'utente). Controllarli con gli strumenti
  veri prima di ogni build: `tests/test_packaging.py` e, per firewalld, `firewall.core.io.service.service_reader`.
- Guida: `docs/INSTALL-RPM.md` e `docs/INSTALLAZIONE-RPM.md`.

## Prima di toccare il database reale
1. Nuova migrazione: `.venv/bin/alembic revision --autogenerate -m "…"`, rileggerla, usare `sa.false()`
   per i default booleani.
2. **Provarla su una copia** del DB reale (backup API di sqlite3 nello scratchpad) e confrontare i conteggi.
3. Backup in `data/backups/` (proprietario `datespreader`), poi riavvio del servizio.
   SQLite ricrea le tabelle nelle migrazioni: `app/migrations.py` disattiva le chiavi esterne apposta.

## Test e verifiche
- `.venv/bin/pytest -q` (tutti verdi prima di ogni riavvio); `.venv/bin/python -m pyflakes app/`.
- Interfaccia: Playwright in un venv dello scratchpad, su un'istanza separata (porta 8001, DB temporaneo
  con `init --demo`), mai sul servizio reale. Attenzione ai selettori `text=…` di Playwright: sono parziali
  e non distinguono maiuscole.
  - Avvio: `DATABASE_PATH=<scratchpad>/x.sqlite3 HOST=127.0.0.1 PORT=8001 .venv/bin/python -m app.main`
    (non `uvicorn app.main:app`). `users create-admin` vuole un terminale: impostare utente e password
    con un breve script Python (`hash_password`) oppure usare l'account del DB demo (`admin` / `demo-password-2026`).
  - Fermarla con `pgrep -u root -f "^.venv/bin/python -m app.main$"`: un `pkill -f app.main` generico
    uccide anche la shell che lo esegue.
  - Browser: `PLAYWRIGHT_BROWSERS_PATH=<scratchpad>/pw-browsers`.
- I file statici sono serviti con `Cache-Control: no-cache` (niente Ctrl+F5 dopo gli aggiornamenti).

## Immagini, schermate e banner
- `docs/images/screenshots/`: schermate dei README (`<nome>-en.png` / `<nome>-it.png`), prodotte **solo** da
  `scripts/make_screenshots.py` (DB demo temporaneo, istanza separata; serve Playwright). Rigenerarle quando
  l'interfaccia cambia molto. Mai schermate del portale reale.
- `docs/images/branding/`: `wallpaper-01.png` (originale dell'utente), `banner.webp` (1600 px, in cima ai README),
  `social-preview.png` (1280×640: l'utente la carica a mano in GitHub → Settings → Social preview).
  Niente loghi di terzi (Red Hat, Fedora…) come badge promozionali.
- Immagini nuove: mostrarle all'utente **prima** di pubblicarle; controllare nomi e affermazioni (es. «RHEL
  compatible» finché RHEL non è testato).

## Rilascio di una versione (quando l'utente lo chiede)
1. Versione in `app/__init__.py` e `pyproject.toml`; intestazioni `## [x.y.z] - data` in entrambi i changelog;
   esempi `--ref vX.Y.Z` in `docs/INSTALL.md` e `docs/INSTALLAZIONE.md`; «Highlights» dei due README.
2. Controllo dati reali su `git diff origin/main..HEAD`, messaggi di commit e DB demo: elenco di termini dal DB
   reale (lettura con `sudo -u datespreader`, stampato su stdout: quell'utente non scrive in /root) cercato con
   `grep -iowFf`, più gli IP privati. Autore dei commit: l'email noreply.
3. `git tag -a vX.Y.Z`, push di `main` e del tag; `gh release create` con note in inglese e sezione italiana
   richiudibile (come le precedenti); se servono, descrizione e argomenti del repository (`gh repo edit`).
