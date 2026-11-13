"""Formato del file di export/import tra installazioni di Date Spreader (JSON, versionato).

Il file contiene uno o più progetti con i loro interventi e tabelle server, più le "anagrafiche"
che servono a ricostruirli: clienti, server, tecnici (solo nome ed email) e versioni dei sistemi
operativi usate. Non contiene mai password, accessi, preferenze o cronologia.

Compatibilità: `format_version` cresce solo con modifiche incompatibili. I campi sconosciuti
vengono ignorati, così un file prodotto da una versione più nuova (con campi in più) si legge lo stesso.
"""

from __future__ import annotations

import ipaddress
from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import statuses
from app.i18n import tr
from app.schemas.edit import _clean_text, _valid_email, _valid_hostname, _valid_name

FORMAT = "datespreader-export"
FORMAT_VERSION = 1

ProjectStatus = Literal[statuses.PROJECT_STATUSES]  # type: ignore[valid-type]
EventStatus = Literal[statuses.EVENT_STATUSES]  # type: ignore[valid-type]
EventType = Literal[statuses.EVENT_TYPES]  # type: ignore[valid-type]
CheckStatus = Literal[statuses.CHECK_STATUSES]  # type: ignore[valid-type]
MigrationStatus = Literal[statuses.MIGRATION_STATUSES]  # type: ignore[valid-type]
Environment = Literal[statuses.ENVIRONMENTS]  # type: ignore[valid-type]


class _In(BaseModel):
    model_config = ConfigDict(extra="ignore")


def _text(v):
    return _clean_text(v)


class XCustomer(_In):
    name: str = Field(max_length=200)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    is_demo: bool = False

    _name = field_validator("name", mode="before")(classmethod(lambda cls, v: _valid_name(v)))


class XTechnician(_In):
    key: str = Field(max_length=50)            # riferimento interno al file
    display_name: str = Field(max_length=200)
    email: str | None = Field(default=None, max_length=255)
    is_demo: bool = False

    _name = field_validator("display_name", mode="before")(classmethod(lambda cls, v: _valid_name(v)))
    _email = field_validator("email", mode="before")(classmethod(lambda cls, v: _valid_email(v)))


class XOperatingSystem(_In):
    family: str = Field(min_length=1, max_length=100)
    major: int = Field(ge=0, le=999)
    minor: int | None = Field(default=None, ge=0, le=999)

    @property
    def name(self) -> str:
        return f"{self.family} {self.major}" + (f".{self.minor}" if self.minor is not None else "")


class XServer(_In):
    hostname: str
    ip_address: str | None = Field(default=None, max_length=45)
    operating_system: str | None = Field(default=None, max_length=100)
    environment: Environment | None = None
    current_kernel: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=20000)
    is_demo: bool = False

    _host = field_validator("hostname", mode="before")(classmethod(lambda cls, v: _valid_hostname(str(v or ""))))
    _clean = field_validator("ip_address", "operating_system", "current_kernel", "location", "notes", "environment",
                             mode="before")(classmethod(lambda cls, v: _text(v)))

    @field_validator("ip_address")
    @classmethod
    def _ip(cls, v):
        if v is None:
            return v
        try:
            return str(ipaddress.ip_address(v))
        except ValueError:
            raise ValueError(tr("transfer.invalid_ip", value=v)) from None


class XRow(_In):
    hostname: str
    target_operating_system: str | None = Field(default=None, max_length=100)
    target_kernel: str | None = Field(default=None, max_length=100)
    check_status: CheckStatus = statuses.CHECK_STATUSES[0]
    migration_status: MigrationStatus = statuses.MIGRATION_STATUSES[0]
    planned_date: date | None = None
    executed_date: date | None = None
    technician: str | None = None              # chiave di XTechnician
    notes: str | None = Field(default=None, max_length=20000)

    _host = field_validator("hostname", mode="before")(classmethod(lambda cls, v: _valid_hostname(str(v or ""))))
    _clean = field_validator("target_operating_system", "target_kernel", "notes", mode="before")(
        classmethod(lambda cls, v: _text(v)))


class XEvent(_In):
    event_date: date
    start_time: time | None = None
    end_time: time | None = None
    event_type: EventType = statuses.EVENT_TYPES[0]
    status: EventStatus = statuses.EVENT_STATUSES[0]
    title: str | None = Field(default=None, max_length=200)
    order_code: str | None = Field(default=None, max_length=100)  # commessa of the customer
    worked_hours: float | None = Field(default=None, ge=0, le=1000)
    notes: str | None = Field(default=None, max_length=4000)
    participants: list[str] = Field(default_factory=list)  # chiavi di XTechnician
    servers: list[XRow] = Field(default_factory=list)

    _clean = field_validator("title", "notes", mode="before")(classmethod(lambda cls, v: _text(v)))


class XProject(_In):
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    status: ProjectStatus = statuses.PROJECT_STATUSES[0]
    customer: str | None = None                 # nome di XCustomer
    is_demo: bool = False
    events: list[XEvent] = Field(default_factory=list)

    _name = field_validator("name", mode="before")(classmethod(lambda cls, v: _valid_name(v)))
    _clean = field_validator("description", mode="before")(classmethod(lambda cls, v: _text(v)))


class ExportFile(_In):
    format: Literal["datespreader-export"]
    format_version: int = Field(ge=1)
    app_version: str | None = None
    exported_at: str | None = None
    scope: dict | None = None                   # cosa è stato esportato (solo informativo)
    customers: list[XCustomer] = Field(default_factory=list)
    technicians: list[XTechnician] = Field(default_factory=list)
    operating_systems: list[XOperatingSystem] = Field(default_factory=list)
    servers: list[XServer] = Field(default_factory=list)
    projects: list[XProject] = Field(min_length=1)

    @field_validator("format_version")
    @classmethod
    def _supported(cls, v):
        if v > FORMAT_VERSION:
            raise ValueError(tr("transfer.newer_format", version=v))
        return v


OnConflict = Literal["skip", "copy"]


class ImportRequest(_In):
    data: ExportFile
    on_conflict: OnConflict = "skip"   # progetti con lo stesso nome: salta, oppure importa come copia
