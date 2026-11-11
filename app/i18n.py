"""Server messages in English (primary language) and Italian.

The web client sends `Accept-Language` with the user's language; `LanguageMiddleware` stores it
for the request and `tr(key, **values)` returns the message in that language (English otherwise).

Every message is an entry of MESSAGES: {"key": {"en": "...", "it": "..."}} with the same
{placeholders} in both languages (checked by tests/test_i18n.py). Keys: "<area>.<name>".
"""

from __future__ import annotations

from contextvars import ContextVar

LANGUAGES = ("en", "it")
DEFAULT_LANGUAGE = "en"

_current: ContextVar[str] = ContextVar("language", default=DEFAULT_LANGUAGE)

MESSAGES: dict[str, dict[str, str]] = {
    # --- import of a server list into an intervention (app/server_import.py) ---
    "import.bad_file": {"en": "The file could not be read.", "it": "Il file non si riesce a leggere."},
    "import.too_big": {"en": "The file is too big (5 MB at most).", "it": "Il file è troppo grande (al massimo 5 MB)."},
    "import.bad_xlsx": {
        "en": "This is not a readable Excel file (.xlsx). Save it as .xlsx or CSV, or copy and paste the rows.",
        "it": "Non è un file Excel leggibile (.xlsx). Salvalo come .xlsx o CSV, oppure copia e incolla le righe.",
    },
    "import.too_many": {"en": "Too many rows: {n} at most per import.", "it": "Troppe righe: al massimo {n} per import."},
    "import.no_hostname": {
        "en": "Choose which column contains the hostname.",
        "it": "Scegli quale colonna contiene l'hostname.",
    },
    "import.row_no_hostname": {"en": "No hostname.", "it": "Manca l'hostname."},
    "import.row_duplicate": {"en": "Already earlier in the list.", "it": "Già presente più sopra nell'elenco."},
    "import.row_in_event": {"en": "Already in this intervention.", "it": "Già presente in questo intervento."},
    "import.row_unknown_os": {
        "en": "Operating system \"{value}\" is not in the list: left empty.",
        "it": "Il sistema operativo \"{value}\" non è nell'elenco: lasciato vuoto.",
    },
    "import.row_unknown_env": {
        "en": "Environment \"{value}\" not recognised (DEV, TEST, PROD, OTHER): left empty.",
        "it": "Ambiente \"{value}\" non riconosciuto (DEV, TEST, PROD, ALTRO): lasciato vuoto.",
    },
    "import.row_unknown_user": {
        "en": "Technician \"{value}\" not found: left empty.",
        "it": "Tecnico \"{value}\" non trovato: lasciato vuoto.",
    },
    # --- database backups (app/backup.py, CLI, admin API) ---
    "backup.db_missing": {"en": "Database not found: {path}", "it": "Database non trovato: {path}"},
    "backup.copy_corrupt": {
        "en": "The backup copy failed the integrity check ({result}): it was discarded.",
        "it": "La copia di backup non ha superato il controllo di integrità ({result}): è stata scartata.",
    },
    "backup.file_missing": {"en": "File not found: {path}", "it": "File non trovato: {path}"},
    "backup.not_sqlite": {"en": "Not a valid SQLite database: {error}", "it": "Non è un database SQLite valido: {error}"},
    "backup.file_corrupt": {
        "en": "The backup file failed the integrity check: {result}",
        "it": "Il file di backup non ha superato il controllo di integrità: {result}",
    },
    "backup.not_datespreader": {
        "en": "This file is not a Date Spreader database (tables missing).",
        "it": "Questo file non è un database di Date Spreader (mancano delle tabelle).",
    },
    "backup.not_found": {"en": "Backup not found.", "it": "Backup non trovato."},
    "cli.backup_done": {
        "en": "Backup created: {path} ({size})",
        "it": "Backup creato: {path} ({size})",
    },
    "cli.backup_rotated": {
        "en": "Rotation: removed {n} old backup(s): {names}",
        "it": "Rotazione: tolti {n} backup vecchi: {names}",
    },
    "cli.backup_list_head": {
        "en": "Backups in {folder} (newest first):",
        "it": "Backup in {folder} (dal più recente):",
    },
    "cli.backup_list_empty": {"en": "No backups in {folder}.", "it": "Nessun backup in {folder}."},
    "cli.backup_pre_migration": {
        "en": "The database schema will be upgraded: backup first → {path}",
        "it": "Lo schema del database verrà aggiornato: prima un backup → {path}",
    },
    "cli.restore_warning": {
        "en": "The current database ({db}) will be REPLACED by {file}.\nStop the service first (sudo systemctl stop datespreader); the current state is saved as a \"pre-restore\" backup.",
        "it": "Il database attuale ({db}) verrà SOSTITUITO da {file}.\nFerma prima il servizio (sudo systemctl stop datespreader); lo stato attuale viene salvato come backup \"pre-restore\".",
    },
    "cli.restore_confirm": {"en": "Restore this backup? Type 'yes' to confirm: ", "it": "Ripristinare questo backup? Scrivi 'si' per confermare: "},
    "cli.restore_cancelled": {"en": "Restore cancelled.", "it": "Ripristino annullato."},
    "cli.restore_saved": {"en": "Current state saved in {path}", "it": "Stato attuale salvato in {path}"},
    "cli.restore_done": {
        "en": "Backup restored and database upgraded to the current schema. Now start the service: sudo systemctl start datespreader",
        "it": "Backup ripristinato e database portato allo schema attuale. Ora avvia il servizio: sudo systemctl start datespreader",
    },
    "common.changelog_missing": {
        "en": "Changelog not available.",
        "it": "Changelog non disponibile.",
    },
    # --- auth
    "auth.login_required": {
        "en": "Login required.",
        "it": "Accesso richiesto.",
    },
    "auth.session_expired": {
        "en": "Session expired: please log in again.",
        "it": "Sessione scaduta: accedi di nuovo.",
    },
    "auth.password_change_required": {
        "en": "You must change your password before continuing.",
        "it": "Devi cambiare la password prima di continuare.",
    },
    "auth.admin_required": {
        "en": "This operation is reserved for administrators.",
        "it": "Operazione riservata agli amministratori.",
    },
    "auth.csrf": {
        "en": "Invalid request (missing security header).",
        "it": "Richiesta non valida (manca l'intestazione di sicurezza).",
    },
    "auth.invalid_credentials": {
        "en": "Invalid credentials.",
        "it": "Credenziali non valide.",
    },
    "auth.too_many_attempts": {
        "en": "Too many attempts. Try again in {seconds} seconds.",
        "it": "Troppi tentativi. Riprova tra {seconds} secondi.",
    },
    "auth.wrong_current_password": {
        "en": "The current password is not correct.",
        "it": "La password attuale non è corretta.",
    },
    "auth.same_password": {
        "en": "The new password must be different from the current one.",
        "it": "La nuova password deve essere diversa da quella attuale.",
    },
    # --- password
    "password.too_short": {
        "en": "The password must be at least {min} characters long.",
        "it": "La password deve avere almeno {min} caratteri.",
    },
    "password.spaces": {
        "en": "The password cannot start or end with a space.",
        "it": "La password non può iniziare o finire con uno spazio.",
    },
    "password.contains_login": {
        "en": "The password cannot contain the username or the email.",
        "it": "La password non può contenere il nome utente o l'email.",
    },
    "password.repetitive": {
        "en": "The password is too repetitive.",
        "it": "La password è troppo ripetitiva.",
    },
    # --- users
    "users.conflict": {
        "en": "The technician was changed by another user. Here are the updated values.",
        "it": "Il tecnico è stato modificato da un altro utente. Ecco i valori aggiornati.",
    },
    "users.technician_not_found": {
        "en": "Technician not found.",
        "it": "Tecnico non trovato.",
    },
    "users.not_found": {
        "en": "User not found.",
        "it": "Utente non trovato.",
    },
    "users.preferences_real_only": {
        "en": "Preferences are available only for real users.",
        "it": "Preferenze disponibili solo per utenti reali.",
    },
    # --- events
    "events.not_found": {
        "en": "Intervention not found.",
        "it": "Intervento non trovato.",
    },
    # --- calendar
    "calendar.end_before_start": {
        "en": "The end date is before the start date.",
        "it": "La data di fine precede quella di inizio.",
    },
    "calendar.max_range": {
        "en": "Maximum range: {days} days.",
        "it": "Intervallo massimo: {days} giorni.",
    },
    # --- customers
    "customers.not_found": {
        "en": "Customer not found.",
        "it": "Cliente non trovato.",
    },
    "customers.conflict": {
        "en": "The customer was changed by another user.",
        "it": "Il cliente è stato modificato da un altro utente.",
    },
    # --- inventory
    "inventory.server_not_found": {
        "en": "Server not found.",
        "it": "Server non trovato.",
    },
    # --- os
    "os.family_required": {
        "en": "Enter the family (e.g. Red Hat Enterprise Linux).",
        "it": "Indica la famiglia (es. Red Hat Enterprise Linux).",
    },
    "os.not_found": {
        "en": "Operating system not found.",
        "it": "Sistema operativo non trovato.",
    },
    # --- servers
    "servers.row_conflict": {
        "en": "This row was changed by another user. Here are the updated values.",
        "it": "Questa riga è stata modificata da un altro utente. Ecco i valori aggiornati.",
    },
    "servers.row_not_found": {
        "en": "Row not found: it may have been removed by another user.",
        "it": "Riga non trovata: potrebbe essere stata rimossa da un altro utente.",
    },
    "servers.server_version_required": {
        "en": "server_version is required to change the server fields.",
        "it": "server_version è obbligatorio per modificare i campi del server.",
    },
    "servers.row_conflict_delete": {
        "en": "The row was changed by another user: check it before deleting it.",
        "it": "La riga è stata modificata da un altro utente: controlla prima di eliminarla.",
    },
    # --- events
    "events.conflict": {
        "en": "The intervention was changed by another user. Here are the updated values.",
        "it": "L'intervento è stato modificato da un altro utente. Ecco i valori aggiornati.",
    },
    # --- projects
    "projects.conflict": {
        "en": "The project was changed by another user. Here are the updated values.",
        "it": "Il progetto è stato modificato da un altro utente. Ecco i valori aggiornati.",
    },
    "projects.not_found": {
        "en": "Project not found.",
        "it": "Progetto non trovato.",
    },
    "projects.delete_forbidden": {
        "en": "Only coordinators and administrators can delete a project.",
        "it": "Solo coordinatori e amministratori possono eliminare un progetto.",
    },
    # --- transfer
    "transfer.copy_name": {
        "en": "{name} (imported)",
        "it": "{name} (importato)",
    },
    "transfer.export_forbidden": {
        "en": "Export is reserved for coordinators and administrators.",
        "it": "L'export è riservato a coordinatori e amministratori.",
    },
    "transfer.customer_no_projects": {
        "en": "“{name}” has no projects to export.",
        "it": "«{name}» non ha progetti da esportare.",
    },
    # --- users
    "users.invalid_technician": {
        "en": "Invalid technician.",
        "it": "Tecnico non valido.",
    },
    # --- servers
    "servers.hostname_required": {
        "en": "The hostname is required.",
        "it": "L'hostname è obbligatorio.",
    },
    "servers.hostname_taken": {
        "en": "Another server with this hostname already exists.",
        "it": "Esiste già un altro server con questo hostname.",
    },
    "servers.check_status_required": {
        "en": "The check status is required.",
        "it": "Lo stato del check è obbligatorio.",
    },
    "servers.migration_status_required": {
        "en": "The migration status is required.",
        "it": "Lo stato della migrazione è obbligatorio.",
    },
    "servers.already_in_event": {
        "en": "{hostname} is already in this intervention.",
        "it": "{hostname} è già presente in questo intervento.",
    },
    # --- events
    "events.status_required": {
        "en": "The intervention status is required.",
        "it": "Lo stato dell'intervento è obbligatorio.",
    },
    "events.event_date_required": {
        "en": "The intervention date is required.",
        "it": "La data dell'intervento è obbligatorio.",
    },
    "events.event_type_required": {
        "en": "The intervention type is required.",
        "it": "Il tipo dell'intervento è obbligatorio.",
    },
    "events.end_before_start": {
        "en": "The end time must be later than the start time.",
        "it": "L'ora di fine deve essere successiva all'ora di inizio.",
    },
    "events.delete_forbidden": {
        "en": "The intervention contains servers: only coordinators and administrators can delete it. Alternatively, mark it as “cancelled”.",
        "it": "L'intervento contiene dei server: solo coordinatori e amministratori possono eliminarlo. In alternativa segnalo come «annullato».",
    },
    # --- projects
    "projects.name_status_required": {
        "en": "Project name and status are required.",
        "it": "Nome e stato del progetto sono obbligatori.",
    },
    "projects.name_taken": {
        "en": "A project with this name already exists.",
        "it": "Esiste già un progetto con questo nome.",
    },
    # --- users
    "users.username_taken": {
        "en": "This username is already in use.",
        "it": "Questo nome utente è già usato.",
    },
    "users.name_taken": {
        "en": "A technician with this name already exists.",
        "it": "Esiste già un tecnico con questo nome.",
    },
    "users.email_taken": {
        "en": "This email is already used by another technician.",
        "it": "Questa email è già usata da un altro tecnico.",
    },
    "users.exists_inactive": {
        "en": "“{name}” exists but is deactivated: an administrator can reactivate it from Users.",
        "it": "«{name}» esiste ma è disattivato: un amministratore può riattivarlo da Utenti.",
    },
    "users.name_required": {
        "en": "The name is required.",
        "it": "Il nome è obbligatorio.",
    },
    "users.role_required": {
        "en": "The role is required.",
        "it": "Il ruolo è obbligatorio.",
    },
    "users.active_required": {
        "en": "Specify whether the technician is active.",
        "it": "Indica se il tecnico è attivo.",
    },
    "users.last_admin": {
        "en": "At least one active administrator with portal access must remain.",
        "it": "Deve restare almeno un amministratore attivo con accesso al portale.",
    },
    "users.inactive_no_password": {
        "en": "The user is deactivated: reactivate them before giving them a password.",
        "it": "L'utente è disattivato: riattivalo prima di dargli una password.",
    },
    "users.invalid_or_inactive": {
        "en": "Invalid or deactivated technician.",
        "it": "Tecnico non valido o disattivato.",
    },
    # --- customers
    "customers.name_required": {
        "en": "The customer name is required.",
        "it": "Il nome del cliente è obbligatorio.",
    },
    "customers.name_too_long": {
        "en": "Customer name too long (maximum {max} characters).",
        "it": "Nome del cliente troppo lungo (massimo {max} caratteri).",
    },
    "customers.name_taken": {
        "en": "The customer “{name}” already exists.",
        "it": "Esiste già il cliente «{name}».",
    },
    "customers.has_projects": {
        "en": "“{name}” has {count} projects: assign them to another customer before deleting it.",
        "it": "«{name}» ha {count} progetti: assegnali a un altro cliente prima di eliminarlo.",
    },
    "customers.invalid": {
        "en": "Invalid customer.",
        "it": "Cliente non valido.",
    },
    "customers.invalid_color": {
        "en": "Invalid color: use the #RRGGBB format (e.g. #2563eb).",
        "it": "Colore non valido: usa il formato #RRGGBB (es. #2563eb).",
    },
    # --- os
    "os.not_in_list": {
        "en": "“{name}” is not in the operating system list. An administrator can add it from user menu → Operating systems.",
        "it": "«{name}» non è nell'elenco dei sistemi operativi. Un amministratore può aggiungerlo da menu utente → Sistemi operativi.",
    },
    "os.exists": {
        "en": "“{name}” is already in the list.",
        "it": "«{name}» è già nell'elenco.",
    },
    "os.exists_inactive": {
        "en": "“{name}” is already in the list (deactivated: reactivate it).",
        "it": "«{name}» è già nell'elenco (disattivato: riattivalo).",
    },
    "os.in_use": {
        "en": "“{name}” is in use ({count} among servers and target OS): deactivate it instead of deleting it.",
        "it": "«{name}» è in uso ({count} tra server e SO target): disattivalo invece di eliminarlo.",
    },
    # --- validation
    "validation.invalid_ip": {
        "en": "Invalid IP address.",
        "it": "Indirizzo IP non valido.",
    },
    "validation.invalid_hostname": {
        "en": "Invalid hostname: only letters, digits, '-', '_' and '.'.",
        "it": "Hostname non valido: solo lettere, numeri, '-', '_' e '.'.",
    },
    "validation.invalid_email": {
        "en": "Invalid email.",
        "it": "Email non valida.",
    },
    "validation.invalid_username": {
        "en": "Invalid username: 2-50 characters among letters, digits, '.', '_' and '-'.",
        "it": "Nome utente non valido: 2-50 caratteri tra lettere, numeri, '.', '_' e '-'.",
    },
    # --- projects
    "projects.name_required": {
        "en": "The project name is required.",
        "it": "Il nome del progetto è obbligatorio.",
    },
    # --- transfer
    "transfer.invalid_ip": {
        "en": "Invalid IP address: {value}",
        "it": "Indirizzo IP non valido: {value}",
    },
    "transfer.newer_format": {
        "en": "File created by a newer version of Date Spreader (format {version}): update this portal.",
        "it": "File creato da una versione più recente di Date Spreader (formato {version}): aggiorna questo portale.",
    },
    "transfer.unknown_technician": {
        "en": "{where}: technician “{key}” not in the file, ignored.",
        "it": "{where}: tecnico «{key}» non presente nel file, ignorato.",
    },
    "transfer.end_time_dropped": {
        "en": "{where}: end time not after the start, removed.",
        "it": "{where}: ora di fine non successiva all'inizio, tolta.",
    },
    "transfer.duplicate_host": {
        "en": "{where}: {hostname} appears twice, kept the first row.",
        "it": "{where}: {hostname} compare due volte, tenuta la prima riga.",
    },
    # --- cli
    "cli.plan_progetti": {
        "en": "Projects to delete",
        "it": "Progetti da cancellare",
    },
    "cli.plan_interventi": {
        "en": "Interventions to delete",
        "it": "Interventi da cancellare",
    },
    "cli.plan_server": {
        "en": "Servers to delete",
        "it": "Server da cancellare",
    },
    "cli.plan_server_mantenuti": {
        "en": "Servers kept (used in real interventions)",
        "it": "Server mantenuti (usati in interventi reali)",
    },
    "cli.plan_tecnici": {
        "en": "Technicians to delete",
        "it": "Tecnici da cancellare",
    },
    "cli.plan_tecnici_disattivati": {
        "en": "Technicians only deactivated (used by real data)",
        "it": "Tecnici solo disattivati (usati da dati reali)",
    },
    "cli.plan_clienti": {
        "en": "Customers to delete",
        "it": "Clienti da cancellare",
    },
    "cli.plan_clienti_mantenuti": {
        "en": "Customers kept (assigned to real projects)",
        "it": "Clienti mantenuti (assegnati a progetti reali)",
    },
    "cli.count_progetti": {
        "en": "projects",
        "it": "progetti",
    },
    "cli.count_eventi": {
        "en": "interventions",
        "it": "eventi",
    },
    "cli.count_server": {
        "en": "servers",
        "it": "server",
    },
    "cli.count_utenti": {
        "en": "users",
        "it": "utenti",
    },
    "cli.demo_already_loaded": {
        "en": "The sample data is already loaded.",
        "it": "I dati di esempio sono già presenti.",
    },
    "cli.demo_loaded": {
        "en": "Sample data loaded: {summary}",
        "it": "Dati di esempio caricati: {summary}",
    },
    "cli.demo_none": {
        "en": "No sample data present.",
        "it": "Nessun dato di esempio presente.",
    },
    "cli.demo_found": {
        "en": "Sample data found:",
        "it": "Dati di esempio trovati:",
    },
    "cli.confirm_with_yes": {
        "en": "Confirmation required: run again with --yes.",
        "it": "Conferma richiesta: rilancia con --yes.",
    },
    "cli.confirm_prompt": {
        "en": "Proceed? Type 'yes' to confirm: ",
        "it": "Procedere? Scrivi 'si' per confermare: ",
    },
    "cli.cancelled": {
        "en": "Cancelled.",
        "it": "Annullato.",
    },
    "cli.demo_removed": {
        "en": "Sample data removed. Anyone with the portal open must reload the page (Ctrl+F5).",
        "it": "Dati di esempio rimossi. Chi ha il portale aperto deve ricaricare la pagina (Ctrl+F5).",
    },
    "cli.new_password": {
        "en": "New password: ",
        "it": "Nuova password: ",
    },
    "cli.repeat_password": {
        "en": "Repeat the password: ",
        "it": "Ripeti la password: ",
    },
    "cli.passwords_differ": {
        "en": "The two passwords do not match.",
        "it": "Le due password non coincidono.",
    },
    "cli.needs_tty": {
        "en": "An interactive terminal is needed to enter the password (or use --temporary).",
        "it": "Serve un terminale interattivo per inserire la password (oppure usa --temporary).",
    },
    "cli.password_not_set": {
        "en": "Password not set.",
        "it": "Password non impostata.",
    },
    "cli.is_admin": {
        "en": "{name} is an administrator. Log in with: {login}",
        "it": "{name} è amministratore. Accesso con: {login}",
    },
    "cli.temporary_password": {
        "en": "Temporary password (to be changed at first login): {password}",
        "it": "Password temporanea (da cambiare al primo accesso): {password}",
    },
    "cli.access_yes": {
        "en": "access",
        "it": "accesso",
    },
    "cli.access_inactive": {
        "en": "deactivated",
        "it": "disattivato",
    },
    "cli.access_no_password": {
        "en": "no password",
        "it": "senza password",
    },
    "cli.user_not_found": {
        "en": "No user with username or email “{login}”. See: users list",
        "it": "Nessun utente con nome utente o email «{login}». Vedi: users list",
    },
    "cli.invalid_data": {
        "en": "Invalid data: {error}",
        "it": "Dati non validi: {error}",
    },
    "cli.user_exists": {
        "en": "{error} Use instead: users admin <email or username>",
        "it": "{error} Usa invece: users admin <email o nome utente>",
    },
    "cli.migrated": {
        "en": "Migrations applied.",
        "it": "Migrazioni applicate.",
    },
}


