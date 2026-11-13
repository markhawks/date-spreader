"""Gantt report (app/gantt.py): interventions of a period grouped by commessa and project."""

from __future__ import annotations

from datetime import date, time
from typing import Literal

from pydantic import BaseModel


class TechHours(BaseModel):
    id: int
    name: str
    hours: float      # hours of the interventions the technician is in
    events: int


class Totals(BaseModel):
    events: int
    servers: int                 # distinct machines
    hours: float
    man_hours: float             # hours × technicians
    statuses: dict[str, int]
    missing_hours: int           # interventions without worked hours nor complete times
    no_technicians: int
    first: date | None
    last: date | None
    technicians: list[TechHours]


class GanttEvent(BaseModel):
    id: int
    event_date: date
    start_time: time | None
    end_time: time | None
    title: str | None
    event_type: str
    status: str
    hours: float
    hours_source: Literal["worked", "times", "missing", "not_worked"]
    man_hours: float
    worked_hours: float | None
    technician_ids: list[int]
    technicians: list[str]
    servers: int
    migrated: int


class GanttProject(BaseModel):
    id: int
    name: str
    totals: Totals
    events: list[GanttEvent]


class GanttOrder(BaseModel):
    customer_id: int | None
    customer_name: str | None
    order_id: int | None
    order_code: str | None       # null = interventions without commessa
    totals: Totals
    projects: list[GanttProject]


class GanttReport(BaseModel):
    start: date
    end: date
    customer_id: int | None
    totals: Totals
    orders: list[GanttOrder]
