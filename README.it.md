# Date Spreader

[English](README.md) · Licenza: [GNU AGPL-3.0-only](LICENSE)

Portale web multiutente, da installare sui propri server, per pianificare e seguire **interventi tecnici**:
migrazioni, upgrade, patching, configurazioni o qualsiasi altra attività di manutenzione programmata, su sistemi con
**qualsiasi sistema operativo** (l'elenco dei sistemi operativi e delle versioni lo decidi tu). Al posto del foglio
condiviso che i team usano spesso per questo lavoro: calendario verticale, progetti per cliente, tabella modificabile
dei server coinvolti in ogni intervento, anagrafica server con storico, più utenti in contemporanea con controllo dei
conflitti e cronologia delle modifiche.

È nato per i team che gestiscono infrastrutture IT, ma nulla vieta di usarlo ovunque si debbano programmare lavori
tecnici su un elenco di macchine o apparati.
L'interfaccia è disponibile in **inglese** e **italiano**: ogni utente sceglie la sua lingua (vedi «Impostazioni»).
Specifica iniziale: [DateWeaver.md](DateWeaver.md) (documento originale, scritto quando il progetto si chiamava ancora "Time Dot").

## Installazione su un server
**Guida completa: [docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md).** In breve, su **Fedora 44** (l'unico sistema
testato finora):

```bash
git clone https://github.com/markhawks/date-spreader.git && cd date-spreader
sudo ./deploy/install.sh --admin-name "Mario Rossi" --admin-email mario.rossi@azienda.it
```

Lo script installa il portale in `/opt/datespreader` con un servizio systemd e crea il primo amministratore.
Rilanciato, aggiorna l'installazione, con un backup del database prima. **In arrivo**: un installatore guidato,
un pacchetto RPM e il supporto di Red Hat Enterprise Linux 10.2 e Fedora 45.

## Prova veloce con il database demo
Il repository contiene `demo/datespreader-demo.sqlite3`, con **soli dati di esempio** (clienti, progetti,
server e tecnici di fantasia) e un amministratore demo:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp demo/datespreader-demo.sqlite3 data/datespreader.sqlite3
.venv/bin/python -m app.main
```

Apri <http://127.0.0.1:8000> e accedi con **`admin`** / **`demo-password-2026`**: al primo accesso il portale
chiede di scegliere una nuova password. Le date di esempio sono quelle del giorno in cui il database è stato
generato; per averle intorno a oggi: `.venv/bin/python scripts/make_demo_db.py` (oppure `init --demo`, sotto).

## Requisiti
- Python 3.11 o superiore (sviluppato con 3.14)
- Nessun altro servizio: il database è un file SQLite locale.

## Avvio locale (sviluppo o prova manuale)
Per installare il portale su un server usa lo script: vedi «Installazione su un server» qui sopra e
[docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md). I passi seguenti servono per sviluppare o per una prova al volo.

```bash
# 1. Ambiente virtuale e dipendenze
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# 2. (Facoltativo) configurazione
cp .env.example .env

# 3. Crea il database (con --demo carica anche i dati di esempio)
.venv/bin/python -m app.cli init --demo

# 4. Crea il primo amministratore (la password viene chiesta in modo nascosto)
.venv/bin/python -m app.cli users create-admin --name "Mario Rossi" --email mario.rossi@azienda.it

# 5. Avvio
.venv/bin/python -m app.main
```

Apri <http://127.0.0.1:8000>. Altri indirizzi utili:
- <http://127.0.0.1:8000/api/health>: stato dell'app, del database e dello schema
- <http://127.0.0.1:8000/docs>: documentazione interattiva delle API

Per ricaricare il server automaticamente mentre si sviluppa, metti `RELOAD=true` nel `.env`.

### Accesso dalla LAN
Il portale è pensato per girare su una **LAN privata**. Con `HOST=0.0.0.0` nel `.env` è raggiungibile da
tutta la rete all'indirizzo `http://<ip-del-server>:8000`.
Con `HOST=127.0.0.1` torna raggiungibile solo dalla macchina stessa.

Per vedere e modificare i dati bisogna accedere: vedi "Accesso e utenti".

### Servizio systemd
In produzione il portale gira come servizio **`datespreader`**. Lo script `deploy/install.sh` lo configura da solo;
i dettagli che seguono servono per gestirlo o per un'installazione a mano.
- è abilitato al boot e si riavvia da solo se si blocca;
- usa l'utente di sistema `datespreader`, senza shell, che può scrivere **solo** in `data/`;
- prima di partire applica le eventuali migrazioni nuove.

Il file di unità è in `deploy/datespreader.service` (percorsi da adattare alla propria cartella), da copiare in `/etc/systemd/system/`.

```bash
systemctl status datespreader          # stato
systemctl restart datespreader         # riavvio (es. dopo aver aggiornato il codice)
journalctl -u datespreader -f          # log in tempo reale
```

> **Importante:** il database appartiene all'utente `datespreader`. I comandi del database vanno
> lanciati come quell'utente, altrimenti i file creati da root bloccano il servizio:
>
> ```bash
> sudo -u datespreader .venv/bin/python -m app.cli demo remove
> ```

Se si modifica `deploy/datespreader.service`:

```bash
sudo cp deploy/datespreader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart datespreader
```

**Per sviluppare** con avvio manuale (`python -m app.main`) bisogna prima fermare il servizio, perché la porta 8000 è occupata: `systemctl stop datespreader`.

## Accesso e utenti
- Ogni pagina richiede il **login** con email o nome utente e password. Sono pubblici solo `/api/health`, `/api/version` e `/api/changelog`.
- **Utenti e tecnici sono la stessa cosa**: chi ha una password può accedere; gli altri restano nomi da assegnare agli interventi.
- **Ruoli**:
  - *amministratore*: gestisce gli utenti, dal pulsante **Utenti** in alto;
  - *coordinatore* e *tecnico*: lavorano su progetti, interventi e server.
- **Dare l'accesso a qualcuno** (amministratore): Utenti → "Abilita accesso" (o "Nuova password") → conferma. Viene mostrata **una sola volta** una password temporanea da comunicare all'interessato, che al primo accesso è obbligato a sceglierne una sua.
- **Password**: almeno 10 caratteri, non deve contenere il nome utente o l'email. Nel database solo l'hash `scrypt`. Si cambia dal menu utente in alto a destra; il cambio chiude le sessioni aperte su altri dispositivi.
- **Sessione**: cookie `HttpOnly` / `SameSite=Lax`. Scade dopo `SESSION_HOURS` (12) di inattività e comunque dopo 7 giorni. Se scade mentre si lavora, ricompare il login.
- **Protezioni**:
  - dopo 5 tentativi sbagliati, accesso bloccato per 5 minuti (per IP e nome);
  - intestazione anti-CSRF obbligatoria sulle modifiche;
  - un utente disattivato esce subito;
  - l'ultimo amministratore non può essere disattivato né declassato.
- **Cronologia**: ogni modifica registra l'utente che l'ha fatta.
- **HTTPS**: in HTTP le password viaggiano in chiaro sulla rete. Dietro un proxy HTTPS (es. Apache o nginx) impostare `COOKIE_SECURE=true`. Il portale è pensato per una rete interna: non esporlo su Internet senza HTTPS e controlli adeguati.

### Comandi per gli account
| Comando | Effetto |
|---|---|
| `python -m app.cli users list` | Elenco utenti con ruolo e stato dell'accesso |
| `python -m app.cli users admin LOGIN` | Rende amministratore un utente esistente (email o nome utente) e gli fa impostare la password |
| `python -m app.cli users admin LOGIN --temporary` | Come sopra, con password temporanea generata (da cambiare al primo accesso) |
| `python -m app.cli users create-admin --name … --email … [--username …] [--temporary]` | Crea un nuovo amministratore |

Sull'installazione con systemd vanno lanciati come `sudo -u datespreader .venv/bin/python -m app.cli …`. Servono anche per **recuperare l'accesso** se l'amministratore dimentica la password.

## Versione e changelog
- La versione è in `app/__init__.py` (`__version__`) e in `pyproject.toml`; segue il [Semantic Versioning](https://semver.org/lang/it/).
- Le novità sono in [`CHANGELOG.md`](CHANGELOG.md) (inglese) e [`CHANGELOG.it.md`](CHANGELOG.it.md) (italiano), nel formato "Keep a Changelog"; le intestazioni delle versioni sono identiche nei due file.
- Nel portale la versione è accanto al nome, in alto a sinistra: cliccandola si apre il changelog (anche da menu utente → "Novità").
- Le novità si annotano in entrambi i changelog, sotto «Unreleased» / «Non rilasciato»; la versione cambia solo al rilascio.
- **Per un rilascio**:
  1. aggiornare `__version__` (`app/__init__.py`), `pyproject.toml` e l'intestazione della versione in `CHANGELOG.md` (inglese) **e** in `CHANGELOG.it.md` (italiano). Un test verifica che versione, `pyproject.toml` e `CHANGELOG.md` coincidano;
  2. aggiornare, se serve, `README.md` (inglese) e `README.it.md` (italiano);
  3. rigenerare il database di prova con `scripts/make_demo_db.py`;
  4. eseguire i test;
  5. commit, tag `vX.Y.Z` e push su GitHub, insieme al tag;
  6. creare la release su GitHub con le note del changelog;
  7. riavviare il servizio.

  Chi ha installato con lo script si aggiorna con `sudo /opt/datespreader/deploy/install.sh`, oppure con `--ref vX.Y.Z` per una versione precisa.

## Interfaccia (home)
- **Calendario verticale**: un blocco per mese, dall'alto in basso, settimana da lunedì. All'apertura mostra mese precedente, corrente e successivo, con il **mese corrente centrato** nella vista. Scorrendo vicino al bordo superiore o inferiore si caricano altri mesi senza che la vista salti. Il pulsante blu **Oggi**, al centro della barra in alto, riporta al mese (o alla settimana) di oggi.
- **Data e ora** nella barra in alto, accanto al nome del portale. Cosa mostrare (data e ora, con i secondi, solo data, solo ora, niente) si sceglie in Impostazioni → Aspetto.
- **Vista mensile o settimanale**: i pulsanti **Mese** e **Settimana**, accanto a «Oggi» e con la stessa grafica (blu pieno quello attivo), cambia vista restando sullo stesso giorno (la scelta è una preferenza personale). Nella vista settimanale ogni settimana è un blocco con titolo («Settimana 46 · 9 – 15 novembre 2026») e sette colonne alte quanto serve: **si vedono tutti gli interventi, mai «+N»**, ognuno con nome, avanzamento, cliente, titolo e orario, tipo e tecnici. Scorrendo si caricano altre settimane; lo zoom cambia l'altezza minima dei giorni. Se il calendario è stretto (telefono, o anteprima aperta a destra) i giorni stanno uno sotto l'altro.
- **Zoom del calendario** (come in Blender): **tasto centrale del mouse premuto e mouse avanti/indietro**; avanti ingrandisce, indietro rimpicciolisce, dal 50% al 250%. Il giorno sotto il cursore resta fermo. In alternativa il **pizzico** sul touchpad o il controllo **− % +** in basso a destra nel calendario; un clic sulla percentuale torna al 100%. Il livello è una preferenza personale. Ctrl + rotellina del mouse resta lo zoom della pagina del browser.
  - Rimpicciolendo si vedono più mesi e gli interventi diventano barrette colorate.
  - Ingrandendo ogni giorno mostra più interventi; dove c'è spazio compaiono anche titolo e orario completo.
  - Ogni giorno sceglie da solo come disegnare i suoi interventi (dettagliato, due righe, solo il nome) senza mai tagliare il testo; quelli che non entrano diventano «+N».
- **Giorni con interventi**: sono evidenziati e mostrano, nel colore del progetto, nome, **avanzamento** («2/4»: server completati sul totale, con una barra in fondo che si riempie; verde con ✓ a lavoro finito), cliente e ora (quanti ne stanno nella cella, poi "+N"). Passando il mouse si vedono i dettagli. Un intervento completato è attenuato, uno rinviato ha il bordo tratteggiato, uno annullato è barrato.
- **Giorni vuoti**: anche un giorno senza interventi si seleziona con un clic e apre l'anteprima vuota, con i pulsanti per creare un intervento in un progetto esistente o un nuovo progetto in quella data.
- **Sidebar dei progetti**: riquadri con «**Prossimo**: data» (il prossimo intervento in programma) oppure, se il progetto ha solo interventi passati, «**Ultimo**: data» (il più recente); «Nessun intervento» se non ne ha. Le date hanno sempre l'anno. L'etichetta "N date" indica più interventi. La ricerca istantanea non distingue maiuscole e accenti.
- **Telefono** (sotto 760 px): i progetti diventano una riga scorrevole e gli eventi delle barre colorate.
- **Tema scuro**: segue l'impostazione del sistema operativo.
- **Lingua**: l'interfaccia è in inglese o in italiano, a scelta di ogni utente (Impostazioni → Aspetto → Lingua).
- **Clic su un progetto**:
  - con un solo intervento, il calendario scorre alla data (caricando i mesi che mancano), la evidenzia e apre la **scheda dell'intervento**;
  - con più interventi, un menu elenca le date (frecce, Invio, Esc) con il **prossimo intervento futuro già selezionato**; se sono tutti passati, è selezionato l'ultimo;
  - nella scheda, i pulsanti "Date del progetto" passano da un intervento all'altro;
  - senza interventi, compare un avviso.
- **Tasto destro su un giorno** (su telefono/tablet: tenere premuto): menu per creare un **nuovo progetto** con il primo intervento in quella data, un **nuovo intervento** in un progetto esistente, o aprire gli interventi del giorno. Data e orario proposto sono già compilati.
- **«+ Intervento»** nella barra dell'anteprima (in basso o a destra, accanto a ✕): nuovo intervento nel giorno mostrato in un progetto esistente, con la data già compilata.
- **Clic su un giorno** con interventi, o Invio da tastiera: apre il dettaglio di **tutti gli interventi del giorno**. Il clic su un singolo evento porta in vista la sua scheda.
- **Scheda**: stato e tipo, orario, partecipanti, note, un riepilogo ("check OK 2/3 · migrati 1/3"; la colonna di stato e il riepilogo prendono il nome dal tipo: Migrazione/migrati, Upgrading/aggiornati, Patching/patchati, Esecuzione/completati per «Altro») e la tabella server compatta, in sola lettura, che scorre in orizzontale. Sopra i 1100 px è una colonna a destra e il calendario si restringe; sotto, si sovrappone a tutto lo schermo. Si chiude con ✕ o Esc.

### Anagrafica server
- I server sono un'**anagrafica** a sé: togliere un server da un intervento non lo cancella. Resta nel database, con i suoi dati e il suo storico, pronto per interventi futuri.
- Il pulsante **Server** in alto apre l'anagrafica: tutti i server, anche quelli che non sono più in nessun intervento.
  - Per ognuno: IP, sistema operativo, ambiente, kernel attuale, numero di interventi, **ultimo** intervento (data e stato della migrazione) e **prossimo** in programma.
  - **Ricerca** su hostname, IP, sistema operativo, ambiente, kernel e note.
  - Navigazione da tastiera: ↓ dalla ricerca all'elenco, ↑/↓ tra le righe, Invio per aprire lo storico.
  - Colonne ridimensionabili.
- Selezionando un server si vede lo **storico degli interventi**, dal più recente:
  - per ognuno data, progetto, stato dell'intervento, check, migrazione, kernel target, data di esecuzione, tecnico e note;
  - gli interventi futuri sono indicati come "in programma";
  - **Apri intervento** porta all'intervento con la riga del server evidenziata;
  - sotto c'è la cronologia delle **modifiche ai dati del server** (es. IP cambiato: vecchio → nuovo, con data e ora).
- **Riusare un server**: nella tabella a tutto schermo, scrivendo l'hostname in "Aggiungi server" compaiono i **suggerimenti** dall'anagrafica (IP, SO, ambiente, numero di interventi). Si sceglie con il mouse o con ↓ e Invio, e il server viene collegato con tutti i suoi dati. Quelli già nell'intervento sono indicati e non selezionabili. Se l'hostname non esiste, Invio crea un server nuovo.

### Tecnici
- Le persone stanno nel database (tabella `users`) e si gestiscono dal pulsante **Tecnici** in alto: nome, email aziendale (facoltativa), ruolo (tecnico, coordinatore, amministratore) e **Attivo**. Le modifiche si salvano da sole.
- **Tecnico nuovo al volo**: nei menu dei partecipanti, «**+ Nuovo tecnico…**» (in fondo all'elenco) apre un campo per il nome. Il tecnico viene salvato nel database e aggiunto all'intervento; se esiste già un tecnico con quel nome (maiuscole e spazi ignorati) si usa quello. È permesso a tutti gli utenti, ma crea solo il nome: ruolo *tecnico*, nessuna email, nessun accesso. Se il nome è di un tecnico disattivato compare un avviso: va riattivato da un amministratore.
- **Aggiungere**: modulo "Aggiungi tecnico" in fondo alla finestra. Nome ed email sono unici, senza distinguere maiuscole.
- **Non si cancella, si disattiva**: un tecnico disattivato sparisce dai menu di scelta, ma resta dove era già assegnato (indicato come "(disattivato)"), nella cronologia e nel filtro del calendario, così si possono rivedere gli interventi passati.
- **Menu a tendina** con i tecnici attivi in:
  - colonna "Tecnico" della tabella server;
  - **partecipanti** dell'intervento, sia nella scheda sia nella finestra "Nuovo progetto": si sceglie dal menu "+ Aggiungi tecnico…" e si toglie con la × sull'etichetta; nella scheda la modifica si salva subito;
  - filtro del calendario per tecnico.
- I 4 tecnici iniziali (Luca Bianchi, Sara Verdi, Marco Neri, Giulia Gallo) sono **fittizi** e vengono dai dati di esempio: si possono rinominare o disattivare.
- Un tecnico aggiunto da un collega compare nei menu entro circa 10 secondi.

### Impostazioni
L'icona **⚙** in alto apre le Impostazioni, la sezione in cui raccogliere man mano configurazioni e personalizzazioni.

**Aspetto** (personale, ogni utente ha le sue):
- **Anteprima dell'intervento**:
  - *a destra*: compatta e in sola lettura, la modifica si apre a tutto schermo;
  - *in basso, sotto il calendario*: a tutta larghezza, con la **tabella server completa e modificabile** (come a tutto schermo). La colonna dei progetti resta a sinistra.
  - Si passa dall'una all'altra anche con il **pulsante nella barra dell'anteprima**, accanto alla ✕. L'altezza si regola trascinando il bordo superiore dell'anteprima (o con ↑/↓ quando è selezionato) e viene ricordata.
- **Tema**: come il sistema, chiaro o scuro.
- **Formato degli orari**: 24 ore (europeo, predefinito) o 12 ore con AM/PM.
- **Lingua**: inglese o italiano. Il valore predefinito, «Come il browser», usa l'italiano se il browser lo preferisce, altrimenti l'inglese. Nella lingua scelta compaiono anche i messaggi del server (errori, avvisi), l'email di condivisione e il changelog delle «Novità» (`CHANGELOG.md` in inglese, `CHANGELOG.it.md` in italiano).

- **Colonna progetti**:
  - *vista* a quadrati o a rettangoli (uno per riga);
  - *ordinamento* alfabetico o per data (prima il prossimo intervento più vicino, poi i progetti con soli interventi passati, infine quelli senza interventi);
  - *larghezza*: si trascina il bordo destro della colonna (frecce ←/→ da tastiera, doppio clic per tornare a 280 px).
  Vista e ordinamento si cambiano anche con i pulsanti in testa alla colonna.

**Amministrazione** (solo amministratori): accesso a Utenti e Sistemi operativi.

Le preferenze sono salvate sul server, nella tabella `user_preferences`, e seguono l'utente su qualsiasi computer. Per aggiungerne una nuova:
1. un campo con valore di default in `app/schemas/preferences.py` (non serve una migrazione);
2. il controllo nella sezione giusta di `static/js/settings.js`;
3. l'applicazione in `static/js/prefs.js`.

### Sistemi operativi
- Nella tabella server ci sono due colonne a menu a tendina: **SO** (sistema operativo attuale, dato del server) e **SO target** (sistema operativo di destinazione in quell'intervento, dato della riga come il kernel target). Le intestazioni sono abbreviate; il nome completo compare al passaggio del mouse.
- Gli amministratori trovano in fondo ai menu **«+ Aggiungi versione…»**: si possono scrivere una o più versioni («9.6» oppure «9.5, 9.6») senza uscire dalla tabella.
- La colonna **SO** è un menu a tendina con le voci **attive** dell'elenco, mostrate in forma breve («RHEL 9.8»). Sul server viene salvato il nome completo («Red Hat Enterprise Linux 9.8»).
- L'elenco iniziale (dalla migrazione) contiene Red Hat Enterprise Linux 7.9, 8.10, 9.8 e 10.2.
- **Nuove versioni** (minor o major): un amministratore le aggiunge da Impostazioni → Amministrazione → **Sistemi operativi** (o dal menu della tabella), indicando la famiglia e una o più versioni separate da virgola. Si possono aggiungere anche altre famiglie (Rocky Linux, Oracle Linux…). L'ordine è numerico: 9.8, 9.9, 10.2, 10.3, 11.0.
- **Versioni superate**: si **disattivano**. Spariscono dal menu, ma i server che le hanno le conservano (indicate come «non in elenco»). Una voce si può eliminare solo se nessun server la usa, ad esempio se è stata inserita per errore.
- Le voci non si rinominano: cambierebbe il significato dei server che le usano. Per correggere un errore si aggiunge la voce giusta e si elimina o disattiva quella sbagliata.
- Il server accetta solo voci attive; un valore già presente può restare invariato.

### Clienti
- Ogni progetto può avere un **cliente** (facoltativo), scelto da menu a tendina nella finestra "Nuovo progetto" e nella scheda progetto. **«+ Nuovo cliente…»** lo crea al volo; se il nome esiste già, anche con maiuscole diverse, viene usato quello.
- **Raggruppare**: nel menu in testa alla colonna progetti scegli «Cliente · A → Z» o «Cliente · per data» (oppure Impostazioni → Aspetto → Raggruppamento). Compare un'intestazione per cliente, con il numero di progetti; quelli senza cliente vanno in fondo.
- **Filtrare**: Filtri → **Cliente**. Il filtro vale per il calendario **e** per la colonna progetti.
- Il nome del cliente compare sui riquadri, **nel calendario** (seconda riga di ogni intervento: «2/4 · Cliente · ora»), nella scheda dell'intervento e nei tooltip; la ricerca della colonna lo trova.
- **Colore per cliente**: in Impostazioni → Amministrazione → Clienti si sceglie il colore di ogni cliente, che vale per tutti i suoi progetti (riquadri, calendario, schede). «Automatico» torna alla tavolozza del portale, usata anche per i progetti senza cliente. Sui colori chiari il testo diventa scuro per restare leggibile.
- **Gestione** (amministratori): Impostazioni → Amministrazione → **Clienti**. Rinominare un cliente aggiorna tutti i suoi progetti; si possono eliminare solo i clienti senza progetti.

### Modifica di progetti e interventi
- **Scheda progetto**:
  - si apre dalla **matita** sul riquadro (visibile passando il mouse; su telefono sempre visibile), dal pulsante **Progetto** nella scheda dell'intervento, oppure con un clic sul riquadro di un progetto ancora senza interventi;
  - si modificano nome (unico), descrizione e stato (attivo, sospeso, chiuso);
  - mostra tutti gli interventi del progetto, ognuno con il pulsante **Apri**;
  - **+ Nuovo intervento** aggiunge un'altra data allo stesso progetto.
- **Orari**: si scelgono da menu a passi di 30 minuti. Per un nuovo intervento vengono proposti **9:00–13:00**, oppure **14:00–18:00** se in quella data c'è già un intervento (il suggerimento segue la data finché non si toccano gli orari). Formato 24 ore o AM/PM da Impostazioni → Aspetto.
- **Modifica intervento** (pulsante **Modifica** nella scheda): data, tipo, titolo, orari e note. Stato, partecipanti e server si cambiano dalla scheda e dalla tabella, come prima. Spostando la data, le righe server che avevano come data prevista quella vecchia la seguono.
- **Duplicare un intervento** (pulsante **Duplica** nella scheda, tra «Condividi» e «Modifica»), per esempio quando va rieseguito: si sceglie la nuova data (proposta: una settimana dopo) e l'orario. Nello stesso progetto si crea un intervento «Pianificato» con tipo, titolo, note e tecnici dell'originale e, se si vuole, la stessa tabella server: restano target, tecnico e note di ogni riga, gli stati ripartono da capo (check «Da fare», migrazione «Pianificata», nessuna data di esecuzione). L'originale non cambia.
- **Eliminare un intervento**: dal pulsante «Modifica» della scheda dell'intervento, o dal cestino nell'elenco della scheda progetto. Vengono tolte le sue righe server e i partecipanti; **i server restano in anagrafica**. Se contiene server serve il ruolo coordinatore o amministratore; i tecnici possono eliminare solo interventi vuoti. In alternativa si può segnare come «annullato» per conservarne lo storico.
- **Eliminare un progetto** (coordinatori e amministratori): scheda progetto → «Elimina progetto». Vengono tolti tutti i suoi interventi; il cliente e i server restano.
- **Conferma**: prima di ogni eliminazione una finestra elenca cosa verrà eliminato e cosa resta. Per un progetto con interventi va **scritto il nome del progetto**. Ogni eliminazione resta nella cronologia, con l'autore.
- Tutte le modifiche usano il controllo di versione: se un collega ha cambiato lo stesso dato, il salvataggio viene rifiutato con un avviso.

### Nuovo progetto
- In fondo all'elenco dei progetti c'è il riquadro **"+ Nuovo progetto"**, grande come gli altri e sempre visibile, anche durante una ricerca.
- La finestra chiede **nome** (obbligatorio e unico, senza distinguere maiuscole) e descrizione.
- Per il primo intervento si scelgono anche i **tecnici** partecipanti, dal menu a tendina.
- La sezione **Primo intervento** (data, tipo, titolo, orari) è attiva di default: senza un intervento il progetto non compare nel calendario. Si può disattivare.
- Dopo la creazione il riquadro del nuovo progetto è evidenziato e, se c'è l'intervento, il calendario va alla sua data e apre la scheda. Da lì si aggiungono i server con "Tutto schermo · modifica".
- I colleghi vedono il nuovo progetto e il suo intervento entro circa 10 secondi, senza ricaricare la pagina.

### Ricerca e filtri
- **Ricerca** (sidebar), dopo almeno 2 caratteri:
  - filtra i progetti per nome e cerca i **server** per hostname, IP o sistema operativo in tutti gli interventi;
  - ogni risultato mostra progetto, data e stati;
  - il clic apre l'intervento ed evidenzia la riga del server;
  - i caratteri `%` e `_` sono cercati alla lettera.
- **Filtri del calendario** (pulsante **Filtri** in alto):
  - stato dell'intervento (più scelte), tecnico (partecipante o assegnato a una riga) e **Solo con problemi** (almeno un check KO o una migrazione fallita);
  - valgono per tutti i mesi, anche quelli caricati scorrendo, e sono **ricordati nel browser**;
  - un giorno con interventi nascosti dai filtri ha il numero sottolineato a puntini.
- **Filtro delle righe** nella tabella a tutto schermo: testo libero (hostname, IP, kernel, note, tecnico) e stato di check o migrazione. Una riga appena modificata o aggiunta resta visibile finché non si cambia il filtro.

### Stati e concorrenza
- **Stato dell'intervento** (pianificato, confermato, in corso…): si cambia dal menu colorato nella scheda o nella tabella a tutto schermo. Usa lo stesso controllo di versione delle righe (409 se un altro utente l'ha cambiato).
- **Aggiornamento automatico**:
  - ogni 10 secondi, e subito quando si torna sulla scheda del browser, l'app chiede al server cosa è cambiato (`GET /api/changes`);
  - aggiorna calendario, scheda laterale e tabella aperta;
  - nella tabella le righe modificate da altri lampeggiano in azzurro;
  - le celle che si stanno modificando non vengono toccate;
  - un dato del server (es. l'IP) cambiato in un intervento aggiorna anche gli altri interventi in cui quel server compare.

### Colonne ridimensionabili
- Sia nella tabella compatta sia in quella a tutto schermo: si **trascina il bordo destro dell'intestazione**.
- Da tastiera: Tab fino al bordo, poi frecce ←/→.
- **Doppio clic** sul bordo riporta la colonna alla larghezza predefinita; **Larghezze predefinite** nella tabella a tutto schermo le riporta tutte.
- L'ultima colonna (Note) prende lo spazio che resta.
- Le larghezze sono **ricordate nel browser**, separatamente per le due tabelle.

### Condividere un intervento via email
- Il pulsante **«Condividi»** (sulla scheda di ogni intervento e nella tabella a tutto schermo) apre l'anteprima dell'email: intestazione con cliente, progetto, data, orario, tipo, stato, partecipanti e note, il riepilogo e la **tabella server con tutte le colonne** del portale (stati colorati, kernel e SO attuali e target, tecnico, note).
- **Destinatari** già compilati con le email dei partecipanti (modificabili) e **oggetto** già scritto: cliente, progetto, data e ora, stato dell'intervento.
- **«Copia e apri Gmail»**: copia l'email formattata e apre un nuovo messaggio di Gmail con destinatari e oggetto. Nel corpo si incolla con **Ctrl+V** e la tabella resta formattata. «Copia email» copia soltanto; «Copia come testo semplice» serve per programmi che non accettano testo formattato.
- **Account Gmail (mittente)**: l'account Google con cui aprire Gmail; per default l'email del profilo nel portale. Si cambia nella finestra o in Impostazioni → Aspetto → «Condivisione via email» e viene ricordato. L'account deve essere collegato nel browser (anche insieme a quello personale della sincronizzazione), altrimenti Gmail apre quello predefinito: in quel caso attivare **«Fammi scegliere l'account Google a ogni invio»**, che passa dalla scelta dell'account di Google (con l'indirizzo già proposto) e permette di selezionarlo o di accedervi.
- Non serve collegare il portale a Google: l'email la invia l'utente dalla sua casella.
- In fondo all'email c'è il **link all'intervento** nel portale (`http://…/#intervento-ID`): chi lo apre, dopo il login, arriva direttamente su quell'intervento.

### Interventi di configurazione
- Il tipo **«Configurazione»** (nella finestra dell'intervento, menu «Tipo») è pensato per interventi senza kernel, check e migrazione.
- La tabella server ha solo **hostname, IP, SO, ambiente, eseguito il e tecnico**. Sotto ogni server c'è una **riga di note a tutta larghezza** per il dettaglio della configurazione (passi, parametri, file modificati, verifiche): parte alta due righe e **cresce con il testo**; si può anche allungare trascinando l'angolo. **Invio** va a capo, l'uscita dal campo salva, **Esc** annulla.
- Le note (fino a 20.000 caratteri) compaiono con gli a capo anche nella scheda compatta e nell'**email** di condivisione, sotto ogni server. Il riepilogo indica quanti server sono stati eseguiti.
- Cambiando il tipo di un intervento la tabella cambia colonne; i dati delle colonne nascoste restano salvati.

### Tabella a tutto schermo (modifica)
Il pulsante **"Tutto schermo · modifica"** nella scheda apre la tabella completa con le **11 colonne**:

hostname, IP, sistema operativo, ambiente, kernel attuale, kernel target, check, migrazione, data di esecuzione, tecnico, note.

Da 1300 px circa le colonne sono tutte visibili; sotto, la tabella scorre in orizzontale con l'hostname bloccato a sinistra.

- **Salvataggio automatico** di ogni cella: all'uscita dalla cella, con **Invio** (che salva e scende alla riga sotto) o alla scelta da un menu. Una cella appena salvata lampeggia in verde; quella in modifica ha un punto ambra.
- **Esc** annulla la modifica della cella; se nessuna cella è in modifica, chiude la tabella. La chiusura salva prima la cella aperta.
- **Aggiungere un server**: hostname in fondo e Invio. Se l'hostname esiste già (anche in un altro progetto) viene collegato **quel** server con i suoi dati; se è già nell'intervento, l'aggiunta è rifiutata. Gli hostname sono salvati in minuscolo.
- **Togliere un server**: icona del cestino e conferma con un secondo clic. Il server resta in anagrafica e negli altri interventi.
- **Colonne sottolineate** (hostname, IP, SO, ambiente, kernel attuale): sono dati **del server**, condivisi da tutti gli interventi in cui compare. Le altre valgono solo per questo intervento.
- **Validazione**: IP valido, hostname con soli caratteri ammessi, stati tra quelli previsti. La cella con un errore si colora di rosso e il motivo si legge nel tooltip.
- **Concorrenza**: se un altro utente ha salvato la stessa riga nel frattempo, il salvataggio è **rifiutato**. La riga mostra i valori aggiornati, la cella si colora d'ambra e un avviso chiede di ripetere la modifica. Niente viene sovrascritto senza che l'utente lo sappia.
- **Cronologia**: ogni modifica, aggiunta e rimozione è registrata in `audit_log` (campo, valore vecchio e nuovo, data e ora). Senza login l'utente è vuoto.
- Chiudendo la tabella si aggiornano la scheda laterale e il calendario (numero di server).

### Export e import tra installazioni
Per portare progetti da un'installazione di Date Spreader a un'altra: per esempio dal portale aziendale a un'installazione su un PC o presso il cliente.

- **Esportare** (coordinatori e amministratori):
  - un **progetto**: scheda progetto → «Questo progetto»;
  - un **cliente intero**, con tutti i suoi progetti: scheda progetto → «Tutto il cliente …», oppure Impostazioni → Amministrazione → Clienti → «Esporta».

  Si scarica un file `datespreader-progetto-….json` o `datespreader-cliente-….json` con interventi, tabelle server complete, partecipanti, cliente (con il colore) e versioni dei sistemi operativi usate. **Non contiene mai** password, accessi, preferenze o cronologia. Ogni export resta nella cronologia (chi, cosa, quando). Il file contiene dati dei clienti (hostname, IP): va trattato con la stessa cura del database.
- **Importare** (amministratori): Impostazioni → Amministrazione → **«Importa progetti»**, scegliendo o trascinando il file.
  - L'**anteprima** mostra cosa verrà creato: progetti, interventi e righe server, clienti, server, tecnici e versioni SO nuovi o già presenti. È fedele: il server esegue l'import e lo annulla.
  - Ciò che esiste già viene **riconosciuto e riusato, senza modificarlo**: clienti per nome, server per hostname, tecnici per email e poi per nome, versioni SO per famiglia e numero. Se un server esistente ha dati diversi nel file (es. un altro IP), l'anteprima lo segnala e qui restano i dati attuali.
  - **Progetti con lo stesso nome**: si saltano, oppure si importano come copia «… (importato)».
  - I tecnici nuovi vengono creati con ruolo *tecnico* e senza accesso al portale.
  - L'import avviene in un'unica transazione: o tutto, o niente.
- Il formato (`"format": "datespreader-export"`, `"format_version": 1`) è descritto in `app/schemas/transfer.py`. Un file creato da una versione più recente con un formato incompatibile viene rifiutato con un messaggio chiaro.

## API

| Endpoint | Descrizione |
|---|---|
| `GET /api/health` | Stato dell'app, del database e dello schema (pubblico) |
| `GET /api/version`, `GET /api/changelog` | Versione e changelog (pubblici; il changelog nella lingua dell'utente) |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/change-password` | Accesso |
| `POST /api/users/{id}/temporary-password` | Password temporanea per un utente (solo amministratori) |
| `GET /api/projects` | Progetti con le date dei propri interventi, in ordine |
| `GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD` | Interventi nell'intervallo (estremi inclusi, al massimo 400 giorni), con nome del progetto, numero di server e avanzamento (`migrated`, `executed`) |
| `GET /api/events/{id}` | Dettaglio di un intervento: partecipanti e righe server, con `version` per il controllo di concorrenza |
| `GET /api/days/YYYY-MM-DD` | Dettaglio di tutti gli interventi di un giorno (lista vuota se non ce ne sono) |
| `PATCH /api/event-servers/{id}` | Modifica parziale di una riga. Richiede `version` (e `server_version` se si toccano campi del server). Risponde **409** con `detail.current` se i dati sono cambiati, **422** se un valore non è valido |
| `POST /api/events/{id}/servers` | Aggiunge un server all'intervento (riusa il server se l'hostname esiste). 409 se è già presente |
| `DELETE /api/event-servers/{id}?version=N` | Toglie il server dall'intervento (resta in anagrafica). 409 se la riga è cambiata |
| `GET /api/users[?all=true]` | Tecnici attivi (con `all=true` anche i disattivati) |
| `POST /api/users` | Nuovo tecnico (`display_name`, `email`, `role`). 409 se nome o email esistono già |
| `POST /api/users/technicians` | Tecnico al volo, per tutti gli utenti (`display_name`): restituisce quello con lo stesso nome (200) o lo crea con ruolo tecnico (201); 409 se è disattivato |
| `PATCH /api/users/{id}` | Modifica nome, email, ruolo, `is_active` (con `version`, 409 se cambiato) |
| `PUT /api/events/{id}/participants` | Sostituisce i partecipanti (`user_ids`). Un tecnico disattivato può restare ma non essere aggiunto |
| `GET /api/options` | Valori ammessi per le colonne a scelta |
| `POST /api/projects` | Crea un progetto (`name`, `description`, `status`), con `first_event` facoltativo (`event_date`, `title`, `event_type`, `start_time`, `end_time`). 409 se il nome esiste già |
| `GET /api/me/preferences` · `PATCH /api/me/preferences` | Preferenze personali dell'utente corrente (posizione e altezza dell'anteprima, tema, lingua `language`: `auto`, `en` o `it`, larghezza/vista/ordinamento della colonna progetti) |
| `GET /api/operating-systems[?all=true]` | Elenco dei sistemi operativi (attivi; con `all` anche i disattivati), con `server_count` |
| `POST /api/operating-systems` · `PATCH /api/operating-systems/{id}` · `DELETE /api/operating-systems/{id}` | Gestione dell'elenco (solo amministratori): aggiunta (`family`, `major`, `minor`), attiva/disattiva, eliminazione se mai usato |
| `GET /api/customers` · `POST /api/customers` | Clienti con numero di progetti; creazione (tutti gli utenti) |
| `PATCH /api/customers/{id}` · `DELETE /api/customers/{id}` | Rinomina e colore (`name`, `color` «#RRGGBB» o null), ed eliminazione se senza progetti (solo amministratori) |
| `PATCH /api/projects/{id}` | Modifica nome, descrizione, stato del progetto (`version`, 409 se cambiato o nome già usato) |
| `POST /api/projects/{id}/events` | Nuovo intervento nel progetto (data, tipo, titolo, orari, note, `participant_ids`) |
| `POST /api/events/{id}/duplicate` | Copia l'intervento in un'altra data (`event_date`; orario copiato o `keep_times: false` con `start_time`/`end_time`; `include_servers`: tabella server con stati azzerati) |
| `PATCH /api/events/{id}` | Modifica data, tipo, titolo, orari, stato, note di un intervento (`version` obbligatoria, 409 se cambiato) |
| `DELETE /api/events/{id}?version=N` | Elimina un intervento con le sue righe server (i server restano). Con server: solo coordinatori e amministratori (403 per i tecnici) |
| `DELETE /api/projects/{id}?version=N` | Elimina un progetto con i suoi interventi (solo coordinatori e amministratori) |
| `GET /api/servers[?q=…&limit=…]` | Anagrafica: tutti i server (anche senza interventi) con numero di interventi, ultimo e prossimo. `total` = corrispondenze totali |
| `GET /api/servers/{id}` | Dati del server, storico degli interventi (dal più recente) e modifiche ai suoi dati |
| `GET /api/export/projects/{id}` · `GET /api/export/customers/{id}` | File JSON con un progetto, o con tutti i progetti di un cliente (coordinatori e amministratori) |
| `POST /api/import/preview` · `POST /api/import` | Anteprima (non scrive nulla) e import di un file di export (`data`, `on_conflict`: `skip` o `copy`; solo amministratori) |
| `GET /api/search?q=…` | Progetti (nome, descrizione) e righe server (hostname, IP, SO) che contengono il testo |
| `GET /api/changes[?since=N]` | Feed delle modifiche. Senza `since` restituisce il punto di partenza (`last_id`); con `since` anche gli interventi toccati dopo quell'id, `projects_changed` (nuovi progetti o interventi: ricaricare la sidebar) e `users_changed` (tecnici cambiati: ricaricare i menu) |

`GET /api/events` restituisce anche gli indicatori usati dai filtri: `check_ko`, `migration_failed`, `migrated` e `user_ids` (partecipanti e tecnici assegnati).

## Comandi del database

| Comando | Effetto |
|---|---|
| `.venv/bin/python -m app.cli init` | Applica le migrazioni (crea il database se manca). Si può ripetere senza rischi |
| `.venv/bin/python -m app.cli init --demo` | Come sopra, più i dati di esempio (per una demo o un'installazione di prova) |
| `.venv/bin/python -m app.cli migrate` | Applica solo le migrazioni |
| `.venv/bin/python -m app.cli demo load` | Carica i dati di esempio accanto agli altri; non fa nulla se ci sono già |
| `.venv/bin/python -m app.cli demo remove` | Mostra cosa verrebbe tolto e chiede conferma (`--yes` per non chiederla) |

**Nessun comando cancella i dati inseriti dagli utenti.** Il vecchio `seed --reset`, che svuotava tutto, è stato eliminato.

### Dati di esempio (demo)
Progetti, server e tecnici di esempio hanno il campo `is_demo`. Nell'interfaccia sono indicati con l'etichetta **ESEMPIO**, sia sui riquadri dei progetti sia nell'elenco "Tecnici".

- **Installazione nuova / demo** (es. dopo un clone del repository open source): `init --demo`.
- **Passaggio ai dati reali**: `demo remove`. Cosa fa:
  - cancella i progetti di esempio, con i loro interventi, righe server e partecipanti;
  - cancella i server di esempio, **salvo** quelli usati in interventi reali: quelli restano e smettono di essere "esempio";
  - cancella i tecnici di esempio, **salvo** quelli usati da dati reali: quelli vengono solo disattivati;
  - i dati reali non vengono mai toccati.
- I dati di esempio si possono ricaricare in qualsiasi momento con `demo load`.
- Sull'installazione con systemd i comandi vanno lanciati come utente del servizio: `sudo -u datespreader .venv/bin/python -m app.cli demo remove`.
- Chi ha il portale aperto vede sparire progetti e tecnici entro circa 10 secondi; per ripulire anche il calendario serve ricaricare la pagina (Ctrl+F5).

### Backup
Il database viene copiato in automatico in `data/backups/`: ogni notte (timer systemd `datespreader-backup.timer`),
prima di ogni aggiornamento dello schema e a richiesta (Impostazioni → Amministrazione → «Backup del database», dove
gli amministratori possono anche scaricarli). Ogni copia è verificata; la rotazione tiene 7 backup giornalieri,
4 settimanali e 12 mensili. Dettagli, ripristino e copie fuori dalla macchina: [guida di installazione, «Backup»](docs/INSTALLAZIONE.md#backup).

```bash
sudo -u datespreader .venv/bin/python -m app.cli backup            # backup adesso (+ rotazione)
sudo -u datespreader .venv/bin/python -m app.cli backup --list     # elenco
sudo -u datespreader .venv/bin/python -m app.cli restore FILE      # ripristino (prima ferma il servizio)
```

`data/` (database e backup) è escluso da git: **non deve mai finire nel repository**, perché contiene dati reali dei clienti. Il database di prova pubblico è `demo/datespreader-demo.sqlite3`, generato da zero con `scripts/make_demo_db.py` (mai copiato da un database reale).

> **Migrazioni e SQLite.** Per modificare una tabella SQLite, Alembic la ricrea (copia, cancella, rinomina). Con le chiavi esterne attive, cancellare una tabella "padre" farebbe partire gli `ON DELETE CASCADE` e svuoterebbe le tabelle figlie. Per questo `app.migrations.upgrade_database` **disattiva le chiavi esterne durante le migrazioni**, alla fine verifica l'integrità (`PRAGMA foreign_key_check`) e le riattiva. `migrations/env.py` rifiuta di partire se le trova attive. Il test `test_migrations_do_not_cascade_delete_children` lo verifica.

Se si modifica un modello in `app/models/` bisogna generare una nuova migrazione e rileggerla prima di applicarla:

```bash
.venv/bin/alembic revision --autogenerate -m "descrizione modifica"
.venv/bin/python -m app.cli migrate
```

Se ci si dimentica di farlo, il test `test_models_match_migrations` fallisce.

## Test

```bash
.venv/bin/pytest
```

I test usano un database temporaneo e non toccano `data/`. Nei test sui dati l'utente è un amministratore fittizio (`tests/conftest.py`, `authed_app`). I test di accesso (`tests/test_auth.py`) usano invece il login vero.

## Configurazione
Si configura tramite variabili d'ambiente, oppure con un file `.env` (vedi `.env.example`).

| Variabile | Default | Note |
|---|---|---|
| `APP_NAME` | `Date Spreader` | Nome mostrato |
| `DATABASE_PATH` | `data/datespreader.sqlite3` | Relativo alla cartella del progetto. **Solo disco locale, mai cartelle di rete.** |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000` | Attesa quando il database è bloccato da un'altra scrittura |
| `HOST` | `127.0.0.1` | `0.0.0.0` per l'accesso dalla LAN (vedi sopra) |
| `PORT` | `8000` | |
| `RELOAD` | `false` | `true` solo in sviluppo |
| `SESSION_HOURS` | `12` | Ore di inattività dopo cui la sessione scade |
| `COOKIE_SECURE` | `false` | `true` dietro HTTPS |
| `SOURCE_URL` | repository ufficiale | Dove scaricare il codice sorgente (vedi Licenza) |

## Modello dati

| Tabella | Contenuto |
|---|---|
| `projects` | Progetti (nome univoco, descrizione, stato) |
| `events` | Interventi: progetto, data, ora di inizio e fine (facoltative), tipo, stato, note |
| `servers` | Attributi stabili della macchina: hostname (univoco), IP, sistema operativo, ambiente, kernel attuale |
| `event_servers` | Una riga della tabella server di un intervento: kernel target, stato del check, stato della migrazione, data prevista ed effettiva, tecnico, note, ordine. Uno stesso server può comparire in più interventi, ma una sola volta per intervento. |
| `users`, `event_users` | Utenti (identità aziendale fittizia) e partecipanti agli interventi |
| `audit_log` | Cronologia: utente, data e ora, tabella, record, campo, valore vecchio e nuovo |
| `custom_field_definitions`, `custom_field_values` | Colonne aggiuntive configurabili, senza modificare lo schema SQL |

- **Concorrenza**: ogni tabella modificabile ha una colonna `version`. Se due utenti salvano lo stesso record, il secondo salvataggio fallisce (`StaleDataError`) invece di sovrascrivere il primo senza avvisare. Al punto 6 diventerà una risposta HTTP 409 con un avviso nell'interfaccia.
- **Cancellazioni**: se si cancella un progetto si cancellano anche i suoi interventi e le loro righe. Un server usato in un intervento non si può cancellare.
- **Stati**: i valori ammessi sono in `app/models/statuses.py`. Sono salvati come testo, quindi cambiarli non richiede migrazioni.

### Dati fittizi
`app/seed.py` crea (tutto marcato `is_demo`):
- 3 progetti, 4 interventi, 10 server e 4 utenti;
- hostname `*.example.com` e IP nei blocchi riservati alla documentazione (192.0.2.x, 198.51.100.x, 203.0.113.x);
- date calcolate rispetto a oggi, distribuite su mese precedente, corrente e successivo.

Alcuni casi sono inseriti apposta per provare l'interfaccia:
- **Alfa Logistica** ha **due interventi** in date diverse;
- **alfa-db01** compare in entrambi (rinviato alla seconda finestra);
- **beta-app01** ha il check in stato `ko`.

## Struttura

```
app/
  main.py          crea l'app FastAPI, monta le API e i file statici
  config.py        impostazioni da variabili d'ambiente / .env
  db.py            motore SQLite (WAL, busy_timeout, foreign keys), sessioni
  cli.py           comandi init / migrate / demo load / demo remove
  migrations.py    applica e verifica le migrazioni dal codice
  seed.py          dati di esempio (caricamento, anteprima e rimozione)
  api/             router HTTP sotto /api (health, calendar, servers)
  audit.py         scrittura della cronologia delle modifiche (con l'autore)
  transfer.py      export e import di progetti tra installazioni (formato in schemas/transfer.py)
  auth.py          controllo d'accesso: sessione, ruoli, CSRF
  security.py      password (scrypt), token, limite ai tentativi
  i18n.py          messaggi del server in inglese e italiano (lingua da Accept-Language)
  models/          modelli ORM e valori di stato ammessi
  repositories/    accesso ai dati: unico punto che interroga il database
  schemas/         schemi di input/output delle API
migrations/        migrazioni Alembic (alembic.ini nella cartella principale)
static/            frontend senza fasi di build
  js/main.js       avvio e collegamento dei componenti
  js/calendar.js   calendario verticale e caricamento progressivo dei mesi
  js/sidebar.js    riquadri dei progetti (cliccabili) e ricerca
  js/chooser.js    scelta della data per i progetti con più interventi
  js/detail.js     pannello di dettaglio con la tabella server compatta
  js/sheet.js      tabella a tutto schermo, modificabile in linea
  js/resize.js     colonne ridimensionabili (riusato dalle due tabelle)
  js/filters.js    barra dei filtri del calendario
  js/eventstatus.js menu dello stato dell'intervento
  js/projectform.js finestra "Nuovo progetto"
  js/projectdialog.js scheda progetto e modulo intervento (nuovo / modifica)
  js/osdialog.js   gestione dell'elenco dei sistemi operativi (amministratori)
  js/settings.js   finestra Impostazioni (Aspetto, Amministrazione)
  js/prefs.js      preferenze personali: caricamento, salvataggio, tema e layout
  js/customers.js  clienti: elenco condiviso, menu con "nuovo cliente", gestione
  js/confirm.js    finestra di conferma per le eliminazioni
  js/session.js    utente corrente e permessi derivati dal ruolo
  js/timepick.js   orari a menu (passi di 30 minuti) e orario proposto
  js/contextmenu.js menu contestuale (tasto destro / pressione prolungata)
  js/share.js      condivisione di un intervento via email (Gmail)
  js/transfer.js   import di progetti da un file di export (anteprima e import)
  js/people.js     tecnici: elenco condiviso, selettore partecipanti, finestra "Tecnici"
  js/inventory.js  anagrafica server con ricerca e storico
  js/auth.js       login, cambio password, menu utente, changelog
  js/labels.js     etichette e colori degli stati
  js/api.js        chiamate al backend
  js/i18n.js       traduzioni dell'interfaccia (testi in js/i18n/, inglese e italiano)
  js/dates.js      utilità per le date (settimana da lunedì, formati nella lingua dell'utente)
  js/colors.js     colore stabile per ogni progetto
tests/             test automatici (pytest)
demo/              database di prova con i soli dati di esempio
scripts/           make_demo_db.py (rigenera il database di prova)
deploy/            unità systemd e install.sh (installazione e aggiornamento)
docs/              guida di installazione (INSTALL.md in inglese, INSTALLAZIONE.md in italiano)
data/              database locale (escluso da git)
```

## Scelte di default (documentate come chiede la specifica)
- **Nome**: "Date Spreader" come nella specifica; la cartella si chiama DateSpreader. Si cambia con `APP_NAME`.
- **Frontend senza framework e senza build**: HTML, CSS e JavaScript serviti direttamente da FastAPI.
- **SQLAlchemy + Alembic** per l'accesso ai dati e le migrazioni, così si può passare a PostgreSQL in futuro.
- Il default del codice è `127.0.0.1`; per l'accesso dalla LAN si imposta `HOST=0.0.0.0` nel `.env`.
- **Le migrazioni non partono da sole all'avvio**: si applicano con `app.cli`. Se lo schema non è aggiornato, `/api/health` risponde `schema_non_aggiornato`.
- **Stati provvisori** (la specifica li lascia aperti):
  - check: `da_fare`, `in_corso`, `ok`, `ko`, `non_applicabile`;
  - migrazione: `pianificata`, `in_corso`, `completata`, `fallita`, `rinviata`, `annullata`;
  - intervento: `pianificato`, `confermato`, `in_corso`, `completato`, `rinviato`, `annullato`.
- **`audit_log`**: registra ogni modifica, con l'intervento coinvolto (`event_id`), ed è anche la fonte del feed `/api/changes`. Per ora non c'è un'interfaccia per consultarlo.
- **Aggiornamento automatico**: si interroga il server ogni 10 secondi invece di usare WebSocket. Con pochi utenti contemporanei è semplice e affidabile; l'intervallo è `POLL_MS` in `static/js/main.js`.
- **Commit esplicito** nelle API di scrittura, prima della risposta: un errore di salvataggio non arriva mai al browser come successo.

## Licenza
Copyright (C) 2026 Mark Hawks

Date Spreader è software libero: puoi ridistribuirlo e/o modificarlo secondo i termini della
**GNU Affero General Public License, versione 3** (`AGPL-3.0-only`), come pubblicata dalla Free Software
Foundation. È distribuito nella speranza che sia utile, ma **SENZA ALCUNA GARANZIA**. Testo completo: [LICENSE](LICENSE).

In breve, per l'AGPL: se metti a disposizione di altri una versione **modificata** del portale, anche solo
via rete, devi offrire a quegli utenti il codice sorgente della tua versione. Il portale mostra il link al
sorgente nella schermata di accesso e in «Novità»: imposta `SOURCE_URL` con l'indirizzo della tua versione.
