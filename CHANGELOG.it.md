# Changelog

Tutte le modifiche rilevanti del portale Date Spreader (fino alla 0.9.0 chiamato "Time Dot").
Formato: [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) · Versioni: [Semantic Versioning](https://semver.org/lang/it/).
Versione inglese: [CHANGELOG.md](CHANGELOG.md).

## [Non rilasciato]
### Aggiunto
- **Filtro per cliente sempre a portata di mano**: un menu clienti in cima alla colonna progetti (con il colore del cliente e ✕ per toglierlo) e, quando un cliente è scelto, un'etichetta colorata «Cliente: … ✕» in cima al calendario e alla vista Tecnici. Il cliente si sceglie anche con un clic sulla sua intestazione o sul suo nome nella colonna progetti, con il tasto destro su un intervento («Mostra solo …») o con un clic sul nome del cliente nella scheda dell'intervento. Calendario, vista Tecnici e colonna progetti mostrano allora solo quel cliente; la scelta è la stessa del pannello Filtri e viene ricordata.

## [0.24.0] - 2026-11-11
### Modificato
- Barra in alto su schermi medi (sotto i 1360 px): i pulsanti di vista mostrano solo l'icona (il nome resta nel tooltip) e sotto i 1500 px l'orologio mostra solo l'ora, così la barra resta su una riga.
- **Gli interventi di configurazione hanno la colonna «Stato»** (Pianificata, In corso, Completata…) nella tabella a tutto schermo, nell'anteprima in basso, nella scheda, nei filtri e nell'email di condivisione. L'avanzamento nel calendario («1/2») e il riepilogo contano ora i server con stato «Completata», come per gli altri tipi, e non più quelli con la data «eseguito il»: una data inserita come data prevista non segna più il lavoro come fatto.

### Aggiunto
- **Roadmap** delle funzioni proposte: [docs/ROADMAP.it.md](docs/ROADMAP.it.md) (inglese: `docs/ROADMAP.md`), collegata dai README e dalla guida di installazione.
- **Riepilogo per smartphone**: sul telefono il portale (pensato per il computer) apre una sola pagina in sola lettura per tecnici e coordinatori fuori ufficio: interventi da chiudere (ultimi 14 giorni), di oggi e dei prossimi 7 giorni, «I miei» o «Tutti», con stato, avanzamento, conflitti e tecnici; un tocco mostra i server e permette di cambiare lo stato dell'intervento. «Versione completa» apre il portale normale (scelta ricordata nel browser), dove il pulsante «Riepilogo» riporta indietro.
- **7 giorni o Lun–Ven** nel calendario: **pulsante «Lun–Ven» nella barra in alto**, accanto a Mese, Settimana e Tecnici (anche interruttore in basso a destra nel calendario e in Impostazioni → Aspetto). Con Lun–Ven sabato e domenica compaiono solo nelle settimane (viste Settimana e Tecnici) o nei mesi (vista Mese) con interventi nel fine settimana. Preferenza personale `calendar_days`.
- **Import dei server da CSV/Excel** in un intervento («Importa da CSV/Excel…» accanto ad «Aggiungi server»): un file CSV o .xlsx, oppure righe incollate da un foglio di calcolo. Colonne riconosciute dal nome in italiano o in inglese (o dal contenuto), modificabili; un'anteprima mostra l'esito di ogni riga prima di salvare; SO riconosciuti anche se scritti diversamente; i server già in anagrafica vengono collegati e aggiornati solo su richiesta; le righe sbagliate non bloccano le altre. Nuova dipendenza: `openpyxl` (lettura dei file .xlsx). API: `POST /api/events/{id}/servers/import`.
- **Conflitti di pianificazione**: avviso quando lo stesso server è in due interventi nello stesso giorno, o un tecnico (partecipante o assegnato a una riga server) è in due interventi con orari sovrapposti (senza orario = tutto il giorno; interventi annullati esclusi). Icona di avviso nel calendario, elenco dei conflitti con link all'altro intervento nella scheda e nella tabella a tutto schermo. API: `conflict_users` e `conflict_servers` in `GET /api/events`, `conflicts` nel dettaglio dell'intervento.
- **Vista «Tecnici»** (pulsante accanto a Mese e Settimana): la settimana di ogni tecnico, una colonna per giorno, con i tecnici impegnati due volte evidenziati, una riga per gli interventi senza tecnico, navigazione per settimana, filtri e impaginazione compatta quando lo spazio è stretto. La vista scelta viene ricordata (`calendar_view: "team"`).

### Corretto
- Vista settimanale: gli aggiornamenti degli altri utenti ridisegnano tutte le settimane cambiate (prima, con due settimane cambiate nello stesso mese, se ne ridisegnava una sola).

## [0.23.0] - 2026-11-11
### Aggiunto
- **Backup automatici del database**: una copia verificata (API di backup di SQLite + controllo di integrità) ogni notte verso le 02:30 (timer systemd `datespreader-backup.timer`, installato da `deploy/install.sh`), prima di ogni aggiornamento dello schema e a richiesta. Rotazione: tutto delle ultime 48 ore, poi 7 backup giornalieri, 4 settimanali e 12 mensili (configurabile); gli altri file di `data/backups/` non vengono mai cancellati. Nuovi comandi `app.cli backup [--list]` e `app.cli restore FILE` (prima lo stato attuale viene salvato come backup «pre-restore»). Amministratori: Impostazioni → Amministrazione → «Backup del database», con elenco, «Backup adesso», download e istruzioni per il ripristino. La copia dei backup su un'altra macchina è affidata al backup aziendale.
- **Interfaccia in inglese e in italiano**. Ogni utente sceglie la lingua in Impostazioni → Aspetto → «Lingua»: «Come il browser» (predefinito: italiano se il browser lo preferisce, altrimenti inglese), English o Italiano. Seguono la lingua scelta anche i messaggi del server, l'email di condivisione e il changelog delle «Novità» (`CHANGELOG.md` in inglese, `CHANGELOG.it.md` in italiano). Preferenza personale `language`.
- **Documentazione principale in inglese**, per l'uso in tutto il mondo: `README.md` e `docs/INSTALL.md` sono ora in inglese e completi; le versioni italiane sono `README.it.md` e `docs/INSTALLAZIONE.md`. Il changelog italiano è `CHANGELOG.it.md`.
- **Data e ora nella barra in alto**, accanto al nome del portale: «Mer 11 novembre 2026 · 14:32». Da Impostazioni → Aspetto → «Data e ora nella barra in alto» si sceglie: data e ora (predefinito), con i secondi, solo la data, solo l'ora, nascondi. L'ora segue il formato 24h/12h; passando il mouse si vede la data per esteso. Sugli schermi medi resta solo l'ora, su telefono è nascosta. Preferenza personale `topbar_clock`.
- **Duplica intervento**: pulsante **«Duplica»** nella scheda dell'intervento, tra «Condividi» e «Modifica», per quando lo stesso intervento va rieseguito in un'altra data. Si sceglie la data (proposta: una settimana dopo) e l'orario (quello dell'originale, modificabile) e se copiare la tabella server. Il nuovo intervento, nello stesso progetto, è «Pianificato» e ha tipo, titolo, note e tecnici attivi dell'originale; le righe server mantengono target, tecnico e note, con gli stati azzerati (check «Da fare», migrazione «Pianificata», nessuna data di esecuzione). Dopo la copia si apre il nuovo intervento. API: `POST /api/events/{id}/duplicate`.
- **Vista settimanale del calendario**: due pulsanti **Mese** e **Settimana** accanto a «Oggi», con la stessa grafica (quello della vista attiva è blu pieno, l'altro bordato di blu; su telefono solo l'icona). Ogni settimana è un blocco («Settimana 46 · 9 – 15 novembre 2026») con sette colonne che crescono con gli interventi: si vedono **tutti**, senza «+N», con nome, avanzamento, cliente, titolo e orario, tipo e tecnici. Il cambio di vista resta sullo stesso giorno; scorrimento continuo con caricamento progressivo, zoom (altezza minima dei giorni), filtri, tasto destro e aggiornamenti in tempo reale funzionano come nella vista mensile. Con il calendario stretto (telefono, anteprima a destra) i giorni si dispongono uno sotto l'altro. La vista scelta è una preferenza personale (`calendar_view`).
- **Avanzamento degli interventi nel calendario**: ogni intervento mostra quante attività sono completate sul totale dei server (es. **«2/4»**, in testa alla seconda riga) e una **barra sottile** in fondo che si riempie nel colore del progetto; a lavoro finito il numero diventa verde con ✓. Per gli interventi di configurazione conta i server con «eseguito il» compilato, per gli altri le migrazioni completate. Il tooltip riporta «completati 2/4 server». API: nuovo campo `executed` in `GET /api/events`.

