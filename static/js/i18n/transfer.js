// Translations for transfer.js (index = static/index.html, common = shared words). Format: see static/js/i18n.js.
export default {
  "en": {
    "transfer.field.ip_address": "IP",
    "transfer.field.operating_system": "OS",
    "transfer.field.environment": "environment",
    "transfer.field.current_kernel": "kernel",
    "transfer.field.notes": "notes",
    "transfer.names_more": "{names} and {n} more",
    "transfer.title": "Import projects",
    "transfer.close": "Close",
    "transfer.note_html": "Import a file exported from another Date Spreader installation (project sheet or Settings → Customers → “Export”). Customers, servers and technicians already here are <strong>recognized and reused</strong> (by name, hostname, email): their data here <strong>is not changed</strong>. You'll see a preview before importing.",
    "transfer.drop_html": "<strong>Choose the file</strong> or drag it here",
    "transfer.conflict_legend": "Projects with the same name already here",
    "transfer.conflict_skip": "Skip them (don't import)",
    "transfer.conflict_copy": "Import them as a copy, named “… (imported)”",
    "transfer.cancel": "Cancel",
    "transfer.import": "Import",
    "transfer.invalid_json": "The file is not valid JSON.",
    "transfer.not_export": "This file is not a Date Spreader export.",
    "transfer.preparing": "Preparing the preview…",
    "transfer.not_importable": "File can't be imported: {message}",
    "transfer.source_customer": "Customer “{name}”",
    "transfer.source_project": "Project “{name}”",
    "transfer.source_export": "Export",
    "transfer.exported_on": ", exported on {date}",
    "transfer.app_version": " (Date Spreader {version})",
    "transfer.source": "{source}{when}{version}.",
    "transfer.col_project": "Project",
    "transfer.col_events": "Interventions",
    "transfer.col_rows": "Server rows",
    "transfer.col_outcome": "Outcome",
    "transfer.outcome_new": "New",
    "transfer.outcome_copy": "Copy: “{name}”",
    "transfer.outcome_skipped": "Already here: skipped",
    "transfer.fact_label": "{label}: ",
    "transfer.fact_new": "{n} new ({names})",
    "transfer.fact_existing": "{n} already here, reused",
    "transfer.customers": "Customers",
    "transfer.servers": "Servers",
    "transfer.technicians": "Technicians",
    "transfer.operating_systems": "Operating systems",
    "transfer.os_added": "added to the list: {names}",
    "transfer.new_technicians": "New technicians are created with the technician role and without access to the portal.",
    "transfer.servers_different": {
      "one": "{n} server already here has different data in the file: the current data is kept",
      "other": "{n} servers already here have different data in the file: the current data is kept"
    },
    "transfer.field_diff": "{field} {here} (file: {file})",
    "transfer.os_not_active": "Versions disabled here (they stay disabled): {names}.",
    "transfer.warnings": {
      "one": "{n} warning",
      "other": "{n} warnings"
    },
    "transfer.n_projects": {
      "one": "{n} project",
      "other": "{n} projects"
    },
    "transfer.n_events": {
      "one": "{n} intervention",
      "other": "{n} interventions"
    },
    "transfer.n_rows": {
      "one": "{n} server row",
      "other": "{n} server rows"
    },
    "transfer.total": "{projects}, {events} and {rows} will be imported.",
    "transfer.nothing": "There's nothing to import with this choice.",
    "transfer.importing": "Importing…",
    "transfer.done": "Imported {projects} and {events}.",
    "transfer.failed": "Import failed, no data was changed: {message}"
  },
  "it": {
    "transfer.field.ip_address": "IP",
    "transfer.field.operating_system": "SO",
    "transfer.field.environment": "ambiente",
    "transfer.field.current_kernel": "kernel",
    "transfer.field.notes": "note",
    "transfer.names_more": "{names} e altri {n}",
    "transfer.title": "Importa progetti",
    "transfer.close": "Chiudi",
    "transfer.note_html": "Importa un file esportato da un'altra installazione di Date Spreader (scheda progetto o Impostazioni → Clienti → «Esporta»). Clienti, server e tecnici già presenti vengono <strong>riconosciuti e riusati</strong> (per nome, hostname, email): i loro dati qui <strong>non vengono modificati</strong>. Prima di importare vedi l'anteprima.",
    "transfer.drop_html": "<strong>Scegli il file</strong> oppure trascinalo qui",
    "transfer.conflict_legend": "Progetti con lo stesso nome già presenti qui",
    "transfer.conflict_skip": "Saltali (non importarli)",
    "transfer.conflict_copy": "Importali come copia, con il nome «… (importato)»",
    "transfer.cancel": "Annulla",
    "transfer.import": "Importa",
    "transfer.invalid_json": "Il file non è un JSON valido.",
    "transfer.not_export": "Questo file non è un export di Date Spreader.",
    "transfer.preparing": "Preparazione dell'anteprima…",
    "transfer.not_importable": "File non importabile: {message}",
    "transfer.source_customer": "Cliente «{name}»",
    "transfer.source_project": "Progetto «{name}»",
    "transfer.source_export": "Export",
    "transfer.exported_on": ", esportato il {date}",
    "transfer.app_version": " (Date Spreader {version})",
    "transfer.source": "{source}{when}{version}.",
    "transfer.col_project": "Progetto",
    "transfer.col_events": "Interventi",
    "transfer.col_rows": "Righe server",
    "transfer.col_outcome": "Esito",
    "transfer.outcome_new": "Nuovo",
    "transfer.outcome_copy": "Copia: «{name}»",
    "transfer.outcome_skipped": "Già presente: saltato",
    "transfer.fact_label": "{label}: ",
    "transfer.fact_new": "{n} nuovi ({names})",
    "transfer.fact_existing": "{n} già presenti, riusati",
    "transfer.customers": "Clienti",
    "transfer.servers": "Server",
    "transfer.technicians": "Tecnici",
    "transfer.operating_systems": "Sistemi operativi",
    "transfer.os_added": "aggiunte all'elenco {names}",
    "transfer.new_technicians": "I tecnici nuovi vengono creati con ruolo tecnico e senza accesso al portale.",
    "transfer.servers_different": {
      "one": "{n} server già presente ha dati diversi nel file: qui restano quelli attuali",
      "other": "{n} server già presenti hanno dati diversi nel file: qui restano quelli attuali"
    },
    "transfer.field_diff": "{field} {here} (file: {file})",
    "transfer.os_not_active": "Versioni disattivate qui (restano disattivate): {names}.",
    "transfer.warnings": {
      "one": "{n} avviso",
      "other": "{n} avvisi"
    },
    "transfer.n_projects": {
      "one": "{n} progetto",
      "other": "{n} progetti"
    },
    "transfer.n_events": {
      "one": "{n} intervento",
      "other": "{n} interventi"
    },
    "transfer.n_rows": {
      "one": "{n} riga server",
      "other": "{n} righe server"
    },
    "transfer.total": "Verranno importati {projects}, {events} e {rows}.",
    "transfer.nothing": "Non c'è niente da importare con questa scelta.",
    "transfer.importing": "Importazione…",
    "transfer.done": "Importati {projects} e {events}.",
    "transfer.failed": "Import non riuscito, nessun dato è stato modificato: {message}"
  }
};
