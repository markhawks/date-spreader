"""Schemi di input per la modifica della tabella server di un intervento."""

from __future__ import annotations

import ipaddress
import re
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import statuses
from app.i18n import tr
from app.schemas.calendar import ServerRow

CheckStatus = Literal[statuses.CHECK_STATUSES]  # type: ignore[valid-type]
MigrationStatus = Literal[statuses.MIGRATION_STATUSES]  # type: ignore[valid-type]
Environment = Literal[statuses.ENVIRONMENTS]  # type: ignore[valid-type]

HOSTNAME_RE = re.compile(r"^[a-z0-9]([a-z0-9_-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9_-]*[a-z0-9])?)*$")

# Campi che appartengono al server (validi in tutti i suoi interventi)
SERVER_FIELDS = ("hostname", "ip_address", "operating_system", "environment", "location", "current_kernel")
# Campi della riga, specifici di questo intervento
ROW_FIELDS = (
    "target_kernel",
    "target_operating_system",
    "check_status",
    "migration_status",
    "planned_date",
    "executed_date",
    "assigned_user_id",
    "notes",
)


def _clean_text(v):
    """Spazi tolti; stringa vuota → None."""
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class _RowFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip_address: str | None = Field(default=None, max_length=45)
    operating_system: str | None = Field(default=None, max_length=100)
    environment: Environment | None = None
    current_kernel: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    target_kernel: str | None = Field(default=None, max_length=100)
    target_operating_system: str | None = Field(default=None, max_length=100)
    planned_date: date | None = None
    executed_date: date | None = None
    assigned_user_id: int | None = None
    # Lunghe: negli interventi di configurazione contengono il dettaglio della configurazione
    notes: str | None = Field(default=None, max_length=20000)

    @field_validator(
        "ip_address", "operating_system", "current_kernel", "location", "target_kernel", "target_operating_system", "notes",
        "environment", mode="before",
    )
    @classmethod
    def _strip(cls, v):
        return _clean_text(v)

    @field_validator("ip_address")
    @classmethod
    def _valid_ip(cls, v):
        if v is None:
            return v
        try:
            return str(ipaddress.ip_address(v))
        except ValueError:
            raise ValueError(tr("validation.invalid_ip")) from None


def _valid_hostname(v: str) -> str:
    v = v.strip().lower()
    if not v:
        raise ValueError(tr("servers.hostname_required"))
    if len(v) > 255 or not HOSTNAME_RE.match(v):
        raise ValueError(tr("validation.invalid_hostname"))
    return v


class ServerRowPatch(_RowFields):
    """Modifica parziale: si inviano solo i campi cambiati, più le versioni lette."""

    version: int = Field(description="Versione della riga letta dal client")
    server_version: int | None = Field(
        default=None, description="Versione del server letta: obbligatoria se si modificano campi del server"
    )
    hostname: str | None = None
    check_status: CheckStatus | None = None
    migration_status: MigrationStatus | None = None

    @field_validator("hostname")
    @classmethod
    def _host(cls, v):
        return None if v is None else _valid_hostname(v)

    def changed_fields(self) -> set[str]:
        return self.model_fields_set - {"version", "server_version"}


class ServerRowCreate(_RowFields):
    """Nuova riga. Se esiste già un server con lo stesso hostname viene collegato quello."""

    hostname: str
    check_status: CheckStatus = statuses.CHECK_STATUSES[0]
    migration_status: MigrationStatus = statuses.MIGRATION_STATUSES[0]

    @field_validator("hostname")
    @classmethod
    def _host(cls, v):
        return _valid_hostname(v)