### Modificato
- **Nuova descrizione del progetto**: Date Spreader pianifica e segue qualsiasi tipo di intervento tecnico (migrazioni, upgrade, patching, configurazioni, manutenzioni) su server con qualsiasi sistema operativo, non solo migrazioni e upgrade RHEL. Aggiornati README, metadati del pacchetto e descrizione del servizio.
- **Anche i giorni vuoti del calendario si selezionano con un clic**, come quelli con interventi: il giorno si illumina e si apre l'anteprima vuota («Nessun intervento in questa data»), con i pulsanti «+ Intervento in un progetto esistente» e «Nuovo progetto in questa data».
- **L'oggetto dell'email di condivisione contiene anche lo stato dell'intervento**, in fondo: «Intervento: Cliente · Progetto · 18 nov 2026 21:00 · Confermato».
- **La colonna di stato della tabella server prende il nome dal tipo di intervento**: «Migrazione» per le migrazioni, «Upgrading» per gli upgrade, «Patching» per il patching, «Esecuzione» per «Altro». Cambia anche il filtro della tabella, il riepilogo della scheda («migrati / aggiornati / patchati / completati 2/4») e l'email di condivisione. Cambiando il tipo, la tabella aperta (anche nell'anteprima in basso) si aggiorna da sola, senza ricaricare.

