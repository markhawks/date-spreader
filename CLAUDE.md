# Date Spreader — note per Claude Code

Portale per pianificare migrazioni/upgrade di server (FastAPI + SQLite + frontend JS senza build).
Documentazione utente e API: `README.md`. Storia delle modifiche: `CHANGELOG.md` e `git log`.
Specifica iniziale (nome storico "Time Dot"): `DateWeaver.md`.

## Regole di lavoro concordate con l'utente
- **Versioni**: NON creare una nuova versione a ogni modifica. Annotare le novità in `CHANGELOG.md` sotto
  `## [Non rilasciato]`; fare il rilascio (`app/__init__.py`, `pyproject.toml`, intestazione del changelog)
  **solo quando l'utente lo chiede**.
- **Git**: a fine di ogni modifica richiesta, `git add` + commit con messaggio in italiano.
- Rispondere e scrivere UI/documentazione in **italiano** (più `README.en.md` in inglese).

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
- README in italiano (`README.md`) e in inglese (`README.en.md`): aggiornarli entrambi.

## Installazione su altri server (deploy/install.sh)
- Testato **solo su Fedora 44**; RHEL 10.2, Fedora 45, installatore e RPM sono pianificati. Tenere aggiornata la
  tabella «Piattaforme» in `docs/INSTALLAZIONE.md` e `docs/INSTALL.en.md`.
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
