# Roadmap

[English](ROADMAP.md) · Torna al [README](../README.it.md)

Funzioni **proposte** per le prossime versioni di Date Spreader, più o meno nell'ordine consigliato. Sono idee, non
impegni: le priorità cambiano secondo le esigenze di chi usa il portale. Le funzioni già fatte sono nel
[changelog](../CHANGELOG.it.md).

## Prossime consigliate

| Funzione | Perché | Impegno |
|---|---|---|
| **Feed del calendario (ICS)** per tecnico, per Outlook e Google Calendar | Ognuno vede i propri interventi nel suo calendario abituale, aggiornati da soli | basso |
| **Export della tabella server** in Excel/CSV e **report di progetto** (PDF/Excel; il Gantt del cliente c'è già) | Completa l'import da CSV/Excel: un documento per il cliente a fine lavori | medio |
| **«Eseguito il» compilato da solo** quando lo stato di un server diventa «Completata» | Un clic in meno, e la data del lavoro non si dimentica | basso |

## Pianificazione e lavoro quotidiano

| Funzione | Perché | Impegno |
|---|---|---|
| **Colonne configurabili** per progetto o tipo di intervento (nascondere «Kernel», aggiungere campi propri come versione firmware o numero di ticket) | Adatto a qualsiasi sistema operativo e tipo di lavoro, non solo server Linux | medio-alto |
| **Interventi ricorrenti** (es. patching mensile il secondo martedì) | Niente più interventi ricreati a mano ogni mese | medio |
| **Checklist per tipo di intervento** (snapshot, avviso al cliente, verifica servizi…) | Procedure ripetibili da spuntare | medio |
| **Promemoria via email** il giorno prima di un intervento | Nessuno perde una finestra di manutenzione | medio |
| **Allegati** e **commenti** sugli interventi (piani di rollback, log, discussione con autore e data) | Documentazione e comunicazione restano con l'intervento | medio |

## Integrazione e accesso

| Funzione | Perché | Impegno |
|---|---|---|
| **Token per le API** per l'automazione (Ansible, sistemi di ticketing, script) | Es. un playbook di patching segna da solo «Completata» sui suoi server | medio |
| **Accesso aziendale**: LDAP/Active Directory, SSO Microsoft o Google | Nessuna password in più per gli utenti | alto |

## Installazione e piattaforme

| Funzione | Perché | Impegno |
|---|---|---|
| Supporto di **Red Hat Enterprise Linux 10.2** e **Fedora 45** (oggi è testato solo Fedora 44) | Più sistemi su cui installare il portale | medio |
| **Installatore guidato** e **pacchetto RPM** (`dnf install datespreader`, anche senza rete) | Installazioni più semplici, anche senza accesso a Internet | medio-alto |
| **Immagine Docker** | Provare il portale in un minuto su qualsiasi sistema | basso-medio |
| **App Android** (o un'app web installabile, PWA), partendo dal riepilogo per smartphone | Controllo veloce degli interventi fuori ufficio, con l'icona sul telefono | medio |

## Prima l'inglese

| Funzione | Perché | Impegno |
|---|---|---|
| **Dati demo in inglese** | La prima impressione di chi prova il portale da GitHub | basso |
| **Messaggi dello script di installazione in inglese** (con l'italiano come seconda lingua) | Le stesse lingue del portale | basso |
| **Commenti del codice in inglese** | Contributi più facili per gli sviluppatori di tutto il mondo | medio |