### Corretto
- Nell'anteprima in basso, le modifiche di altri utenti ai dati dell'intervento (tipo, titolo, orario, note) ora aggiornano anche l'intestazione della scheda, non solo le righe della tabella.

## [0.22.0] - 2026-11-11
### Aggiunto
- **Nuovo tipo di intervento «Configurazione»**. La tabella server mostra solo hostname, IP, SO, ambiente, «eseguito il» e tecnico; sotto ogni server c'è una **riga di note a tutta larghezza**, alta due righe e che cresce con il testo (Invio va a capo, si salva uscendo dal campo). Vale nella tabella a tutto schermo, nell'anteprima in basso, nella scheda compatta (note con gli a capo) e nell'email di condivisione. Il riepilogo indica i server eseguiti («eseguiti 1/2»). Cambiando il tipo di un intervento la tabella cambia colonne, i dati restano.
- Pulsante **«+ Intervento»** nella barra dell'anteprima (accanto a sposta-anteprima e ✕, in basso e a destra): crea un intervento nel giorno mostrato, scegliendo il progetto; il modulo ha la data già compilata, come dal tasto destro sul calendario.
- **Tecnico nuovo direttamente dai partecipanti**: in fondo al menu «+ Aggiungi tecnico…» c'è **«+ Nuovo tecnico…»**, che apre un campo per il nome (Invio aggiunge, Esc annulla). Il tecnico viene salvato nel database e compare subito in tutti i menu; se il nome esiste già (anche con maiuscole o spazi diversi) si usa quello, senza doppioni. Funziona nella scheda dell'intervento, nel «Nuovo progetto» e nel modulo dell'intervento, per tutti gli utenti: crea solo il nome, con ruolo tecnico e senza accesso al portale. API: `POST /api/users/technicians`.
- **Zoom del calendario**, come in Blender: **tasto centrale del mouse premuto e mouse avanti/indietro** (avanti ingrandisce), dal 50% al 250%. Il giorno sotto il cursore resta fermo. In alternativa: pizzico sul touchpad e controllo **− % +** nell'angolo in basso a destra del calendario (clic sulla percentuale = 100%). Lo zoom è una preferenza personale. Ctrl + rotellina del mouse resta lo zoom normale della pagina.
- **Lo zoom mostra più informazioni**: rimpicciolendo si vedono più mesi, con gli interventi come barrette colorate; ingrandendo ogni giorno mostra più interventi e, se c'è spazio, anche titolo e orario completo.
- **Export e import tra installazioni di Date Spreader** (es. dal portale aziendale a un'installazione su PC o presso il cliente):
  - **export** di un progetto, o di un **cliente intero** con tutti i suoi progetti, in un file JSON: interventi, tabelle server complete, partecipanti, cliente con il suo colore, versioni SO usate. Dalla scheda progetto («Questo progetto» / «Tutto il cliente») e da Impostazioni → Amministrazione → Clienti («Esporta»). Riservato a coordinatori e amministratori; ogni export resta nella cronologia. Mai password, accessi o cronologia nel file;
  - **import** (amministratori) da Impostazioni → Amministrazione → «Importa progetti», con **anteprima** fedele prima di importare. Clienti, server, tecnici e versioni SO già presenti vengono riconosciuti e riusati, senza modificarne i dati (le differenze sui server sono segnalate). I progetti con lo stesso nome si saltano o si importano come copia «… (importato)». L'import è tutto o niente.
- **Script di installazione** `deploy/install.sh`, **testato su Fedora 44**:
  - installa il portale in `/opt/datespreader` con utente di sistema dedicato, servizio systemd, firewall e primo amministratore;
  - rilanciato, **aggiorna** l'installazione, con un backup del database prima;
  - opzioni per porta, dati di esempio, password temporanea, versione da installare e seconda istanza sulla stessa macchina.
- **Guida di installazione**: `docs/INSTALLAZIONE.md` (in inglese `docs/INSTALL.en.md`), con aggiornamento, backup, HTTPS, disinstallazione e problemi frequenti. In arrivo: installatore guidato, pacchetto RPM e supporto di RHEL 10.2 e Fedora 45.
### Modificato
- Il pulsante **«Oggi»** è al **centro della barra in alto**, blu pieno come il titolo del mese corrente e con un'icona calendario, per trovarlo subito. Su telefono sta accanto al nome del portale.
- Le note di una riga server accettano fino a 20.000 caratteri (prima 2.000).
### Corretto
- Nei giorni con più interventi i riquadri venivano schiacciati e il testo tagliato. Ora ogni giorno sceglie come disegnarli: due righe se c'è spazio, altrimenti solo il nome, e «+N» per quelli che non entrano.

## [0.21.0] - 2026-11-10
### Aggiunto
- **Progetto open source**, rilasciato sotto licenza **GNU AGPL-3.0-only** (file `LICENSE`). Il link al codice sorgente compare nella schermata di accesso e in «Novità»; chi pubblica una versione modificata lo indica con la variabile `SOURCE_URL`.
- **README in inglese** (`README.en.md`).
- **Database di prova** `demo/datespreader-demo.sqlite3`, con i soli dati di esempio e un amministratore demo; si rigenera con `scripts/make_demo_db.py`.
- **Condividi via email** (pulsante «Condividi» su ogni intervento e nella tabella a tutto schermo): prepara un'email formattata con intestazione (cliente, progetto, data, orario, tipo, stato, partecipanti, note), riepilogo e **tabella server completa** con gli stati colorati. «Copia e apri Gmail» la copia negli appunti e apre un nuovo messaggio di Gmail con destinatari (partecipanti) e oggetto già compilati: basta incollare con Ctrl+V. Disponibile anche la copia in testo semplice.
- **Link diretto a un intervento** (`/#intervento-ID`), incluso nell'email: apre il portale su quell'intervento.
- **Scelta dell'account Gmail** per la condivisione via email: campo «Account Gmail (mittente)» nella finestra Condividi e in Impostazioni → Aspetto, ricordato come preferenza personale (prima si usava sempre l'email del profilo, e Gmail apriva l'account personale del browser se non la riconosceva). Opzione «Fammi scegliere l'account Google a ogni invio» per passare dalla scelta dell'account di Google.
- **Logo del portale** in alto a sinistra, prima del nome «Date Spreader» (accanto alla versione), e come icona della scheda del browser.
- Pulsante nella barra dell'anteprima dell'intervento (accanto alla ✕) per spostarla **in basso** o **a destra** al volo; la scelta resta salvata come in Impostazioni → Aspetto.

## [0.20.0] - 2026-11-10
### Aggiunto
- **Colonna «SO target»** nella tabella server di ogni intervento: sistema operativo di destinazione, scelto dallo stesso menu a tendina dell'elenco dei sistemi operativi. È un dato della singola riga, come il kernel target. Compare anche nella scheda compatta («→ RHEL 9.6 · kernel») e nello storico dei server.
- **«+ Aggiungi versione…»** nei menu SO e SO target (amministratori): crea una nuova versione senza uscire dalla tabella. Se ne crei una sola, viene subito impostata nella cella.
- **Più versioni in una volta** («9.5, 9.6, 10.3») sia dal menu sia da Impostazioni → Amministrazione → Sistemi operativi; quelle già presenti vengono segnalate senza bloccare le altre.

### Modificato
- Intestazioni abbreviate: «SO» e «SO target», con il nome completo al passaggio del mouse; i valori mostrano il nome completo («Red Hat Enterprise Linux 9.6») nel tooltip.
- Una versione usata come SO target conta come «in uso»: non si può eliminare, solo disattivare.

### Corretto
- Chiudendo con Esc la tabella a tutto schermo si chiudeva anche l'anteprima dell'intervento, che restava su «Caricamento…».

## [0.19.0] - 2026-11-10
### Aggiunto
- **Tasto destro su un giorno del calendario**: menu con
  - «Nuovo progetto in questa data…» (primo intervento già in quella data);
  - «Nuovo intervento in un progetto esistente…» (scelta del progetto, raggruppati per cliente);
  - «Apri gli interventi del giorno», se ce ne sono.
  Data e orario proposto (9–13, o 14–18 se il giorno è già occupato) sono precompilati.
- Sui dispositivi touch lo stesso menu si apre **tenendo premuto** sul giorno; da tastiera con il tasto Menu o Maiusc+F10 su un giorno selezionato.

## [0.18.0] - 2026-11-10
### Aggiunto
- **Orari a menu, a passi di 30 minuti**, nei moduli «Nuovo progetto» (primo intervento), «Nuovo intervento» e «Modifica», al posto del campo orario del browser.
- **Orario proposto** per un nuovo intervento: **9:00–13:00**, oppure **14:00–18:00** se in quella data c'è già un intervento. Il suggerimento segue i cambi di data finché non si modificano gli orari a mano.
- Se l'ora di inizio supera quella di fine, la fine si sposta in automatico (+4 ore).
- **Formato degli orari** in Impostazioni → Aspetto: **24 ore** (europeo, predefinito) oppure **12 ore AM/PM**. Vale per moduli, calendario e schede.

### Corretto
- Premendo Esc per chiudere una finestra (es. «Modifica intervento») si chiudeva anche l'anteprima dell'intervento sotto.

## [0.17.0] - 2026-11-10
### Aggiunto
- **Cliente nel calendario**: ogni intervento mostra il cliente nella seconda riga («Cliente · ora · N srv») e nel tooltip.
- **Colore per cliente** (Impostazioni → Amministrazione → Clienti): un colore per ogni cliente, usato da tutti i suoi progetti nella colonna progetti, nel calendario e nelle schede. «Automatico» torna ai colori assegnati dal portale; anche i progetti senza cliente li usano.
- Testo leggibile sui colori pieni: scuro sui colori chiari (es. giallo), bianco su quelli scuri.
- Le modifiche ai colori arrivano subito anche ai colleghi, senza ricaricare la pagina.

## [0.16.0] - 2026-11-10
### Aggiunto
- **Eliminazione di un progetto** (scheda progetto → «Elimina progetto»), con tutti i suoi interventi. Il cliente e i server in anagrafica restano.
- **Eliminazione di un intervento anche se contiene server** (da «Modifica» nella scheda dell'intervento, o dal cestino nell'elenco della scheda progetto). Le righe della tabella server vengono tolte; i server restano in anagrafica.
- **Conferma prima di ogni eliminazione**: una finestra elenca cosa verrà eliminato e cosa resta. Per un progetto con interventi bisogna **scriverne il nome** per abilitare il pulsante. Il fuoco parte su «Annulla».
- La cronologia registra ogni eliminazione: chi l'ha fatta, l'intervento e i server che conteneva.

### Modificato
- Permessi: eliminare un progetto, o un intervento che contiene server, è riservato a **coordinatori e amministratori**. I tecnici possono eliminare solo interventi vuoti.

## [0.15.1] - 2026-11-10
### Modificato
- **Date sempre con l'anno** in tutto il portale (es. «15 nov 2026»): riquadri dei progetti, scheda dell'intervento, anagrafica server, risultati di ricerca.
- Sui riquadri dei progetti un tooltip spiega «Prossimo» (prossimo intervento in programma) e «Ultimo» (il più recente, quando non ce ne sono in programma).

### Corretto
- Nella vista a quadrati il nome del cliente copriva icona e nome del progetto: nei quadrati non viene più mostrato (resta nel tooltip, nei rettangoli, nel raggruppamento e nel filtro).
- I nomi lunghi su due righe non vengono più tagliati nei quadrati; nei rettangoli la data non viene più troncata.

## [0.15.0] - 2026-11-10
### Aggiunto
- **Clienti**: ogni progetto può avere un cliente, scelto da menu a tendina nella creazione e nella scheda progetto. Con «+ Nuovo cliente…» lo si crea al volo; i nomi sono unici, senza distinguere maiuscole.
- **Raggruppamento per cliente** nella colonna progetti («Cliente · A → Z» / «Cliente · per data»), con un'intestazione per ogni cliente e «Senza cliente» in fondo.
- **Filtro per cliente** nel pannello Filtri: vale sia per il calendario sia per la colonna progetti.
- Nome del cliente sui riquadri dei progetti e nella scheda dell'intervento. La ricerca nella colonna trova anche il nome del cliente.
- **Gestione clienti** (Impostazioni → Amministrazione → Clienti): rinomina, ed eliminazione dei clienti senza progetti.
- Clienti di esempio nei dati demo; `demo remove` li toglie, salvo quelli assegnati a progetti reali.

## [0.14.0] - 2026-11-10
### Aggiunto
- **Colonna progetti ridimensionabile**: si trascina il bordo destro (frecce ←/→ da tastiera, doppio clic per la larghezza predefinita). Con la colonna più larga i quadrati si dispongono su più colonne.
- **Vista dei progetti**: a **quadrati** o a **rettangoli**, uno per riga con il nome per intero. Si sceglie dai pulsanti in testa alla colonna o da Impostazioni → Aspetto.
- **Ordinamento dei progetti**: **alfabetico** o **per data**. Per data vengono prima i progetti con il prossimo intervento più vicino, poi quelli con soli interventi passati (dal più recente), infine quelli senza interventi.
- Larghezza, vista e ordinamento sono preferenze personali, ricordate sul server.

## [0.13.0] - 2026-11-10
### Aggiunto
- **Impostazioni** (icona ⚙ in alto), la sezione in cui raccogliere configurazioni e personalizzazioni:
  - *Aspetto*, per ogni utente: posizione dell'anteprima e tema;
  - *Amministrazione*, solo per gli amministratori: accesso a Utenti e Sistemi operativi.
- **Anteprima in basso**: in alternativa alla colonna di destra, il dettaglio dell'intervento compare sotto il calendario a tutta larghezza. La colonna dei progetti resta invariata. In basso la tabella server è **completa e modificabile**: 11 colonne, salvataggio automatico, aggiunta e rimozione dei server, filtri, colonne regolabili. Le modifiche dei colleghi arrivano senza toccare le celle in modifica.
- L'altezza dell'anteprima in basso si regola **trascinando il bordo** (o con le frecce ↑/↓) e viene ricordata.
- **Tema** chiaro, scuro o come il sistema.
- Le **preferenze sono personali** e salvate sul server (`/api/me/preferences`): seguono l'utente su qualsiasi computer.

## [0.12.0] - 2026-11-10
### Aggiunto
- **Elenco dei sistemi operativi**: nella tabella server la colonna «Sistema operativo» è un menu a tendina. Versioni iniziali: Red Hat Enterprise Linux 7.9, 8.10, 9.8 e 10.2.
- **Gestione dell'elenco** (amministratori, menu utente → «Sistemi operativi»):
  - nuove versioni minor o major, anche di altre famiglie (es. Rocky Linux), ordinate per numero di versione (10.2 viene dopo 9.8);
  - le versioni superate si **disattivano**: escono dal menu, ma i server le conservano;
  - si elimina solo una voce mai usata.
- Il sistema operativo di un server deve essere una voce attiva dell'elenco. Un valore precedente fuori elenco resta visibile come «(non in elenco)» finché non lo si cambia.

## [0.11.0] - 2026-11-10
### Aggiunto
- **Scheda progetto**: si modificano nome, descrizione e stato (attivo, sospeso, chiuso) e si vede l'elenco dei suoi interventi con stato e numero di server. Si apre dalla matita sul riquadro del progetto o dal pulsante «Progetto» nella scheda dell'intervento. Per i progetti senza interventi basta un clic sul riquadro.
- **Nuovi interventi in un progetto esistente** («+ Nuovo intervento»), con data, tipo, titolo, orari, note e tecnici.
- **Modifica dell'intervento** (pulsante «Modifica»): data, tipo, titolo, orari e note. Spostando la data, le righe server con la stessa data prevista la seguono.
- **Eliminazione di un intervento** creato per errore, solo se non contiene server. Un intervento con server va segnato come «annullato», così lo storico dei server si conserva.
- Le modifiche dei colleghi aggiornano anche il mese di partenza di un intervento spostato o eliminato.

### Corretto
- Sul telefono la barra in alto usciva dallo schermo (dalla 0.9.0, con il menu utente).
- Dopo un aggiornamento il browser poteva usare file JavaScript vecchi dalla cache e mostrare una pagina vuota. Ora i file statici hanno `Cache-Control: no-cache` e vengono ricontrollati a ogni caricamento.

## [0.10.0] - 2026-11-10
### Modificato
- **Il progetto si chiama ora Date Spreader** (prima "Time Dot"). Il nuovo nome compare nell'interfaccia, nella documentazione e nell'API (`/api/version`).
- Nomi tecnici allineati: cartella `DateSpreader`, servizio systemd e utente di sistema `datespreader`, database `data/datespreader.sqlite3`, pacchetto `datespreader`.
- Intestazione anti-CSRF ora `X-Requested-With: datespreader` e cookie di sessione `datespreader_session`. Dopo l'aggiornamento **bisogna accedere di nuovo**.
- Le preferenze salvate nel browser (filtri, larghezza delle colonne) ripartono dai valori predefiniti.

## [0.9.0] - 2026-11-10
### Aggiunto
- **Accesso con login**: schermata di accesso con email o nome utente e password. Tutte le API dei dati richiedono di essere autenticati.
- Sessioni sicure: cookie `HttpOnly`; nel database solo l'hash del token. Scadenza dopo 12 ore di inattività (`SESSION_HOURS`) e comunque dopo 7 giorni.
- Blocco temporaneo dopo 5 tentativi di accesso sbagliati.
- **Gestione utenti** (solo amministratori): creazione, ruolo, nome utente, attivazione e disattivazione, **password temporanea** da cambiare al primo accesso.
- **Cambio password** dal menu utente, con regole minime (10 caratteri, non contenere nome utente o email). Il cambio chiude le altre sessioni aperte.
- Comandi `users list`, `users admin` e `users create-admin` per creare il primo amministratore.
- La **cronologia delle modifiche registra l'autore** di ogni modifica.
- **Versione del portale** visibile in alto e **changelog** consultabile dal portale (`/api/version`, `/api/changelog`).

### Sicurezza
- Protezione CSRF: le richieste che modificano dati devono avere l'intestazione `X-Requested-With: timedot`.
- Impossibile restare senza amministratori: l'ultimo amministratore attivo non può essere disattivato né declassato.
- Un utente disattivato esce subito da tutte le sessioni.

## [0.8.0] - 2026-11-10
### Aggiunto
- **Anagrafica server** (pulsante "Server"): tutti i server, anche quelli non più presenti in un intervento, con ricerca, ultimo e prossimo intervento.
- **Storico degli interventi** di ogni server, con le modifiche ai suoi dati. Dallo storico si apre direttamente l'intervento.
- Suggerimenti dall'anagrafica in "Aggiungi server": un server già inserito si riusa con tutti i suoi dati.
- **Dati di esempio marcati** (`is_demo`), con l'etichetta "ESEMPIO" nell'interfaccia. Nuovi comandi `init --demo`, `demo load` e `demo remove`, che non toccano mai i dati reali.

### Rimosso
- Il comando `seed --reset`, che cancellava tutti i dati, compresi quelli reali.

### Corretto
- **Migrazioni su SQLite**: ricreando una tabella con le chiavi esterne attive, i DELETE a cascata potevano cancellare interventi e righe server. Ora le chiavi esterne sono disattivate durante le migrazioni e alla fine viene verificata l'integrità.
- Iniziali dei progetti con trattini nel nome (es. "Delta - Update" → "MU").

## [0.7.0] - 2026-11-10
### Aggiunto
- Riquadro **"+ Nuovo progetto"** con primo intervento facoltativo.
- **Tecnici** gestiti nel database: aggiunta, modifica e disattivazione (senza cancellazione).
- **Partecipanti** degli interventi scelti da menu a tendina, sia nella scheda sia nella creazione del progetto.

## [0.6.0] - 2026-11-10
### Aggiunto
- **Ricerca** di progetti e server (hostname, IP, sistema operativo) dalla barra laterale.
- **Filtri** del calendario (stato, tecnico, solo con problemi), ricordati nel browser.
- Filtro delle righe nella tabella server a tutto schermo.
- **Stato dell'intervento** modificabile.
- **Aggiornamento automatico** delle modifiche degli altri utenti, ogni 10 secondi.
- **Colonne ridimensionabili** nelle tabelle, con larghezze ricordate.

## [0.5.0] - 2026-11-10
### Aggiunto
- **Tabella server a tutto schermo** con 11 colonne modificabili in linea e salvataggio automatico.
- Aggiunta e rimozione dei server da un intervento.
- **Controllo di concorrenza** (optimistic locking): niente sovrascritture silenziose tra utenti.
- Cronologia delle modifiche (`audit_log`).

## [0.4.0] - 2026-11-10
### Aggiunto
- Clic su un progetto: il calendario va all'intervento, con scelta della data se gli interventi sono più di uno.
- Clic su un giorno: dettaglio degli interventi con la tabella server.

## [0.3.0] - 2026-11-10
### Aggiunto
- Home con **calendario verticale** (mese precedente, corrente e successivo, centrato su oggi) e barra laterale dei progetti.
- Versione per telefono e tema scuro.

## [0.2.0] - 2026-11-10
### Aggiunto
- Schema del database, migrazioni Alembic e dati di esempio.

## [0.1.0] - 2026-11-10
### Aggiunto
- Struttura del progetto (FastAPI + SQLite + frontend senza build), avvio locale, servizio systemd.
