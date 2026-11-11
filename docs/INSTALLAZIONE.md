# Installare Date Spreader su un server

[English](INSTALL.md) · Torna al [README](../README.it.md)

Questa guida spiega come installare il portale su un nuovo server Linux, per esempio un server aziendale,
un PC di lavoro o un'installazione presso un cliente, e come aggiornarlo. I progetti si portano da
un'installazione all'altra con **export / import**: vedi il README, sezione [«Export e import tra installazioni»](../README.it.md#export-e-import-tra-installazioni).

## Piattaforme

| Sistema | Stato |
|---|---|
| **Fedora Linux 44** (Server Edition, x86_64) | ✅ **Testato**: script di installazione, servizio, aggiornamento |
| Red Hat Enterprise Linux 10.2 | 🔜 Previsto, non ancora verificato |
| Fedora Linux 45 | 🔜 Previsto, non ancora verificato |
| Altre distribuzioni con systemd e Python ≥ 3.11 | ⚠️ Installazione manuale (vedi sotto), a proprio rischio |

**In arrivo:** un **installatore** guidato e un **pacchetto RPM** (`dnf install datespreader`), insieme al supporto
di RHEL 10.2 e Fedora 45. Fino ad allora lo script `deploy/install.sh` è il modo consigliato. Tutte le funzioni
previste: [ROADMAP.it.md](ROADMAP.it.md).

Lo script rifiuta i sistemi non ancora testati. Con `--force` procede lo stesso, segnalandolo.

## Requisiti

- Fedora 44 con **systemd** e **dnf**; accesso **root** (sudo).
- **Python 3.11 o superiore**: Fedora 44 ha già Python 3.14.
- **Accesso a Internet** durante l'installazione, per scaricare il codice da GitHub e le dipendenze Python da PyPI.
  L'installazione senza rete arriverà con il pacchetto RPM.
- Spazio: circa 150 MB, più il database (pochi MB anche con migliaia di server).
- Non serve un database esterno: i dati stanno in un file SQLite, su **disco locale** (mai su una cartella di rete).

## Installazione rapida (consigliata)

```bash
sudo dnf install -y git
git clone https://github.com/markhawks/date-spreader.git
cd date-spreader
sudo ./deploy/install.sh --admin-name "Mario Rossi" --admin-email mario.rossi@azienda.it
```

Lo script mostra un riepilogo e chiede conferma. Poi chiede la **password del primo amministratore** (almeno
10 caratteri) e alla fine stampa l'indirizzo del portale, per esempio `http://192.168.1.20:8000`.

Il codice viene installato in **`/opt/datespreader`**, indipendente dalla cartella in cui hai scaricato lo script:
quella si può cancellare.

### Cosa fa lo script

1. installa con `dnf` i pacchetti `git`, `python3` e `curl`;
2. scarica il codice da GitHub in `/opt/datespreader`;
3. crea l'ambiente Python (`.venv`) e installa le dipendenze (`requirements.txt`);
4. crea l'utente di sistema **`datespreader`**, senza shell né login:
   - il codice resta di root, quindi il servizio non può modificarlo;
   - il servizio può scrivere **solo** in `data/`, dove stanno database e backup;
   - la configurazione `.env` è leggibile solo da root e dal servizio;
5. crea il database e il **primo amministratore**;
6. installa e avvia il servizio systemd **`datespreader`**:
   - avvio al boot e riavvio automatico in caso di errore;
   - all'avvio applica le migrazioni del database;
   - protezioni systemd: `ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`;
7. apre la porta nel firewall, se `firewalld` è attivo, e verifica che il portale risponda (`/api/health`).

### Opzioni

| Opzione | Effetto |
|---|---|
| `--admin-name "…"`, `--admin-email …` | Primo amministratore (obbligatori alla prima installazione) |
| `--admin-username nome` | Nome utente per l'accesso, in alternativa all'email |
| `--temporary-password` | Genera una password temporanea, da cambiare al primo accesso, invece di chiederla. Utile senza terminale |
| `--demo` | Carica anche i **dati di esempio**, per una prova o una demo. Si tolgono poi con `app.cli demo remove` |
| `--port N` | Porta del portale (predefinita `8000`) |
| `--local-only` | Raggiungibile solo dalla macchina stessa (`127.0.0.1`), per esempio dietro un proxy HTTPS |
| `--dir PERCORSO` | Cartella di installazione (predefinita `/opt/datespreader`). Non sono ammesse `/tmp` e le home |
| `--source URL\|PERCORSO`, `--ref RAMO\|TAG` | Da dove scaricare il codice e quale versione (predefiniti: GitHub, `main`). Es. `--ref v0.24.0` |
| `--service NOME`, `--user NOME` | Nome del servizio systemd e dell'utente di sistema. Servono per installare una seconda istanza sulla stessa macchina |
| `--no-firewall` | Non modifica il firewall |
| `--force` | Procede su un sistema non ancora testato |
| `-y`, `--yes` | Non chiede conferma (installazioni automatiche) |

Esempio di **installazione di prova** con dati di esempio e password temporanea, senza domande:

```bash
sudo ./deploy/install.sh --admin-name "Prova" --admin-email prova@example.com --demo --temporary-password --yes
```

## Dopo l'installazione

- Apri `http://<ip-del-server>:8000` e accedi con l'email (o il nome utente) dell'amministratore.
- **Utenti**: menu Impostazioni → Amministrazione → Utenti. Per far accedere un collega genera una password
  temporanea, che al primo accesso dovrà cambiare.
- **Importare progetti** da un'altra installazione: Impostazioni → Amministrazione → «Importa progetti».
- **Importare server** in un intervento da un file CSV/Excel: «Importa da CSV/Excel…» nella tabella server.
- **Backup del database**: sono automatici (ogni notte), vedi [Backup](#backup).
- **Da smartphone**: lo stesso indirizzo apre un riepilogo in sola lettura (oggi, prossimi 7 giorni, interventi da
  chiudere); il portale vero e proprio è pensato per il computer.
- **Lingua**: ogni utente sceglie inglese o italiano in Impostazioni → Aspetto → Lingua.
- Comandi utili:

```bash
systemctl status datespreader              # stato
journalctl -u datespreader -f              # log in tempo reale
sudo systemctl restart datespreader        # riavvio
cd /opt/datespreader && sudo -u datespreader .venv/bin/python -m app.cli users list   # utenti
```

I comandi `app.cli` vanno sempre lanciati **come utente `datespreader`** e dalla cartella `/opt/datespreader`:
se li lanci come root, i file creati bloccano il servizio.

**Password dimenticata** dall'amministratore:

```bash
cd /opt/datespreader && sudo -u datespreader .venv/bin/python -m app.cli users admin mario.rossi@azienda.it
```

## Aggiornare

Basta rilanciare lo script dalla cartella installata:

```bash
sudo /opt/datespreader/deploy/install.sh
```

Cosa succede:
1. **backup del database** in `data/backups/…-pre-aggiornamento.sqlite3`;
2. scarica la nuova versione da GitHub. Per una versione precisa: `--ref v0.24.0`;
3. aggiorna le dipendenze e riavvia il servizio;
4. il servizio, all'avvio, porta il database allo schema nuovo (migrazioni).

I dati, gli utenti e la configurazione (`.env`) restano come sono.

## Backup

**In automatico.** Il database (`data/datespreader.sqlite3`) viene copiato in `data/backups/`:

- **ogni notte** verso le 02:30, dal timer systemd `datespreader-backup.timer` installato dallo script (se il server
  era spento, il backup parte al successivo avvio);
- **prima di ogni aggiornamento dello schema** (quando una nuova versione modifica il database, all'avvio del servizio);
- **a richiesta**: Impostazioni → Amministrazione → «Backup del database» → «Backup adesso», oppure
  `sudo -u datespreader .venv/bin/python -m app.cli backup`.

Ogni backup è una copia coerente fatta con l'API di backup di SQLite (sicura a portale acceso) e verificata con
`PRAGMA integrity_check`. **Conservazione:** tutto delle ultime 48 ore, poi un backup al giorno per 7 giorni, uno a
settimana per 4 settimane e uno al mese per 12 mesi (`BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY`
nel file `.env`). Gli altri file della cartella (per esempio le copie `…-pre-aggiornamento` fatte dallo script prima
di un aggiornamento, o copie fatte a mano) non vengono mai cancellati in automatico.

**Fuori dalla macchina:** un backup sullo stesso disco non protegge se si rompe il server. Assicurati che il backup
aziendale copi `/opt/datespreader/data/backups/` (o tutta la cartella `data/`) su un'altra macchina.

Gli amministratori possono anche **scaricare** qualsiasi backup da Impostazioni → Amministrazione → «Backup del database».

```bash
cd /opt/datespreader
sudo -u datespreader .venv/bin/python -m app.cli backup --list     # elenco dei backup
systemctl list-timers datespreader-backup.timer                     # prossimo backup notturno
journalctl -u datespreader-backup                                    # log dei backup notturni
```

### Ripristinare un backup

```bash
sudo systemctl stop datespreader
cd /opt/datespreader
sudo -u datespreader .venv/bin/python -m app.cli restore datespreader-backup-20261111-023012-daily.sqlite3
sudo systemctl start datespreader
```

Il file (un nome in `data/backups/` o un percorso) viene prima verificato; il database attuale viene salvato come
backup «pre-restore», così un ripristino si può sempre annullare; poi il backup viene copiato e portato allo schema
attuale (funziona anche un backup di una versione precedente).

## Sicurezza

- Il portale è pensato per una **rete interna**. Non esporlo su Internet senza HTTPS e controlli di accesso adeguati.
- **HTTPS**: in HTTP le password viaggiano in chiaro sulla rete. In produzione:
  1. reinstalla o configura con `--local-only` (`HOST=127.0.0.1` in `.env`);
  2. metti davanti un proxy HTTPS (Apache `mod_proxy` o nginx) verso `http://127.0.0.1:8000`;
  3. imposta `COOKIE_SECURE=true` nel file `.env`;
  4. riavvia il servizio.
- **SELinux**: Fedora lo ha attivo di default (`Enforcing`). Lo script esegue `restorecon` sulla cartella, ma la
  configurazione con SELinux attivo **non è ancora stata verificata**. Se il servizio non parte:
  `journalctl -u datespreader` e `ausearch -m avc -ts recent`.
- **Licenza AGPL-3.0**: se modifichi il portale e lo metti a disposizione di altri, anche solo via rete, imposta
  `SOURCE_URL` nel file `.env` con l'indirizzo del codice della tua versione.

## Disinstallare

```bash
sudo systemctl disable --now datespreader datespreader-backup.timer
sudo rm /etc/systemd/system/datespreader.service /etc/systemd/system/datespreader-backup.{service,timer}
sudo systemctl daemon-reload
sudo firewall-cmd --permanent --remove-port=8000/tcp && sudo firewall-cmd --reload   # se era stata aperta
sudo userdel datespreader
sudo rm -rf /opt/datespreader        # ATTENZIONE: cancella anche database e backup in data/
```

## Installazione manuale

Su altre distribuzioni, o per capire cosa fa lo script, segui gli stessi passi a mano. Vedi il README, sezione
[«Avvio locale»](../README.it.md#avvio-locale-sviluppo-o-prova-manuale), e il file `deploy/datespreader.service`, dove vanno adattati i percorsi e l'utente.

## Problemi frequenti

| Sintomo | Causa probabile e soluzione |
|---|---|
| «sistema … non ancora testato» | Lo script è verificato solo su Fedora 44. Usa `--force` a tuo rischio |
| Il portale non risponde da un altro PC | Firewall: `sudo firewall-cmd --permanent --add-port=8000/tcp && sudo firewall-cmd --reload`. Oppure `HOST=127.0.0.1` in `.env` |
| `Address already in use` nel log | La porta è occupata: reinstalla con `--port 8080`, oppure cambia `PORT` in `.env` e riavvia |
| Il servizio non parte dopo un comando `app.cli` | Il comando è stato lanciato come root: `sudo chown -R datespreader: /opt/datespreader/data` |
| Pagina bianca dopo un aggiornamento | Ricarica la pagina; se persiste, guarda la console del browser e `journalctl -u datespreader` |
