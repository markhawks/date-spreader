# Time Dot — Specifica iniziale per Code

## 1. Obiettivo
Realizzare un portale web multiutente per pianificare e seguire migrazioni e upgrade di server, soprattutto Red Hat, sostituendo l'attuale Google Sheet condiviso. Il foglio esistente sarà una fonte di importazione iniziale, non il database definitivo.

## 2. Problemi attuali
- Calendario annuale sviluppato orizzontalmente: richiede scorrimento laterale per trovare date e progetti.
- Un progetto per riga; celle colorate sulle date con i nominativi dei partecipanti.
- Ogni evento contiene un elenco di server e dati tecnici, spesso copiati manualmente dalle email Gmail del cliente.
- Più colleghi aggiornano lo stato dei check iniziali e delle migrazioni.
- Ricerca dei progetti, navigazione e modifica dei dati troppo macchinose.

## 3. Esperienza utente richiesta
### Home / calendario
- Calendario **verticale**, con scorrimento dall'alto verso il basso, non una griglia annuale orizzontale.
- All'apertura centrare automaticamente il **mese corrente**, mostrando come contesto **mese precedente, mese corrente e mese successivo** (tre mesi).
- Giorni con interventi evidenziati; selezionando una data mostrare eventi e server associati.
- Navigazione verso altri mesi senza perdere i filtri.

### Barra laterale progetti
- Elenco di progetti in riquadri/icone quadrate, laterale (posizione configurabile in futuro).
- Ricerca rapida dei progetti.
- Cliccando un progetto, **il calendario scorre automaticamente alla data dell'intervento associato** e lo evidenzia.
- Se un progetto ha più interventi in date diverse, mostrare una scelta o un elenco delle date, evitando di presumere una sola data per progetto.
- Accesso diretto dal progetto alla scheda con interventi e server.

### Scheda intervento e tabella server
- Ogni intervento di migrazione/upgrade è associato a un progetto e a una data.
- Tabella server con numero variabile di righe; colonne predefinite e possibilità futura di colonne aggiuntive configurabili.
- Campi candidati: hostname, IP, sistema operativo, ambiente (DEV/TEST/PROD o altro), kernel attuale, kernel target, data prevista/effettiva, stato check, stato migrazione, tecnico assegnato, note.
- Modifica rapida **direttamente in tabella** senza aprire un modulo per ogni macchina; prevedere incolla multiplo e operazioni massive come miglioramenti successivi.
- Stati distinti per check iniziale e migrazione, con cronologia delle modifiche.
- Partecipanti/tecnici associati all'intervento.

## 4. Modello dati proposto
- `projects`: id, nome, descrizione, stato.
- `events`: id, project_id, data/ora inizio e fine (opzionali), tipo intervento, note, stato.
- `servers`: id, hostname, ip, sistema_operativo, ambiente, kernel_attuale, altri attributi stabili.
- `event_servers`: id, event_id, server_id, kernel_target, stato_check, stato_migrazione, data_esecuzione, note; un server può essere coinvolto in più eventi.
- `users`: id, identità aziendale, nome, ruolo.
- `event_users`: associazione tra interventi e partecipanti.
- `audit_log`: utente, timestamp, record, campo, vecchio/nuovo valore.
- Colonne personalizzabili: definizioni dei campi e valori associati, da progettare senza alterare arbitrariamente lo schema SQL a runtime.

## 5. Tecnologia e hosting
- **Prototipo:** frontend HTML/CSS/JavaScript; backend Python FastAPI; SQLite come database iniziale.
- Carico stimato: fino a circa **300 server**, con un piccolo gruppo di utenti contemporanei.
- SQLite è adeguato come punto di partenza per letture concorrenti e scritture brevi; abilitare WAL, transazioni, busy timeout, backup e controllo di concorrenza. Le scritture SQLite restano serializzate.
- Isolare l'accesso ai dati (repository/ORM e migrazioni schema) per consentire eventuale passaggio a PostgreSQL senza riscrivere la logica applicativa.
- Il database SQLite deve stare su disco locale del server applicativo, **non su una cartella condivisa di rete**.
- Accesso multiutente tramite un server web centrale; non basta distribuire il file SQLite.
- **Hosting definitivo non ancora deciso**: preferenza per dati non esposti pubblicamente; verificare ambiente aziendale, VPN o soluzione di accesso approvata. Nessuna esposizione Internet senza autorizzazione e controlli adeguati.
- Autenticazione individuale e autorizzazioni; valutare SSO Google Workspace aziendale solo dopo verifica dei requisiti.

## 6. Importazione e integrazioni
- Importazione una tantum da copia/esportazione del Google Sheet esistente; mappatura, anteprima e validazione prima dell'import.
- In futuro: importazione assistita da email Gmail aziendali, con autorizzazioni, revisione umana e deduplicazione; non accedere alle email senza consenso e configurazione esplicita.
- Non inserire dati reali dei clienti nel prototipo: usare dati sintetici.

## 7. Requisiti multiutente e sicurezza
- Modifiche persistenti e condivise, aggiornamento della vista dopo i salvataggi.
- Prevenire sovrascritture silenziose tramite versionamento dei record / optimistic locking; avviso quando un dato è cambiato.
- Log di audit e backup periodici, ripristino verificabile.
- HTTPS e accesso limitato agli utenti autorizzati nella futura distribuzione.
- Hostname e IP dei clienti sono dati infrastrutturali da proteggere anche se non contengono password.

## 8. MVP: ordine di implementazione per Codex
1. Creare struttura del progetto e istruzioni di avvio locale.
2. Implementare schema database, migrazioni e seed con **3 progetti, 4 eventi, 10 server fittizi**.
3. Creare home responsive: sidebar progetti + calendario verticale a tre mesi centrato sul mese corrente.
4. Implementare click su progetto → scroll automatico all'evento; click sul giorno → dettaglio interventi.
5. Implementare scheda evento con tabella server editabile inline, aggiunta/rimozione righe e salvataggio tramite API.
6. Aggiungere ricerca, filtri, stati e controlli di concorrenza.
7. Scrivere test automatici di API e modello dati e una breve guida per il collaudo manuale.
8. Solo dopo validazione UI: importazione da Sheets, login aziendale e deployment.

## 9. Criteri di accettazione MVP
- All'avvio compare il mese corrente con il precedente e il successivo; si scorre verticalmente.
- Il click su un progetto porta alla data del relativo intervento, con comportamento definito anche per progetti con più date.
- Il click su un giorno con evento apre il dettaglio e la lista server.
- È possibile aggiungere, modificare e rimuovere righe della tabella senza dover aprire una scheda separata per ciascun server.
- Le modifiche sopravvivono al riavvio dell'applicazione.
- Due utenti non possono sovrascrivere silenziosamente la stessa modifica.
- L'MVP usa solo dati fittizi e funziona localmente.

## 10. Questioni ancora aperte
- Hosting definitivo e modalità di accesso senza esposizione non autorizzata.
- Numero reale di colleghi attivi contemporaneamente.
- Colonne obbligatorie e stati definitivi della tabella.
- Selezione della data quando un progetto ha più interventi.
- Eventuali permessi per ruolo, integrazione Gmail e formato del foglio da importare.

## 11. Istruzione operativa per Code
Realizza **prima l'MVP locale funzionante**, evitando infrastrutture cloud, login reale e integrazioni Gmail premature. Mantieni il codice modulare, configura le impostazioni tramite variabili d'ambiente, documenta come avviare e testare l'app. Non usare informazioni reali di clienti. Se emergono scelte non definite, applica default semplici e documentali senza bloccare il prototipo.
