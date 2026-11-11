// Translations for serverimport.js. Format: see static/js/i18n.js.
export default {
  "en": {
    "serverimport.title": "Import servers",
    "serverimport.close": "Close",
    "serverimport.cancel": "Cancel",
    "serverimport.intro": "Add many servers at once: choose a CSV or Excel (.xlsx) file, or copy the rows from a spreadsheet and paste them here. Columns are recognised from their names (hostname, IP, OS, environment, kernel, technician, notes…) and can be changed below. Nothing is saved until you press Import.",
    "serverimport.drop": "Choose a file (.csv, .xlsx) or drop it here",
    "serverimport.or": "or",
    "serverimport.paste_placeholder": "Paste the rows copied from Excel or another spreadsheet (with or without the header row)",
    "serverimport.paste_label": "Rows to import",
    "serverimport.read_error": "The file could not be read.",
    "serverimport.has_header": "The first row contains the column names",
    "serverimport.update_existing": "Update the data of servers already in the inventory",
    "serverimport.update_existing_hint": "Without this option, servers already in the inventory are added to the intervention with their current data; differences are only shown.",
    "serverimport.columns": "Columns",
    "serverimport.column_n": "Column {n}",
    "serverimport.ignore": "— ignore —",
    "serverimport.total_new": {
      "one": "1 new server",
      "other": "{n} new servers"
    },
    "serverimport.total_existing": {
      "one": "1 server from the inventory",
      "other": "{n} servers from the inventory"
    },
    "serverimport.total_updated": {
      "one": "1 server updated",
      "other": "{n} servers updated"
    },
    "serverimport.total_skipped": {
      "one": "1 skipped",
      "other": "{n} skipped"
    },
    "serverimport.total_errors": {
      "one": "1 with errors",
      "other": "{n} with errors"
    },
    "serverimport.nothing": "Nothing to import.",
    "serverimport.unknown_os": "Operating systems not in the list (left empty): {list}. An administrator can add them in Settings → Administration → Operating systems, then preview again.",
    "serverimport.unknown_users": "Technicians not found (left empty): {list}.",
    "serverimport.th.line": "Row",
    "serverimport.th.hostname": "Hostname",
    "serverimport.th.result": "Result",
    "serverimport.th.details": "Details",
    "serverimport.status.added_new": "New",
    "serverimport.status.added_existing": "From inventory",
    "serverimport.status.updated": "Updated",
    "serverimport.status.skipped": "Skipped",
    "serverimport.status.errors": "Error",
    "serverimport.diff": "{field}: inventory “{current}”, file “{file}”",
    "serverimport.import_none": "Import",
    "serverimport.import_n": {
      "one": "Import 1 server",
      "other": "Import {n} servers"
    },
    "serverimport.done": {
      "one": "1 server imported.",
      "other": "{n} servers imported."
    },
    "serverimport.field.hostname": "Hostname",
    "serverimport.field.ip_address": "IP",
    "serverimport.field.operating_system": "OS",
    "serverimport.field.environment": "Environment",
    "serverimport.field.current_kernel": "Current kernel",
    "serverimport.field.target_operating_system": "Target OS",
    "serverimport.field.target_kernel": "Target kernel",
    "serverimport.field.assigned_user": "Technician",
    "serverimport.field.notes": "Notes"
  },
  "it": {
    "serverimport.title": "Importa server",
    "serverimport.close": "Chiudi",
    "serverimport.cancel": "Annulla",
    "serverimport.intro": "Aggiungi tanti server in una volta: scegli un file CSV o Excel (.xlsx), oppure copia le righe da un foglio di calcolo e incollale qui. Le colonne si riconoscono dal nome (hostname, IP, SO, ambiente, kernel, tecnico, note…) e si possono cambiare qui sotto. Non viene salvato nulla finché non premi Importa.",
    "serverimport.drop": "Scegli un file (.csv, .xlsx) o trascinalo qui",
    "serverimport.or": "oppure",
    "serverimport.paste_placeholder": "Incolla le righe copiate da Excel o da un altro foglio di calcolo (con o senza la riga dei titoli)",
    "serverimport.paste_label": "Righe da importare",
    "serverimport.read_error": "Il file non si riesce a leggere.",
    "serverimport.has_header": "La prima riga contiene i nomi delle colonne",
    "serverimport.update_existing": "Aggiorna i dati dei server già in anagrafica",
    "serverimport.update_existing_hint": "Senza questa opzione, i server già in anagrafica vengono aggiunti all'intervento con i loro dati attuali; le differenze vengono solo mostrate.",
    "serverimport.columns": "Colonne",
    "serverimport.column_n": "Colonna {n}",
    "serverimport.ignore": "— ignora —",
    "serverimport.total_new": {
      "one": "1 server nuovo",
      "other": "{n} server nuovi"
    },
    "serverimport.total_existing": {
      "one": "1 server dall'anagrafica",
      "other": "{n} server dall'anagrafica"
    },
    "serverimport.total_updated": {
      "one": "1 server aggiornato",
      "other": "{n} server aggiornati"
    },
    "serverimport.total_skipped": {
      "one": "1 saltato",
      "other": "{n} saltati"
    },
    "serverimport.total_errors": {
      "one": "1 con errori",
      "other": "{n} con errori"
    },
    "serverimport.nothing": "Niente da importare.",
    "serverimport.unknown_os": "Sistemi operativi non nell'elenco (lasciati vuoti): {list}. Un amministratore può aggiungerli in Impostazioni → Amministrazione → Sistemi operativi, poi rifai l'anteprima.",
    "serverimport.unknown_users": "Tecnici non trovati (lasciati vuoti): {list}.",
    "serverimport.th.line": "Riga",
    "serverimport.th.hostname": "Hostname",
    "serverimport.th.result": "Esito",
    "serverimport.th.details": "Dettagli",
    "serverimport.status.added_new": "Nuovo",
    "serverimport.status.added_existing": "Da anagrafica",
    "serverimport.status.updated": "Aggiornato",
    "serverimport.status.skipped": "Saltato",
    "serverimport.status.errors": "Errore",
    "serverimport.diff": "{field}: anagrafica «{current}», file «{file}»",
    "serverimport.import_none": "Importa",
    "serverimport.import_n": {
      "one": "Importa 1 server",
      "other": "Importa {n} server"
    },
    "serverimport.done": {
      "one": "1 server importato.",
      "other": "{n} server importati."
    },
    "serverimport.field.hostname": "Hostname",
    "serverimport.field.ip_address": "IP",
    "serverimport.field.operating_system": "SO",
    "serverimport.field.environment": "Ambiente",
    "serverimport.field.current_kernel": "Kernel attuale",
    "serverimport.field.target_operating_system": "SO target",
    "serverimport.field.target_kernel": "Kernel target",
    "serverimport.field.assigned_user": "Tecnico",
    "serverimport.field.notes": "Note"
  }
};