class ServerImportRequest(BaseModel):
    """Server list to import into an intervention (CSV/TSV/pasted text, or an .xlsx file in base64)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["text", "xlsx"]
    content: str = Field(max_length=8 * 1024 * 1024)
    # Field of each column ("hostname", "ip_address", …, or null to ignore it); omitted = detected
    mapping: list[str | None] | None = Field(default=None, max_length=100)
    has_header: bool | None = None
    update_existing: bool = False      # also update the data of servers already in the inventory
    dry_run: bool = True               # preview: nothing is saved

    @field_validator("mapping")
    @classmethod
    def _fields(cls, v):
        from app.server_import import FIELDS

        if v is not None and any(f is not None and f not in FIELDS for f in v):
            raise ValueError("unknown field in mapping")
        return v


class ServerRowCreated(ServerRow):
    server_reused: bool = Field(description="True se l'hostname esisteva già ed è stato collegato quel server")


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
UserRole = Literal[statuses.USER_ROLES]  # type: ignore[valid-type]


def _valid_name(v):
    v = " ".join(str(v or "").split())
    if not v:
        raise ValueError(tr("users.name_required"))
    return v


def _valid_email(v):
    v = _clean_text(v)
    if v is None:
        return None
    v = v.lower()
    if not EMAIL_RE.match(v):
        raise ValueError(tr("validation.invalid_email"))
    return v


class UserOut(BaseModel):
    id: int
    version: int
    display_name: str
    email: str | None
    role: str
    is_active: bool
    is_demo: bool = False
    username: str | None = None
    has_password: bool = False           # può accedere al portale
    must_change_password: bool = False
    last_login_at: datetime | None = None

    @classmethod
    def from_user(cls, u) -> UserOut:
        email = None if u.external_id.startswith("local:") else u.external_id
        return cls(
            id=u.id, version=u.version, display_name=u.display_name, email=email, role=u.role,
            is_active=u.is_active, is_demo=u.is_demo, username=u.username,
            has_password=bool(u.password_hash), must_change_password=u.must_change_password,
            last_login_at=u.last_login_at,
        )


USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,49}$")


def _valid_username(v):
    v = _clean_text(v)
    if v is None:
        return None
    v = v.lower()
    if not USERNAME_RE.match(v):
        raise ValueError(tr("validation.invalid_username"))
    return v


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=200)
    email: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=50)
    role: UserRole = statuses.USER_ROLES[0]

    _username = field_validator("username", mode="before")(classmethod(lambda cls, v: _valid_username(v)))

    _name = field_validator("display_name", mode="before")(classmethod(lambda cls, v: _valid_name(v)))
    _email = field_validator("email", mode="before")(classmethod(lambda cls, v: _valid_email(v)))


class TechnicianQuickCreate(BaseModel):
    """Tecnico aggiunto al volo dal menu dei partecipanti: solo il nome (ruolo tecnico, senza accesso)."""

    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=200)

    _name = field_validator("display_name", mode="before")(classmethod(lambda cls, v: _valid_name(v)))


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    display_name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=50)
    role: UserRole | None = None
    is_active: bool | None = None

    _name = field_validator("display_name", mode="before")(classmethod(lambda cls, v: _valid_name(v)))
    _email = field_validator("email", mode="before")(classmethod(lambda cls, v: _valid_email(v)))
    _username = field_validator("username", mode="before")(classmethod(lambda cls, v: _valid_username(v)))

    def changed_fields(self) -> set[str]:
        return self.model_fields_set - {"version"}


class TemporaryPassword(BaseModel):
    password: str  # da comunicare all'utente: al primo accesso dovrà cambiarla


class ParticipantsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_ids: list[int] = Field(max_length=50)


class Options(BaseModel):
    """Valori ammessi per le colonne a scelta."""

    check_statuses: list[str]
    migration_statuses: list[str]
    environments: list[str]
    event_statuses: list[str]
    locations: list[str] = []      # locations already used by servers (proposed in the menu)


EventStatus = Literal[statuses.EVENT_STATUSES]  # type: ignore[valid-type]
EventType = Literal[statuses.EVENT_TYPES]  # type: ignore[valid-type]


class EventPatch(BaseModel):
    """Modifica parziale di un intervento: si inviano solo i campi cambiati, con la versione letta."""

    model_config = ConfigDict(extra="forbid")

    version: int
    status: EventStatus | None = None
    notes: str | None = Field(default=None, max_length=4000)
    event_date: date | None = None
    title: str | None = Field(default=None, max_length=200)
    event_type: EventType | None = None
    start_time: time | None = None
    end_time: time | None = None
    order_code: str | None = Field(default=None, max_length=100)  # "" or null = no commessa

    @field_validator("notes", "title", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean_text(v)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _empty_time(cls, v):
        return None if v == "" else v

    def changed_fields(self) -> set[str]:
        return self.model_fields_set - {"version"}


ProjectStatus = Literal[statuses.PROJECT_STATUSES]  # type: ignore[valid-type]


class EventDuplicate(BaseModel):
    """Copia di un intervento in un'altra data (stesso progetto)."""

    model_config = ConfigDict(extra="forbid")

    event_date: date
    # Orario: se non inviato si copia quello dell'originale; null = senza orario
    start_time: time | None = None
    end_time: time | None = None
    keep_times: bool = True
    include_servers: bool = True   # copia anche la tabella server (stati azzerati)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _empty_time(cls, v):
        return None if v == "" else v


class EventCreate(BaseModel):
    """Intervento da creare (per ora: il primo intervento di un nuovo progetto)."""

    model_config = ConfigDict(extra="forbid")

    event_date: date
    title: str | None = Field(default=None, max_length=200)
    event_type: EventType = statuses.EVENT_TYPES[0]
    status: EventStatus = statuses.EVENT_STATUSES[0]
    start_time: time | None = None
    end_time: time | None = None
    notes: str | None = Field(default=None, max_length=4000)
    participant_ids: list[int] = Field(default_factory=list, max_length=50)
    # Commessa of the project's customer: existing code (any case) or a new one, created on the customer
    order_code: str | None = Field(default=None, max_length=100)

    @field_validator("title", "notes", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean_text(v)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _empty_time(cls, v):
        return None if v == "" else v

    @model_validator(mode="after")
    def _times(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError(tr("events.end_before_start"))
        return self


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: ProjectStatus = statuses.PROJECT_STATUSES[0]
    customer_id: int | None = None
    first_event: EventCreate | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        v = " ".join(str(v or "").split())  # spazi multipli → uno
        if not v:
            raise ValueError(tr("projects.name_required"))
        return v

    @field_validator("description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean_text(v)


class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: ProjectStatus | None = None
    customer_id: int | None = None   # null = nessun cliente

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        v = " ".join(str(v or "").split())
        if not v:
            raise ValueError(tr("projects.name_required"))
        return v

    @field_validator("description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean_text(v)

    def changed_fields(self) -> set[str]:
        return self.model_fields_set - {"version"}
