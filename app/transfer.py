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

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import __version__, audit
from app.i18n import current_language, tr
from app.models import (
    Customer, Event, EventServer, EventUser, OperatingSystem, Project, Server, User,
)
from app.schemas.transfer import FORMAT, FORMAT_VERSION, ExportFile, XProject

SERVER_EXPORT_FIELDS = ("ip_address", "operating_system", "environment", "current_kernel", "notes")


# --- export ------------------------------------------------------------------------------


def load_projects(session: Session, ids: list[int]) -> list[Project]:
    stmt = (
        select(Project).where(Project.id.in_(ids)).order_by(Project.name)
        .options(
            selectinload(Project.customer),
            selectinload(Project.events).selectinload(Event.server_links).selectinload(EventServer.server),
            selectinload(Project.events).selectinload(Event.server_links).selectinload(EventServer.assigned_user),
            selectinload(Project.events).selectinload(Event.participants).selectinload(EventUser.user),
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
                rows.append({
                    "hostname": link.server.hostname,
                    "target_operating_system": link.target_operating_system,
                    "target_kernel": link.target_kernel,
                    "check_status": link.check_status,
                    "migration_status": link.migration_status,
                    "planned_date": link.planned_date.isoformat() if link.planned_date else None,
                    "executed_date": link.executed_date.isoformat() if link.executed_date else None,
                    "technician": tech_key(link.assigned_user),
                    "notes": link.notes,
                })
            events.append({
                "event_date": e.event_date.isoformat(),
                "start_time": e.start_time.strftime("%H:%M") if e.start_time else None,
                "end_time": e.end_time.strftime("%H:%M") if e.end_time else None,
                "event_type": e.event_type,
                "status": e.status,
                "title": e.title,
                "notes": e.notes,
                "participants": [tech_key(pu.user) for pu in sorted(e.participants, key=lambda x: x.user.display_name)],
                "servers": rows,
            })
        out_projects.append({
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


def import_file(session: Session, data: ExportFile, on_conflict: str = "skip") -> dict[str, Any]:
    """Applica il file alla sessione (il commit, o il rollback per l'anteprima, li fa chi chiama)."""
    report: dict[str, Any] = {
        "projects": [],
        "customers": {"created": [], "existing": []},
        "technicians": {"created": [], "existing": []},
        "servers": {"created": [], "existing": [], "different": []},
        "operating_systems": {"created": [], "not_active": []},
        "warnings": [],
        "totals": {"projects": 0, "events": 0, "rows": 0},
    }
    warn = report["warnings"].append

    # Sistemi operativi: crea le versioni che mancano (quelle disattivate qui restano disattivate)
    for xo in data.operating_systems:
        existing = session.scalars(select(OperatingSystem).where(
            func.lower(OperatingSystem.family) == xo.family.lower(), OperatingSystem.major == xo.major,
            OperatingSystem.minor.is_(None) if xo.minor is None else OperatingSystem.minor == xo.minor,
        )).first()
        if existing is None:
            item = OperatingSystem(family=xo.family, major=xo.major, minor=xo.minor, is_active=True)
            session.add(item)
            session.flush()
            audit.record(session, "create", "operating_systems", item.id, {"name": (None, item.name)})
            report["operating_systems"]["created"].append(item.name)
        elif not existing.is_active:
            report["operating_systems"]["not_active"].append(existing.name)

    # Tecnici: per email, poi per nome; altrimenti nuovi (ruolo tecnico, senza accesso)
    tech_by_key: dict[str, User] = {}
    for xt in data.technicians:
        user = None
        if xt.email:
            user = session.scalar(select(User).where(func.lower(User.external_id) == xt.email.lower()))
        if user is None:
            user = session.scalar(select(User).where(func.lower(User.display_name) == xt.display_name.lower()))
        if user is not None:
            report["technicians"]["existing"].append(user.display_name)
        else:
            import uuid

            user = User(external_id=xt.email or f"local:{uuid.uuid4().hex[:12]}", display_name=xt.display_name,
                        role="tecnico", is_active=True, is_demo=xt.is_demo)
            session.add(user)
            session.flush()
            audit.record(session, "create", "users", user.id, {"display_name": (None, user.display_name)})
            report["technicians"]["created"].append(user.display_name)
        tech_by_key[xt.key] = user

    def tech(key: str | None, where: str) -> User | None:
        if key is None:
            return None
        if key not in tech_by_key:
            warn(tr("transfer.unknown_technician", where=where, key=key))
            return None
        return tech_by_key[key]

    # Clienti: per nome; i nuovi con il loro colore
    customer_by_name: dict[str, Customer] = {}

    def customer(name: str | None) -> Customer | None:
        if not name:
            return None
        key = name.lower()
        if key in customer_by_name:
            return customer_by_name[key]
        found = session.scalar(select(Customer).where(func.lower(Customer.name) == key))
        if found is not None:
            report["customers"]["existing"].append(found.name)
        else:
            xc = next((c for c in data.customers if c.name.lower() == key), None)
            found = Customer(name=xc.name if xc else name, color=xc.color if xc else None, is_demo=xc.is_demo if xc else False)
            session.add(found)
            session.flush()
            audit.record(session, "create", "customers", found.id, {"name": (None, found.name)})
            report["customers"]["created"].append(found.name)
        customer_by_name[key] = found
        return found

    # Server: per hostname; quelli esistenti NON vengono modificati (differenze segnalate)
    xservers = {s.hostname: s for s in data.servers}
    server_by_host: dict[str, Server] = {}

    def server(hostname: str) -> Server:
        if hostname in server_by_host:
            return server_by_host[hostname]
        found = session.scalar(select(Server).where(Server.hostname == hostname))
        xs = xservers.get(hostname)
        if found is not None:
            report["servers"]["existing"].append(hostname)
            if xs is not None:
                diff = [{"field": f, "file": getattr(xs, f), "here": getattr(found, f)}
                        for f in SERVER_EXPORT_FIELDS if getattr(xs, f) is not None and getattr(xs, f) != getattr(found, f)]
                if diff:
                    report["servers"]["different"].append({"hostname": hostname, "fields": diff})
        else:
            values = {f: getattr(xs, f) for f in SERVER_EXPORT_FIELDS} if xs else {}
            found = Server(hostname=hostname, is_demo=xs.is_demo if xs else False, **values)
            session.add(found)
            session.flush()
            audit.record(session, "create", "servers", found.id)
            report["servers"]["created"].append(hostname)
        server_by_host[hostname] = found
        return found

    for xp in data.projects:
        _import_project(session, xp, on_conflict, report, customer, server, tech, warn)
    return report


def _import_project(session, xp: XProject, on_conflict, report, customer, server, tech, warn) -> None:
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
                      customer=customer(xp.customer), is_demo=xp.is_demo)
    session.add(project)
    session.flush()
    audit.record(session, "create", "projects", project.id, {"name": (None, project.name)})
    report["totals"]["projects"] += 1

    for xe in xp.events:
        day = xe.event_date.isoformat() if current_language() == "en" else xe.event_date.strftime("%d/%m/%Y")
        where = f"{name}, {day}"
        end = xe.end_time
        if xe.start_time and end and end <= xe.start_time:
            warn(tr("transfer.end_time_dropped", where=where))
            end = None
        event = Event(project=project, event_date=xe.event_date, start_time=xe.start_time, end_time=end,
                      event_type=xe.event_type, status=xe.status, title=xe.title, notes=xe.notes)
        session.add(event)
        session.flush()
        audit.record(session, "create", "events", event.id, {"event_date": (None, event.event_date)}, event_id=event.id)
        report["totals"]["events"] += 1

        seen_users: set[int] = set()
        for key in xe.participants:
            u = tech(key, where)
            if u is not None and u.id not in seen_users:
                seen_users.add(u.id)
                session.add(EventUser(event=event, user=u))

        seen_hosts: set[str] = set()
        for position, xr in enumerate(xe.servers):
            if xr.hostname in seen_hosts:
                warn(tr("transfer.duplicate_host", where=where, hostname=xr.hostname))
                continue
            seen_hosts.add(xr.hostname)
            srv = server(xr.hostname)
            row = EventServer(
                event=event, server=srv, position=position,
                target_operating_system=xr.target_operating_system, target_kernel=xr.target_kernel,
                check_status=xr.check_status, migration_status=xr.migration_status,
                planned_date=xr.planned_date or xe.event_date, executed_date=xr.executed_date,
                assigned_user=tech(xr.technician, where), notes=xr.notes,
            )
            session.add(row)
            session.flush()
            audit.record(session, "create", "event_servers", row.id, {"server": (None, srv.hostname)}, event_id=event.id)
            report["totals"]["rows"] += 1
