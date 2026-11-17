"""Export e import di progetti tra installazioni di Date Spreader.

- `export_projects`: costruisce il file (vedi app/schemas/transfer.py) per uno o più progetti.
- `import_file`: lo applica al database. Riconosce ciò che esiste già:
    clienti per nome, tecnici per email e poi per nome, server per hostname, sistemi operativi
    per famiglia e versione. I dati già presenti NON vengono sovrascritti (le differenze sui
    server sono solo segnalate). Un progetto con lo stesso nome viene saltato oppure importato
    come copia ("… (importato)"), a scelta.
  L'anteprima esegue lo stesso import e poi annulla tutto (rollback): ciò che mostra è
  esattamente ciò che succederà.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import __version__, audit
from app.i18n import current_language, tr
from app.repositories.customers import resolve_order
from app.models import (
    Customer, Event, EventCheckUser, EventServer, EventUser, OperatingSystem, Project, Server, User,
)
from app.schemas.transfer import FORMAT, FORMAT_VERSION, ExportFile, XEvent, XProject

SERVER_EXPORT_FIELDS = ("ip_address", "operating_system", "environment", "location", "current_kernel", "notes")


# --- export ------------------------------------------------------------------------------


def load_projects(session: Session, ids: list[int]) -> list[Project]:
    stmt = (
        select(Project).where(Project.id.in_(ids)).order_by(Project.name)
        .options(
            selectinload(Project.customer),
            selectinload(Project.events).selectinload(Event.server_links).selectinload(EventServer.server),
            selectinload(Project.events).selectinload(Event.server_links).selectinload(EventServer.assigned_user),
            selectinload(Project.events).selectinload(Event.participants).selectinload(EventUser.user),
            selectinload(Project.events).selectinload(Event.order),
        )
    )
    return list(session.scalars(stmt))


def _email(u: User) -> str | None:
    return None if u.external_id.startswith("local:") else u.external_id


def export_projects(session: Session, projects: list[Project], scope: dict[str, Any]) -> dict[str, Any]:
    """Dizionario pronto per json.dumps. Mai password, accessi o cronologia."""
    customers: dict[int, Customer] = {}
    servers: dict[int, Server] = {}
    techs: dict[int, str] = {}           # id utente → chiave nel file
    tech_list: list[dict[str, Any]] = []
    os_names: set[str] = set()

    def tech_key(u: User | None) -> str | None:
        if u is None:
            return None
        if u.id not in techs:
            techs[u.id] = f"t{len(techs) + 1}"
            tech_list.append({"key": techs[u.id], "display_name": u.display_name, "email": _email(u), "is_demo": u.is_demo})
        return techs[u.id]

    out_projects = []
    for p in projects:
        if p.customer is not None:
            customers[p.customer.id] = p.customer
        events = []
        for e in sorted(p.events, key=lambda e: (e.event_date, e.start_time or datetime.min.time(), e.id)):
            rows = []
            for link in sorted(e.server_links, key=lambda r: (r.position, r.id)):
                servers[link.server.id] = link.server
                for name in (link.server.operating_system, link.target_operating_system):
                    if name:
                        os_names.add(name)
                row = {
                    "hostname": link.server.hostname,
                    "target_operating_system": link.target_operating_system,
                    "target_kernel": link.target_kernel,
                    "check_status": link.check_status,
                    "migration_status": link.migration_status,
                    "planned_date": link.planned_date.isoformat() if link.planned_date else None,
                    "executed_date": link.executed_date.isoformat() if link.executed_date else None,
                    "technician": tech_key(link.assigned_user),
                    "notes": link.notes,
                }
                if link.check_executed_date:   # only when set: files stay the same for who does not use it
                    row["check_executed_date"] = link.check_executed_date.isoformat()
                rows.append(row)
            event = {
                "uid": e.sync_uid,
                "event_date": e.event_date.isoformat(),
                "start_time": e.start_time.strftime("%H:%M") if e.start_time else None,
                "end_time": e.end_time.strftime("%H:%M") if e.end_time else None,
                "event_type": e.event_type,
                "status": e.status,
                "title": e.title,
                "order_code": e.order.code if e.order else None,
                "worked_hours": e.worked_hours,
                "notes": e.notes,
                "participants": [tech_key(pu.user) for pu in sorted(e.participants, key=lambda x: x.user.display_name)],
                "servers": rows,
            }
            if e.check_date:   # pre-check (since 0.29), only when planned
                event.update({
                    "check_date": e.check_date.isoformat(),
                    "check_start_time": e.check_start_time.strftime("%H:%M") if e.check_start_time else None,
                    "check_end_time": e.check_end_time.strftime("%H:%M") if e.check_end_time else None,
                    "check_worked_hours": e.check_worked_hours,
                    "check_participants": [tech_key(pu.user) for pu in
                                           sorted(e.check_participants, key=lambda x: x.user.display_name)],
                })
            events.append(event)
        out_projects.append({
            "uid": p.sync_uid,
            "name": p.name, "description": p.description, "status": p.status,
            "customer": p.customer.name if p.customer else None, "is_demo": p.is_demo, "events": events,
        })

    os_items = []
    if os_names:
        known = {o.name: o for o in session.scalars(select(OperatingSystem))}
        os_items = [{"family": known[n].family, "major": known[n].major, "minor": known[n].minor}
                    for n in sorted(os_names) if n in known]

    return {
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "app_version": __version__,
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": scope,
        "customers": [{"name": c.name, "color": c.color, "is_demo": c.is_demo}
                      for c in sorted(customers.values(), key=lambda c: c.name)],
        "technicians": tech_list,
        "operating_systems": os_items,
        "servers": [{"hostname": s.hostname, **{f: getattr(s, f) for f in SERVER_EXPORT_FIELDS}, "is_demo": s.is_demo}
                    for s in sorted(servers.values(), key=lambda s: s.hostname)],
        "projects": out_projects,
    }


# --- import ------------------------------------------------------------------------------


def _unique_project_name(session: Session, name: str) -> str:
    taken = lambda n: session.scalar(select(Project.id).where(func.lower(Project.name) == n.lower())) is not None  # noqa: E731
    base = tr("transfer.copy_name", name=name)[:200]  # "… (imported)" / "… (importato)"
    candidate, i = base, 2
    while taken(candidate):
        suffix = f" {i}"
        candidate = base[: 200 - len(suffix)] + suffix
        i += 1
    return candidate


def new_report() -> dict[str, Any]:
    return {
        "projects": [],
        "customers": {"created": [], "existing": []},
        "technicians": {"created": [], "existing": []},
        "servers": {"created": [], "existing": [], "different": []},
        "operating_systems": {"created": [], "not_active": []},
        "warnings": [],
        "totals": {"projects": 0, "events": 0, "rows": 0},
    }


class Resolver:
    """Finds (or creates) here the customers, technicians, servers and operating systems of a file.

    Shared by the import and by the sync (app/sync.py). What it creates and finds goes in `report`.
    """

    def __init__(self, session: Session, data: ExportFile, report: dict[str, Any]):
        self.session = session
        self.data = data
        self.report = report
        self.warn = report["warnings"].append
        self._techs: dict[str, User] | None = None
        self._customers: dict[str, Customer] = {}
        self._servers: dict[str, Server] = {}
        self._xservers = {s.hostname: s for s in data.servers}

    def operating_systems(self) -> None:
        """Creates the missing versions (the ones disabled here stay disabled)."""
        session = self.session
        for xo in self.data.operating_systems:
            existing = session.scalars(select(OperatingSystem).where(
                func.lower(OperatingSystem.family) == xo.family.lower(), OperatingSystem.major == xo.major,
                OperatingSystem.minor.is_(None) if xo.minor is None else OperatingSystem.minor == xo.minor,
            )).first()
            if existing is None:
                item = OperatingSystem(family=xo.family, major=xo.major, minor=xo.minor, is_active=True)
                session.add(item)
                session.flush()
                audit.record(session, "create", "operating_systems", item.id, {"name": (None, item.name)})
                self.report["operating_systems"]["created"].append(item.name)
            elif not existing.is_active:
                self.report["operating_systems"]["not_active"].append(existing.name)

    def _load_techs(self) -> dict[str, User]:
        """Technicians: by email, then by name; otherwise new (technician role, without access)."""
        session = self.session
        found: dict[str, User] = {}
        for xt in self.data.technicians:
            user = None
            if xt.email:
                user = session.scalar(select(User).where(func.lower(User.external_id) == xt.email.lower()))
            if user is None:
                user = session.scalar(select(User).where(func.lower(User.display_name) == xt.display_name.lower()))
            if user is not None:
                self.report["technicians"]["existing"].append(user.display_name)
            else:
                user = User(external_id=xt.email or f"local:{uuid.uuid4().hex[:12]}", display_name=xt.display_name,
                            role="tecnico", is_active=True, is_demo=xt.is_demo)
                session.add(user)
                session.flush()
                audit.record(session, "create", "users", user.id, {"display_name": (None, user.display_name)})
                self.report["technicians"]["created"].append(user.display_name)
            found[xt.key] = user
        return found

    def technicians(self) -> dict[str, User]:
        if self._techs is None:
            self._techs = self._load_techs()
        return self._techs

    def tech(self, key: str | None, where: str) -> User | None:
        if key is None:
            return None
        self.technicians()
        if key not in self._techs:
            self.warn(tr("transfer.unknown_technician", where=where, key=key))
            return None
        return self._techs[key]

    def customer(self, name: str | None) -> Customer | None:
        """Customers: by name; the new ones with their color."""
        if not name:
            return None
        key = name.lower()
        if key in self._customers:
            return self._customers[key]
        session = self.session
        found = session.scalar(select(Customer).where(func.lower(Customer.name) == key))
        if found is not None:
            self.report["customers"]["existing"].append(found.name)
        else:
            xc = next((c for c in self.data.customers if c.name.lower() == key), None)
            found = Customer(name=xc.name if xc else name, color=xc.color if xc else None,
                             is_demo=xc.is_demo if xc else False)
            session.add(found)
            session.flush()
            audit.record(session, "create", "customers", found.id, {"name": (None, found.name)})
            self.report["customers"]["created"].append(found.name)
        self._customers[key] = found
        return found

    def server(self, hostname: str) -> Server:
        """Servers: by hostname; the existing ones are NOT changed (differences are reported)."""
        if hostname in self._servers:
            return self._servers[hostname]
        session = self.session
        found = session.scalar(select(Server).where(Server.hostname == hostname))
        xs = self._xservers.get(hostname)
        if found is not None:
            self.report["servers"]["existing"].append(hostname)
            if xs is not None:
                diff = [{"field": f, "file": getattr(xs, f), "here": getattr(found, f)}
                        for f in SERVER_EXPORT_FIELDS if getattr(xs, f) is not None and getattr(xs, f) != getattr(found, f)]
                if diff:
                    self.report["servers"]["different"].append({"hostname": hostname, "fields": diff})
        else:
            values = {f: getattr(xs, f) for f in SERVER_EXPORT_FIELDS} if xs else {}
            found = Server(hostname=hostname, is_demo=xs.is_demo if xs else False, **values)
            session.add(found)
            session.flush()
            audit.record(session, "create", "servers", found.id)
            self.report["servers"]["created"].append(hostname)
        self._servers[hostname] = found
        return found


def import_file(session: Session, data: ExportFile, on_conflict: str = "skip") -> dict[str, Any]:
    """Applica il file alla sessione (il commit, o il rollback per l'anteprima, li fa chi chiama)."""
    report = new_report()
    res = Resolver(session, data, report)
    res.operating_systems()
    res.technicians()
    for xp in data.projects:
        _import_project(session, xp, on_conflict, report, res)
    return report


def uid_free(session: Session, model, uid: str | None) -> bool:
    return bool(uid) and session.scalar(select(model.id).where(model.sync_uid == uid)) is None


def _import_project(session, xp: XProject, on_conflict, report, res: Resolver) -> None:
    clash = session.scalar(select(Project).where(func.lower(Project.name) == xp.name.lower()))
    entry = {"name": xp.name, "imported_as": None, "action": "creato",
             "events": len(xp.events), "rows": sum(len(e.servers) for e in xp.events)}
    report["projects"].append(entry)
    if clash is not None:
        if on_conflict == "skip":
            entry["action"] = "saltato"
            return
        entry["action"] = "copia"
    name = _unique_project_name(session, xp.name) if clash is not None else xp.name
    entry["imported_as"] = name

    project = Project(name=name, description=xp.description, status=xp.status,
                      customer=res.customer(xp.customer), is_demo=xp.is_demo)
    # the same sync identity as in the other installation, unless it is already used here (a copy)
    if uid_free(session, Project, xp.uid):
        project.sync_uid = xp.uid
    session.add(project)
    session.flush()
    audit.record(session, "create", "projects", project.id, {"name": (None, project.name)})
    report["totals"]["projects"] += 1

    for xe in xp.events:
        add_event(session, project, xe, report, res)


def where_label(project_name: str, day) -> str:
    text = day.isoformat() if current_language() == "en" else day.strftime("%d/%m/%Y")
    return f"{project_name}, {text}"


def checked_end(xe: XEvent, where: str, warn) -> Any:
    if xe.start_time and xe.end_time and xe.end_time <= xe.start_time:
        warn(tr("transfer.end_time_dropped", where=where))
        return None
    return xe.end_time


def check_values(xe: XEvent) -> dict:
    """Pre-check of an intervention of the file (times only with a day; an end before the start is dropped)."""
    if not xe.check_date:
        return {"check_date": None, "check_start_time": None, "check_end_time": None, "check_worked_hours": None}
    end = xe.check_end_time
    if end and xe.check_start_time and end <= xe.check_start_time:
        end = None
    return {"check_date": xe.check_date, "check_start_time": xe.check_start_time, "check_end_time": end,
            "check_worked_hours": xe.check_worked_hours}


def check_users(xe: XEvent, res: Resolver, where: str) -> list[User]:
    out: dict[int, User] = {}
    for key in xe.check_participants if xe.check_date else []:
        u = res.tech(key, where)
        if u is not None:
            out.setdefault(u.id, u)
    return list(out.values())


def add_event(session, project: Project, xe: XEvent, report, res: Resolver) -> Event:
    """Creates an intervention of the file (with participants and server rows) in `project`."""
    where = where_label(project.name, xe.event_date)
    event = Event(project=project, event_date=xe.event_date, start_time=xe.start_time,
                  end_time=checked_end(xe, where, res.warn),
                  event_type=xe.event_type, status=xe.status, title=xe.title, notes=xe.notes,
                  worked_hours=xe.worked_hours, **check_values(xe),
                  # the commessa goes on the (existing or new) customer of the imported project
                  order=resolve_order(session, project.customer_id, xe.order_code) if project.customer_id else None)
    if uid_free(session, Event, xe.uid):
        event.sync_uid = xe.uid
    session.add(event)
    session.flush()
    audit.record(session, "create", "events", event.id, {"event_date": (None, event.event_date)}, event_id=event.id)
    report["totals"]["events"] += 1

    seen_users: set[int] = set()
    for key in xe.participants:
        u = res.tech(key, where)
        if u is not None and u.id not in seen_users:
            seen_users.add(u.id)
            session.add(EventUser(event=event, user=u))
    for u in check_users(xe, res, where):
        session.add(EventCheckUser(event=event, user=u))

    seen_hosts: set[str] = set()
    for position, xr in enumerate(xe.servers):
        if xr.hostname in seen_hosts:
            res.warn(tr("transfer.duplicate_host", where=where, hostname=xr.hostname))
            continue
        seen_hosts.add(xr.hostname)
        srv = res.server(xr.hostname)
        row = EventServer(
            event=event, server=srv, position=position,
            target_operating_system=xr.target_operating_system, target_kernel=xr.target_kernel,
            check_status=xr.check_status, migration_status=xr.migration_status,
            planned_date=xr.planned_date or xe.event_date, executed_date=xr.executed_date,
            check_executed_date=xr.check_executed_date,
            assigned_user=res.tech(xr.technician, where), notes=xr.notes,
        )
        session.add(row)
        session.flush()
        audit.record(session, "create", "event_servers", row.id, {"server": (None, srv.hostname)}, event_id=event.id)
        report["totals"]["rows"] += 1
    return event
