"""Valori ammessi per stati e ambienti.

Sono salvati come testo (non come ENUM SQL) perché la specifica li considera ancora
provvisori: cambiarli qui non richiede una migrazione. La validazione avviene nelle API.
Il primo valore di ogni tupla è il default.
"""

PROJECT_STATUSES = ("attivo", "sospeso", "chiuso")

EVENT_STATUSES = ("pianificato", "confermato", "in_corso", "completato", "rinviato", "annullato")
EVENT_TYPES = ("migrazione", "upgrade", "patching", "altro")

CHECK_STATUSES = ("da_fare", "in_corso", "ok", "ko", "non_applicabile")
MIGRATION_STATUSES = ("pianificata", "in_corso", "completata", "fallita", "rinviata", "annullata")

ENVIRONMENTS = ("DEV", "TEST", "PROD", "ALTRO")

USER_ROLES = ("tecnico", "coordinatore", "admin")

CUSTOM_FIELD_TYPES = ("testo", "numero", "data", "scelta", "booleano")
