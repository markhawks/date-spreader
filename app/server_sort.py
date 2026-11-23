"""Order of the server rows of an intervention (Event.server_sort): saved on the intervention, so that
everybody sees the same order, and applied by the server to every list of its rows.

server_sort = "<field>" (ascending) or "-<field>" (descending); None = the order of insertion.
Texts: alphabetical (case-insensitive); IP: numeric; OS, kernels and other texts with numbers: natural
(RHEL 9.8 before 10.2); dates: chronological; statuses: the order of the work (to do → … → done).
Empty values always go last; equal values in hostname order.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Any

from app.models import statuses

FIELDS = (
    "hostname", "ip_address", "operating_system", "environment", "location", "steamroller_inventory",
    "current_kernel", "target_operating_system", "target_kernel", "check_status", "migration_status",
    "executed_date", "assigned_user", "notes",
)
_NUM = re.compile(r"(\d+)")


def valid(spec: str | None) -> bool:
    return spec is None or spec.lstrip("-") in FIELDS


def _natural(text: str) -> tuple:
    return tuple(int(p) if p.isdigit() else p for p in _NUM.split(text.casefold()) if p != "")


def _value(row, field: str) -> Any:
    srv = row.server
    if field in ("hostname", "ip_address", "operating_system", "environment", "location", "steamroller_inventory",
                 "current_kernel"):
        v = getattr(srv, field)
    elif field == "assigned_user":
        v = row.assigned_user.display_name if row.assigned_user else None
    else:
        v = getattr(row, field)
    if v is None or v == "":
        return None
    if field == "ip_address":
        try:
            ip = ipaddress.ip_address(v)
            return (ip.version, int(ip))
        except ValueError:
            return (9, _natural(v))
    if field == "check_status":
        return statuses.CHECK_STATUSES.index(v) if v in statuses.CHECK_STATUSES else 99
    if field == "migration_status":
        return statuses.MIGRATION_STATUSES.index(v) if v in statuses.MIGRATION_STATUSES else 99
    if field == "executed_date":
        return v
    return _natural(str(v))


def sort_rows(rows: list, spec: str | None) -> list:
    """The rows in the order of `spec` (empty values last, ties by hostname); unchanged without spec."""
    if not spec or not valid(spec):
        return list(rows)
    field, desc = spec.lstrip("-"), spec.startswith("-")
    by_host = sorted(rows, key=lambda r: (_natural(r.server.hostname), r.position, r.id))
    filled = [r for r in by_host if _value(r, field) is not None]
    empty = [r for r in by_host if _value(r, field) is None]
    filled.sort(key=lambda r: _value(r, field), reverse=desc)   # stable: ties keep the hostname order
    return filled + empty
