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

## Installazione su altri server (deploy/install.sh)
- Testato **solo su Fedora 44**; RHEL 10.2, Fedora 45, installatore e RPM sono pianificati. Tenere aggiornata la
  tabella «Piattaforme» in `docs/INSTALL.md` e `docs/INSTALLAZIONE.md`.
- Per provarlo su questa macchina senza toccare il servizio reale: istanza separata
  `--source <repo> --dir /opt/datespreader-test --port 8011 --service datespreader-test --user dstest`
  (lo script clona l'HEAD *committato*), poi disinstallarla come da guida.

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
- I file statici sono serviti con `Cache-Control: no-cache` (niente Ctrl+F5 dopo gli aggiornamenti).
