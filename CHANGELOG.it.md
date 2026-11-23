# Changelog

Tutte le modifiche rilevanti del portale Date Spreader.
Formato: [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) · Versioni: [Semantic Versioning](https://semver.org/lang/it/).
Versione inglese: [CHANGELOG.md](CHANGELOG.md).

## [Non rilasciato]
### Aggiunto
- **Note nei colori del check**: la nota di un server che contiene FAIL (rosso) o WARNING (giallo) — parole intere, maiuscole o minuscole — ha la cella nei colori di quell'esito del check, nella tabella a tutto schermo, nell'anteprima in basso e nella tabella compatta, anche mentre scrivi. Nuovo suggerimento del giorno.
- **Check «Attenzione»** (in inglese «Warning»), in giallo, tra OK e FAIL: un check fatto con qualcosa da tenere d'occhio. Compila «check eseguito il», non conta come check pre-intervento mancante, compare nei riepiloghi («check Attenzione N»), in «Solo con problemi» e tra le selezioni rapide di «Condividi».
- **Condivisione modulare**: in «Condividi» spunti i server da mettere nell'email («Tutti», «Nessuno», un clic sugli stati del lavoro e sugli esiti del check, combinabili; ricerca), per aggiornare il cliente man mano che il lavoro procede; con meno server l'oggetto dice «(aggiornamento parziale: N server)» e il riepilogo «Server condivisi: N di M». **Note**: nessuna per default; si spuntano le note dell'intervento e si scelgono quelle dei server (nessuna, tutte, server per server). Nuovo suggerimento del giorno.
- **Ordinare i server di un intervento** per qualsiasi colonna (clic sull'intestazione, di nuovo per invertire), nella tabella a tutto schermo, nell'anteprima in basso e nella tabella compatta a destra. L'ordine è salvato sull'intervento (`events.server_sort`, migrazione `b80a7d0e4efb`) ed è uguale per tutti: i colleghi lo vedono entro pochi secondi, i server aggiunti dopo si mettono al loro posto, l'email lo segue, «Duplica» lo mantiene. Testi alfabetici, IP numerico, SO e kernel naturali, date cronologiche, stati nell'ordine del lavoro, valori vuoti in fondo. API: `server_sort` in `PATCH /api/events/{id}`. Nuovo suggerimento del giorno.
- Colonna **SteamRoller Inventory** nella tabella server, dopo Location: l'inventario SteamRoller a cui appartiene la macchina, dato del server (uguale in tutti i suoi interventi), testo libero con i valori già usati proposti in un menu a tendina. Anche nell'anagrafica server (colonna, ordinamento, scheda, Modifica, ricerca), nell'anteprima compatta, nell'email di condivisione, nel riepilogo da telefono, nell'import da CSV/Excel (intestazioni «SteamRoller», «Inventory», «Inventario»), in export/import e sincronizzazione (solo se compilato: gli altri server non risultano cambiati). Database: `servers.steamroller_inventory` (migrazione `1e04dba1541e`). API: `inventories` in `GET /api/options`. Nuovo suggerimento del giorno.
- **Anteprima più grande**: con l'anteprima sotto il calendario, «⇔» nella sua barra la allarga quanto la finestra (la colonna progetti finisce sopra; preferenza personale `detail_full_width`); «⛶» nella stessa barra mostra l'anteprima a schermo intero sopra calendario e colonna progetti (un altro clic o Esc la riporta com'era). Con l'anteprima in basso, «Tutto schermo · modifica» non compare più tra i pulsanti dell'intervento (lì la tabella si modifica già direttamente). Nuovo suggerimento del giorno.

### Corretto
- Tabella server a tutto schermo: con molte colonne l'ultima (Note) poteva ridursi a pochi pixel; ora tiene sempre almeno 140 px (la tabella scorre in orizzontale).

### Modificato
- Le intestazioni sottolineate della tabella server (dati del server) mostrano la manina del clic, come le altre intestazioni ordinabili, invece del punto interrogativo; il tooltip continua a spiegarle.
- Il check **OK e KO ora si chiamano PASS e FAIL**, come gli esiti del check di SteamRoller (i valori salvati non cambiano). **In corso** è azzurro chiaro (prima ambra), così il giallo resta per gli avvisi: etichette, menu di stato, Gantt, email ed Excel.
- **Rinviato in viola**: lo stato «Rinviato»/«Rinviata» di interventi e righe server ha ora un colore viola suo (prima era ambra come «In corso»), ben visibile in mezzo ai completati: etichette, menu di stato della tabella server, Gantt (barra, blocchi, legenda), email di condivisione ed Excel.

## [0.30.0] - 2026-11-17
> Vedi chi sta lavorando sul portale prima di un riavvio, avvisi tutti con un messaggio e controlli le nuove versioni quando vuoi.

### Aggiunto
- **Utenti connessi**: pulsante con un mezzo busto e il numero degli utenti connessi accanto a «Gantt»; un clic li elenca con lo stato (attivo / aperto in secondo piano), cosa stanno facendo e chi **sta modificando** (finestra aperta, cella in modifica); browser e IP per gli amministratori. **Avviso a tutti** dallo stesso elenco (amministratori): un banner in cima a ogni pagina aperta entro pochi secondi, per il tempo scelto o fino al riavvio. Riga di comando: `who`, `wait-idle`; RPM: `datespreader who`, `datespreader restart --when-idle`. API: `/api/presence`, `/api/presence/notice`. Nuovo suggerimento del giorno.
- **Controlla aggiornamenti ora** (amministratori): Impostazioni → Amministrazione → «Aggiornamenti» mostra la versione installata, l'ultima su GitHub, l'ultimo controllo e perché GitHub non è raggiungibile, con «Controlla ora» (salta la memoria di 6 ore; al massimo ogni 10 secondi); anche menu utente → «Controlla aggiornamenti». L'opzione «nuove versioni» è passata lì da Aspetto. `GET /api/updates` restituisce anche `checked_at`, `error`, `full_version`.

### Documentazione
- Il vecchio nome del progetto non compare più nelle guide, nei README e nel changelog.

### Modificato
- Barra in alto su schermi medi: «Lun–Ven» mostra solo l'icona sotto i 1700 px e il menu utente solo le iniziali sotto i 1500 px, così la barra sta su una riga da 1100 a 1920 px.

## [0.29.0] - 2026-11-17
> Pianifichi il check prima di un patching senza un secondo intervento, vedi subito quali server non sono aggiornati e i dati dei server restano giusti a fine lavoro.

### Aggiunto
- **Check pre-intervento** (es. il giorno prima di un patching), senza un secondo intervento: giorno (proposto: il giorno lavorativo prima), orario e tecnici del check nella finestra dell'intervento. Voce gialla «CHECK» (colore suo, striscia nel colore del progetto, simbolo della cartellina) con progetto, titolo dell'intervento, avanzamento del check e «→ giorno» dell'intervento nel calendario e nella vista Tecnici; l'intervento mostra il simbolo con il giorno del suo check; passando il mouse su uno si illuminano tutti e due; l'anteprima del giorno del check mostra in cima «Check pre-intervento di questo intervento» con il link all'intervento, e la scheda il link al giorno del check; riga gialla sua nel Gantt e nel suo Excel (ore: «Ore effettive del check», altrimenti il suo orario; comprese nelle ore di progetti, commesse e totale, «di cui check», e nelle ore dei tecnici del check); i conflitti dei tecnici comprendono i check. «Check eseguito il» compilato quando il check di un server diventa OK o KO. Avviso (icona nel calendario, riga gialla nella scheda) quando il giorno del check è passato e ci sono server con check da fare o KO. Il check segue l'intervento quando viene spostato o duplicato, e viaggia con export/import e sincronizzazione (solo se pianificato, così gli altri interventi non risultano cambiati). Database: `events.check_date`, `check_start_time`, `check_end_time`, tabella `event_check_users`, `event_servers.check_executed_date`, `events.check_worked_hours` (migrazioni `1f0b9884c6a3`, `1222992c1c85`). API: `PATCH /api/events/{id}` (campi del check), `PUT /api/events/{id}/check-participants`; `GET /api/events` restituisce anche voci `kind: "check"`.
- **Lavoro completato su un server**: «Eseguito il» si compila con la data di oggi quando lo stato di una riga diventa «Completata» e la data è vuota (lo fa il server: anche via API). Se SO target o kernel target sono diversi da quelli attuali, una barra verde sopra la tabella server propone «Aggiorna i dati del server» (una sola barra per tutti i server appena completati, «Aggiorna tutti» / «Lascia così»). Nuovo suggerimento del giorno.
- **Sistemi operativi non aggiornati in giallo**: per ogni famiglia e major un amministratore indica la minor aggiornata (Impostazioni → Amministrazione → Sistemi operativi → «Versioni aggiornate»; all'inizio RHEL 7.9, 8.10, 9.8, 10.3). I server con una minor più vecchia hanno il SO evidenziato in giallo, con la versione aggiornata nel tooltip, nell'anagrafica server (elenco, scheda, statistiche), nell'anteprima dell'intervento e nella tabella a tutto schermo. API: `GET`/`PUT /api/os-baselines` (salvate in `app_meta`, nessuna migrazione). Nuovo suggerimento del giorno.


## [0.28.0] - 2026-11-17
> Un suggerimento al giorno per scoprire il portale poco alla volta, e gli amministratori vengono avvisati delle nuove versioni appena escono.

### Aggiunto
- **Avviso di nuova versione** (amministratori): il server controlla l'ultima release su GitHub (API pubblica, anonima, memorizzata per 6 ore, silenzioso senza Internet); se è più nuova, un indicatore verde ↑ sulla versione e, all'avvio, un riquadro con le novità principali, il link e il comando per aggiornare questa installazione (RPM, script o git). «Ignora questa versione»; si disattiva per l'utente dalle Impostazioni o per l'installazione con `UPDATE_CHECK=false` (`UPDATE_REPO` per un fork). API: `GET /api/updates` (amministratori). Preferenze `update_notice`, `update_dismissed`.
- **Suggerimento del giorno**: una volta al giorno, un piccolo riquadro in basso a destra con un consiglio su una funzione del portale (49 suggerimenti, in inglese e italiano, alcuni solo per amministratori), a rotazione così che ogni utente li veda tutti; ‹ › per scorrerli, «Mostrami» per aprire la schermata di cui parla, «Non mostrare più» (si riattiva da Impostazioni → Aspetto; anche dal menu utente). Non compare nel giorno della finestra delle novità. Preferenze `tips`, `tips_last_day`, `tips_seen`.


## [0.27.0] - 2026-11-16
> L'anagrafica server diventa un posto dove lavorare: modifichi ed elimini i server, ordini le colonne, li dividi per cliente e vedi quali versioni dei sistemi operativi hai.

### Aggiunto
- **Novità dopo un aggiornamento**: la prima volta che ogni utente apre il portale dopo un aggiornamento, una finestra mostra le modifiche della nuova versione (da questo changelog, nella lingua dell'utente, con il suo messaggio in cima). «Non mostrare più le novità dopo gli aggiornamenti» la disattiva; si riattiva da Impostazioni → Aspetto (preferenze `whats_new`, `whats_new_seen`).
- Anagrafica server: menu **Cliente** (tutti, divisi per cliente con un'intestazione per cliente, senza cliente, un cliente) e piccolo riquadro **Sistemi operativi** in basso a destra con il conteggio delle versioni dei SO dei server elencati; visibile di default, si nasconde con la sua ×, con il pulsante «Statistiche SO» o dalle Impostazioni (preferenza `inventory_os_stats`). API: `customer_id` e `customers` in `GET /api/servers`.
- Anagrafica server: **ordinamento** con un clic sull'intestazione di una colonna (hostname, IP, SO, ambiente, location, kernel, interventi, ultimo, prossimo), un altro clic lo inverte; IP in ordine numerico, versioni in ordine naturale, valori vuoti in fondo.
- Anagrafica server: **Modifica** di un server (hostname, IP, sistema operativo, ambiente, location, kernel attuale) dalla sua scheda; la modifica vale in tutti i suoi interventi, passati e futuri. **Elimina** un server che non è in nessun intervento (altrimenti è rifiutato, con il numero di interventi). API: `PATCH` e `DELETE /api/servers/{id}`.

### Corretto
- Menu dei clienti nella colonna dei progetti: con il tema scuro l'elenco aperto mostrava i nomi dei clienti in testo chiaro su sfondo bianco (illeggibili). Ora le voci usano i colori del tema.
- Dopo l'aggiornamento del pacchetto RPM il browser poteva continuare a usare il JavaScript della versione precedente (mancavano le novità, per esempio lo zoom orizzontale e la data di rilascio in alto) finché non si svuotava la cache: i pacchetti costruiti nello stesso giorno danno ai file la stessa data e lo Starlette di RHEL 10 confermava la copia vecchia. Ora i file statici si verificano solo con l'ETag, che cambia a ogni versione installata.

### Documentazione
- Guide di installazione allineate ai pacchetti RPM: download e verifica del checksum dell'RPM, server senza Internet → RPM, prova dell'RPM su Fedora 44 descritta con precisione; README e roadmap non indicano più RPM e RHEL 10.2 come «in arrivo».

## [0.26.0] - 2026-11-16
### Corretto
- Colonna dei progetti: un intervento di **oggi** già *Completato* o *Annullato* non è più evidenziato come futuro, e «Prossimo» passa al successivo.
- RPM: il file del servizio firewalld non era un XML valido (due trattini in un commento) e impediva l'avvio di firewalld; corretto nella 0.25.0-2, e i file del pacchetto ora sono controllati dai test (`tests/test_packaging.py`, eseguiti anche durante la build dell'RPM).

### Aggiunto
- **Larghezza del calendario con il tasto centrale del mouse**: oltre ad avanti/indietro (altezza dei giorni), spostando il mouse **a destra/sinistra** con il tasto centrale premuto il calendario si allarga (dal 100% al 250%, con scorrimento orizzontale; titoli dei mesi e controlli dello zoom restano visibili) o si restringe (fino al 60%, centrato). Ogni direzione parte dopo qualche pixel, così un gesto verticale non cambia la larghezza per sbaglio. La larghezza è una preferenza personale (`calendar_zoom_x`); l'indicatore dello zoom la mostra quando non è al 100% («100% · ↔150%») e un clic riporta altezza e larghezza al normale.
- **Pulsante «Calendario»** al centro dell'intestazione del Gantt e dell'anagrafica server, nello stile di «Oggi» / «Mese»: torna al calendario (come «Chiudi» ed Esc).
- **Calendario: stato, commessa e tecnici sugli interventi.** Ogni giorno mostra i suoi interventi nella forma più ricca in cui stanno tutti: nome → + avanzamento, cliente e ora → + **stato** (etichetta colorata) e **commessa** → + titolo e orario completo → + **tecnici** (partecipanti e assegnati ai server). Con più interventi nello stesso giorno, o con il calendario rimpicciolito (tasto centrale del mouse, pizzico, − / +), le righe in più spariscono; ingrandendo ricompaiono. Nella vista settimanale stato e commessa hanno una riga loro.
- **Sincronizzazione di un cliente tra due installazioni** (Impostazioni → Amministrazione → *Sincronizza un cliente*, amministratori): esporti il cliente sull'altra installazione, scegli il file qui e ottieni un **report delle differenze** raggruppato per progetto (campo per campo, righe server comprese) prima che cambi qualcosa. Ogni voce è segnata *modificato là*, *modificato qui*, *conflitto* (modificato da entrambe le parti: scegli tu), *nuovo*, *cancellato là*, *cancellato qui* o *solo qui*; le modifiche fatte dall'altra parte sono già selezionate, le cancellazioni avvengono solo se le spunti. *Applica* fa prima un backup (`…-pre-sync.sqlite3`) e scrive tutto in un'unica transazione, registrata nella cronologia. Le due installazioni ricordano l'ultimo stato concordato (che viaggia anche nel file esportato), quindi la sincronizzazione funziona nei due sensi e riconosce chi ha cambiato cosa. API: `POST /api/sync/preview`, `POST /api/sync/apply`. Database: progetti e interventi hanno un `sync_uid`, uguale su tutte le installazioni (le righe esistenti lo ricevono dal loro id e dall'ora di creazione, così le copie dello stesso database coincidono), più le tabelle `app_meta`, `sync_baselines`, `sync_peers` (migrazione `b7a9629f1729`). I file esportati portano queste identità; il ripristino di un backup dà all'installazione una nuova identità di sincronizzazione.
- **Pacchetti RPM per RHEL 10.3+ (con EPEL) e Fedora 44+**, allegati alla release su GitHub; guida: [docs/INSTALLAZIONE-RPM.md](docs/INSTALLAZIONE-RPM.md). Provato su RHEL 10.3 (installazione, aggiornamento, ripristino di un database esistente, sincronizzazione con un'altra installazione): `packaging/rpm/` (spec, unità systemd, sysusers, servizio firewalld, comando di amministrazione `datespreader`, `build.sh` con mock o rpmbuild). Usa il Python 3.12 di sistema e i pacchetti python3-* di RHEL ed EPEL, senza nulla incluso; codice in `/usr/lib/datespreader`, configurazione in `/etc/datespreader/datespreader.env`, dati e backup in `/var/lib/datespreader`. I test passano con le versioni di RHEL 10.3 + EPEL (Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Alembic 1.13). Nuova impostazione `DATESPREADER_CONFIG`: percorso del file di configurazione (predefinito: il `.env` del progetto).
- **Banner** in cima ai README e immagini del progetto in `docs/images/branding/` (wallpaper, anteprima social).
- **Schermate** nei README (`docs/images/screenshots/`): calendario, anteprima, tabella server, Gantt, vista Tecnici, tema scuro.
- `scripts/make_screenshots.py`: screenshot per i README (calendario, anteprima, tabella server, Gantt, vista Tecnici, tema scuro; inglese e italiano), presi da un'istanza temporanea con i soli dati di esempio. Richiede Playwright.
- Dati di esempio: alcuni server hanno una Location (DC1, DC2, Sede Gamma).


## [0.25.0] - 2026-11-13
### Modificato
- **L'ordinamento «Per data» della colonna progetti è ora cronologico**, dall'alto verso il basso, in base al primo intervento di ogni progetto (prima: i progetti con interventi futuri in testa, poi quelli con soli interventi passati), così con i progetti espansi le date vanno in ordine crescente. Gli interventi dello stesso giorno sono in ordine di orario.

### Aggiunto
- **Gantt per cliente** (pulsante «Gantt» in alto): vista a tutto schermo di un cliente (quello del filtro clienti, o tutti) in un periodo, con scorciatoie (questo mese, mese scorso + questo, 3 mesi, tutto il cliente). Riepilogo di interventi e stati, commesse, macchine, ore, ore-uomo e tecnici; un gruppo per commessa (richiudibile), i suoi progetti come barre dal primo all'ultimo intervento e ogni intervento nel suo giorno colorato per stato, con tecnici, ore, ore-uomo, macchine e stato accanto a ogni riga; un clic apre l'intervento. Sotto, le ore per tecnico e commessa. Stampabile in orizzontale (anche in PDF) e scaricabile in Excel (Gantt, ore per tecnico, riepilogo). Ore = ore effettive se inserite, altrimenti fine − inizio; ore-uomo = ore × tecnici. API: `GET /api/reports/gantt` e `/api/reports/gantt.xlsx`.
- **«Ore effettive» sull'intervento** (facoltative, nel modulo dell'intervento): se inserite, sostituiscono fine − inizio nel Gantt e nei suoi totali. Esportate e importate tra installazioni. Database: nuova colonna `events.worked_hours` (migrazione `30f9aa5e1df9`). API: `worked_hours` sugli interventi.
- **Progetti espandibili nella colonna progetti**: la freccia su un progetto mostra sotto di esso i suoi interventi (data, titolo, stato, orario, commessa, numero di server; i futuri hanno la data nel colore del progetto, i passati sono attenuati); un clic su uno lo apre, e l'intervento aperto nell'anteprima resta evidenziato. Il pulsante accanto al menu dell'ordinamento espande o comprime tutti i progetti visibili. Funziona con quadrati e rettangoli, raggruppamento per cliente, ricerca e filtro cliente; i progetti espansi vengono ricordati nel browser. API: `start_time`, `end_time` e `order_code` sugli interventi di `GET /api/projects`.
- **Commessa modificabile dall'anteprima** (a destra o in basso): un clic su «Commessa …» accanto al nome del cliente, o su «+ Commessa», apre un campo con le commesse del cliente in un menu a tendina; Invio o l'uscita dal campo salvano (il campo vuoto la toglie), Esc annulla.
- **Commessa su ogni intervento**, memorizzata sul cliente: nel modulo dell'intervento (nuovo, modifica e primo intervento di un nuovo progetto) il campo «Commessa» propone le commesse del cliente in un menu a tendina; un codice nuovo viene memorizzato sul cliente e proposto da quel momento (lo stesso codice con maiuscole diverse = stessa commessa). Compare accanto al nome del cliente nella scheda dell'intervento, nell'intestazione della tabella a tutto schermo, nell'email di condivisione (anche nell'oggetto), nella vista settimanale e nei tooltip del calendario, nella vista Tecnici e nel riepilogo da smartphone. Copiata da «Duplica», esportata e importata tra installazioni. Un progetto senza cliente non può avere una commessa. Database: nuova tabella `customer_orders` e colonna `events.order_id` (migrazione `bf5644296b5d`). API: `order_code` sugli interventi, `GET /api/customers/{id}/orders`.
- **Colonna «Location»** nella tabella server (dove si trova il server: sede, datacenter, sala…), dopo «Ambiente», anche negli interventi di configurazione. È un dato del server, comune a tutti i suoi interventi e conservato in anagrafica. Le location già usate vengono proposte in un menu a tendina, e se ne può scrivere una nuova. Compare anche nella scheda dell'intervento, nell'email di condivisione, nell'anagrafica server (anche nella ricerca) e nel riepilogo da smartphone, ed è riconosciuta dall'import da CSV/Excel (titoli location, site, sede, datacenter…). Esportata e importata tra installazioni. Database: nuova colonna `servers.location` (migrazione `f5834fb4d654`). API: `locations` in `GET /api/options`.
- **Filtro per cliente sempre a portata di mano**: un menu clienti in cima alla colonna progetti (con il colore del cliente e ✕ per toglierlo) e, quando un cliente è scelto, un'etichetta colorata «Cliente: … ✕» in cima al calendario e alla vista Tecnici. Il cliente si sceglie anche con un clic sulla sua intestazione o sul suo nome nella colonna progetti, con il tasto destro su un intervento («Mostra solo …») o con un clic sul nome del cliente nella scheda dell'intervento. Calendario, vista Tecnici, colonna progetti e anteprima del giorno (a destra o in basso) mostrano allora solo quel cliente; l'anteprima indica quanti interventi di altri clienti sono nascosti, con «Mostra tutti i clienti». La scelta è la stessa del pannello Filtri e viene ricordata.

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
- **Il progetto prende il nome Date Spreader**. Il nome compare nell'interfaccia, nella documentazione e nell'API (`/api/version`).
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
- Protezione CSRF: le richieste che modificano dati devono avere l'intestazione `X-Requested-With` del portale.
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
