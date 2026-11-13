"""Import of a server list (CSV, TSV, rows pasted from a spreadsheet, or an .xlsx file) into the
server table of an intervention.

1. `read_table` turns the source into rows of strings (the delimiter of text is detected).
2. `detect_columns` recognises the header (English and Italian names, common synonyms) or, without
   a header, guesses hostname/IP from the content. The client can override the mapping.
3. `import_servers` checks every line first and adds one row per valid server, so a bad line never
   blocks the others. Servers already in the inventory are linked, and their data is
   updated only on request. The caller commits, or rolls back for a preview (same code, same result).
"""

from __future__ import annotations

import base64
import csv
import io
import ipaddress
import re
import unicodedata
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.i18n import tr
from app.models import Event, OperatingSystem, Server, User, statuses
from app.repositories import servers as repo
from app.schemas.edit import HOSTNAME_RE, SERVER_FIELDS, ServerRowCreate

MAX_ROWS = 2000
MAX_BYTES = 5 * 1024 * 1024

# Fields that can be imported, in table order. "assigned_user" is the technician of the row.
FIELDS = (
    "hostname", "ip_address", "operating_system", "environment", "location", "current_kernel",
    "target_operating_system", "target_kernel", "assigned_user", "notes",
)

# Header names (normalised: lowercase, letters and digits only), English and Italian
HEADER_NAMES = {
    "hostname": {"hostname", "host", "server", "servername", "nomeserver", "fqdn", "name", "nome", "nomehost", "macchina", "machine"},
    "ip_address": {"ip", "ipaddress", "indirizzoip", "indirizzo", "address", "ipv4", "ipv6", "addr"},
    "operating_system": {"os", "so", "sistemaoperativo", "operatingsystem", "osattuale", "soattuale", "currentos", "osversion", "versioneso", "versionesistemaoperativo"},
    "environment": {"environment", "env", "ambiente", "amb", "stage"},
    "location": {"location", "site", "sito", "sede", "datacenter", "datacentre", "dc", "ubicazione", "posizione", "luogo", "rack", "sala"},
    "current_kernel": {"kernel", "kernelattuale", "currentkernel", "kernelversion", "versionekernel"},
    "target_operating_system": {"targetos", "ostarget", "sotarget", "osdestinazione", "sodestinazione", "targetoperatingsystem", "sistemaoperativotarget", "newos", "nuovoso"},
    "target_kernel": {"targetkernel", "kerneltarget", "kerneldestinazione", "newkernel", "nuovokernel"},
    "assigned_user": {"technician", "tecnico", "assignee", "assegnato", "assignedto", "assegnatoa", "owner", "responsabile", "tech"},
    "notes": {"notes", "note", "comments", "commenti", "comment", "commento", "description", "descrizione", "remarks"},
}

ENVIRONMENTS = {
    "PROD": {"prod", "production", "produzione", "prd", "prod."},
    "TEST": {"test", "testing", "collaudo", "qa", "staging", "stage", "uat", "preprod", "preproduzione", "tst"},
    "DEV": {"dev", "development", "sviluppo", "svil", "develop"},
    "ALTRO": {"altro", "other", "others", "altri"},
}


