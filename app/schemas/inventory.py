"""Anagrafica server: elenco con riepilogo e storico degli interventi."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class ServerSummary(BaseModel):
    id: int
    version: int
    hostname: str
    ip_address: str | None
    operating_system: str | None
    environment: str | None
    current_kernel: str | None
    location: str | None = None
    notes: str | None
    event_count: int                    # interventi in cui compare
    last_event_date: date | None        # data dell'intervento più recente
    last_migration_status: str | None   # stato della migrazione in quell'intervento
    next_event_date: date | None        # prossimo intervento da oggi in poi


class ServerHistoryItem(BaseModel):
    row_id: int
    event_id: int
    event_date: date
    event_title: str | None
    event_status: str
    event_type: str
    project_id: int
    project_name: str
    target_kernel: str | None
    target_operating_system: str | None = None
    check_status: str
    migration_status: str
    executed_date: date | None
    assigned_user: str | None
    notes: str | None


class ServerChange(BaseModel):
    at: datetime
    field: str | None
    old_value: str | None
    new_value: str | None
    action: str


class ServerDetail(BaseModel):
    server: ServerSummary
    history: list[ServerHistoryItem]   # interventi, dal più recente
    changes: list[ServerChange]        # modifiche ai dati del server, dalla più recente


class ServerList(BaseModel):
    total: int                         # server corrispondenti alla ricerca
    servers: list[ServerSummary]       # al massimo `limit`
