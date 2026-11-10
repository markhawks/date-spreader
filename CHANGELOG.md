# Changelog

Tutte le modifiche rilevanti del portale Date Spreader (fino alla 0.9.0 chiamato "Time Dot").
Formato: [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) · Versioni: [Semantic Versioning](https://semver.org/lang/it/).

## [Non rilasciato]

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