class ServerImportError(Exception):
    """The source cannot be read (message for the user)."""


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def read_table(kind: str, content: str) -> list[list[str]]:
    """Rows of the source, without empty rows. kind: "text" (CSV/TSV/pasted) or "xlsx" (base64)."""
    if kind == "xlsx":
        try:
            raw = base64.b64decode(content, validate=True)
        except ValueError:
            raise ServerImportError(tr("import.bad_file")) from None
        if len(raw) > MAX_BYTES:
            raise ServerImportError(tr("import.too_big"))
        try:
            from openpyxl import load_workbook

            wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
            sheet = wb.active or wb.worksheets[0]
            rows = [[_cell(v) for v in row] for row in sheet.iter_rows(values_only=True)]
            wb.close()
        except Exception:  # noqa: BLE001  (any unreadable workbook)
            raise ServerImportError(tr("import.bad_xlsx")) from None
    else:
        if len(content.encode("utf-8", "ignore")) > MAX_BYTES:
            raise ServerImportError(tr("import.too_big"))
        text = content.lstrip("﻿")
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if not lines:
            return []
        first = lines[0]
        if "\t" in first:
            delimiter = "\t"
        else:
            counts = {d: first.count(d) for d in (";", ",", "|")}
            delimiter = max(counts, key=counts.get) if max(counts.values()) else ","
        rows = [[_cell(c) for c in r] for r in csv.reader(io.StringIO("\n".join(lines)), delimiter=delimiter)]
    rows = [r for r in rows if any(c for c in r)]
    width = max((len(r) for r in rows), default=0)
    while width and not any(len(r) >= width and r[width - 1] for r in rows):
        width -= 1  # trailing empty columns
    return [(r + [""] * width)[:width] for r in rows]


def _looks_like_host(v: str) -> bool:
    return bool(v) and bool(HOSTNAME_RE.match(v.strip().lower())) and not _looks_like_ip(v)


def _looks_like_ip(v: str) -> bool:
    try:
        ipaddress.ip_address(v.strip())
        return True
    except ValueError:
        return False


def detect_columns(rows: list[list[str]]) -> tuple[list[str | None], bool]:
    """(field of each column or None, first row is a header)."""
    if not rows:
        return [], False
    header = rows[0]
    mapping: list[str | None] = []
    used: set[str] = set()
    for cell in header:
        key = _norm(cell)
        found = next((f for f in FIELDS if f not in used and key in HEADER_NAMES[f]), None)
        if found:
            used.add(found)
        mapping.append(found)
    if any(mapping):
        return mapping, True
    # No header: hostname = first column that looks like host names, IP = first that looks like IPs
    sample = rows[:20]
    mapping = [None] * len(header)
    for i in range(len(header)):
        values = [r[i] for r in sample if r[i]]
        if not values:
            continue
        if "ip_address" not in mapping and all(_looks_like_ip(v) for v in values):
            mapping[i] = "ip_address"
        elif "hostname" not in mapping and all(_looks_like_host(v) for v in values):
            mapping[i] = "hostname"
    return mapping, False


def _os_key(name: str) -> str:
    n = name.lower().replace("red hat enterprise linux", "rhel").replace("redhat", "rhel")
    return re.sub(r"[^a-z0-9.]", "", n)


@dataclass
class Report:
    columns: list[dict] = field(default_factory=list)
    has_header: bool = False
    rows: list[dict] = field(default_factory=list)
    unknown_os: set[str] = field(default_factory=set)
    unknown_users: set[str] = field(default_factory=set)

    def as_dict(self) -> dict:
        totals = {k: 0 for k in ("added_new", "added_existing", "updated", "skipped", "errors")}
        for r in self.rows:
            totals[r["status"]] = totals.get(r["status"], 0) + 1
        return {
            "columns": self.columns, "has_header": self.has_header, "rows": self.rows,
            "unknown_os": sorted(self.unknown_os), "unknown_users": sorted(self.unknown_users),
            "totals": totals,
        }