def parse_accept_language(header: str | None) -> str:
    """First supported language in an Accept-Language header ("it-IT,it;q=0.9,en;q=0.8" → "it")."""
    for part in (header or "").split(","):
        base = part.split(";")[0].strip().lower().split("-")[0]
        if base in LANGUAGES:
            return base
    return DEFAULT_LANGUAGE


def current_language() -> str:
    return _current.get()


def set_language(lang: str):
    """Sets the language for the current context (tests, CLI). Returns a token for `reset_language`."""
    return _current.set(lang if lang in LANGUAGES else DEFAULT_LANGUAGE)


def reset_language(token) -> None:
    _current.reset(token)


def tr(key: str, /, **values: object) -> str:
    """Message `key` in the current language, with {placeholders} filled from `values`."""
    entry = MESSAGES.get(key)
    if entry is None:
        return key
    text = entry.get(_current.get()) or entry[DEFAULT_LANGUAGE]
    return text.format(**values) if values else text


class LanguageMiddleware:
    """Pure ASGI middleware: reads Accept-Language and sets the language for the whole request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        header = next((v.decode("latin-1") for k, v in scope.get("headers", []) if k == b"accept-language"), None)
        token = _current.set(parse_accept_language(header))
        try:
            await self.app(scope, receive, send)
        finally:
            _current.reset(token)