def import_servers(
    session: Session, event: Event, rows: list[list[str]], mapping: list[str | None], has_header: bool,
    update_existing: bool = False,
) -> dict:
    """Adds the servers of `rows` to the intervention. Returns the report (see Report.as_dict)."""
    report = Report(has_header=has_header)
    header = rows[0] if rows else []
    data = rows[1:] if has_header else rows
    first = next(iter(data), [])
    report.columns = [
        {"index": i, "header": header[i] if has_header and i < len(header) else "", "field": f,
         "sample": first[i] if i < len(first) else ""}
        for i, f in enumerate(mapping)
    ]
    if len(data) > MAX_ROWS:
        raise ServerImportError(tr("import.too_many", n=MAX_ROWS))
    if "hostname" not in mapping:
        raise ServerImportError(tr("import.no_hostname"))
    col = {f: i for i, f in enumerate(mapping) if f}

    os_by_key = {_os_key(o.name): o.name for o in session.scalars(select(OperatingSystem).where(OperatingSystem.is_active))}
    users = list(session.scalars(select(User).where(User.is_active)))
    user_by_key: dict[str, User] = {}
    for u in users:
        for key in (u.display_name, u.username, u.external_id):
            if key and not key.startswith("local:"):
                user_by_key.setdefault(key.strip().lower(), u)
    in_event = {link.server.hostname for link in event.server_links}
    seen: set[str] = set()
    first_line = 2 if has_header else 1

    for n, raw in enumerate(data):
        line = first_line + n
        get = lambda f: raw[col[f]].strip() if f in col and col[f] < len(raw) else ""  # noqa: E731
        host = get("hostname").lower()
        entry = {"line": line, "hostname": host or get("hostname"), "status": "errors", "messages": [], "differences": []}
        report.rows.append(entry)
        if not host:
            entry["messages"].append(tr("import.row_no_hostname"))
            continue
        if host in seen:
            entry.update(status="skipped")
            entry["messages"].append(tr("import.row_duplicate"))
            continue
        seen.add(host)
        if host in in_event:
            entry.update(status="skipped")
            entry["messages"].append(tr("import.row_in_event"))
            continue

        values: dict[str, object] = {"hostname": host}
        for f in ("ip_address", "location", "current_kernel", "target_kernel", "notes"):
            if get(f):
                values[f] = get(f)
        for f in ("operating_system", "target_operating_system"):
            v = get(f)
            if v:
                match = os_by_key.get(_os_key(v))
                if match:
                    values[f] = match
                else:
                    report.unknown_os.add(v)
                    entry["messages"].append(tr("import.row_unknown_os", value=v))
        env = get("environment")
        if env:
            match = next((k for k, names in ENVIRONMENTS.items() if _norm(env) in {_norm(x) for x in names} or env.upper() == k), None)
            if match and match in statuses.ENVIRONMENTS:
                values["environment"] = match
            else:
                entry["messages"].append(tr("import.row_unknown_env", value=env))
        tech = get("assigned_user")
        if tech:
            u = user_by_key.get(tech.lower())
            if u:
                values["assigned_user_id"] = u.id
            else:
                report.unknown_users.add(tech)
                entry["messages"].append(tr("import.row_unknown_user", value=tech))

        try:
            data_row = ServerRowCreate(**values)
        except ValueError as exc:
            errors = getattr(exc, "errors", lambda: [])()
            msg = "; ".join(str(e.get("msg", "")).replace("Value error, ", "") for e in errors) or str(exc)
            entry["messages"].append(msg)
            continue

        existing = session.scalar(select(Server).where(func.lower(Server.hostname) == host))
        diffs = []
        if existing is not None:
            for f in SERVER_FIELDS:
                if f == "hostname":
                    continue
                new = getattr(data_row, f)
                if new is not None and new != getattr(existing, f):
                    diffs.append({"field": f, "current": getattr(existing, f), "file": new})
        entry["differences"] = diffs
        # Everything that could fail has been checked above (hostname, OS in the list, not already in
        # the intervention): no savepoints, which the SQLite driver does not handle inside a transaction.
        row, reused = repo.add_row(session, event, data_row)
        if reused and update_existing and diffs:
            old = {d["field"]: getattr(row.server, d["field"]) for d in diffs}
            for d in diffs:
                setattr(row.server, d["field"], d["file"])
            session.flush()
            audit.record(session, "update", "servers", row.server.id,
                         {f: (old[f], getattr(row.server, f)) for f in old}, event_id=event.id)
        in_event.add(host)
        if not reused:
            entry["status"] = "added_new"
        elif update_existing and diffs:
            entry["status"] = "updated"
        else:
            entry["status"] = "added_existing"
    return report.as_dict()

