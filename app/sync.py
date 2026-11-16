"""Sync of a customer's projects between two installations of Date Spreader (via an export file).

The receiving installation compares the file with its own data and shows a report of the differences;
nothing is written until the user confirms, item by item.

- Identity: projects and interventions are recognized by `sync_uid` (the same on every installation),
  servers by hostname. Customers by name.
- Each item (project, intervention, server of the inventory) is compared through a hash of its content.
- Baseline: after each sync, the hash of every item the two installations agree on is stored
  (table sync_baselines, per other installation and per customer). Comparing here / in the file /
  baseline tells who changed what since the last sync:
      changed        only the other installation changed it   → proposed (selected)
      changed_here   only this installation changed it        → kept (not selected)
      conflict       both changed it                          → the user must choose
      new            only in the file                         → proposed
      deleted_here   in the file, deleted here after the last sync → not selected
      only_here      only here (never synced)                 → not selected (selecting it deletes it)
      deleted_there  deleted in the other installation after the last sync → not selected
  The export file also carries the exporter's baselines, so the sync works in both directions:
  the receiver uses the most recent baseline of the pair.
- An intervention is one item: its fields, participants and server rows together.
- Apply: one transaction, after a backup (done by the API), with an entry in the history.
"""

from __future__ import annotations

import hashlib
import json
import socket
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.i18n import tr
from app.models import (
    AppMeta, Customer, Event, EventServer, EventUser, Project, Server, SyncBaseline, SyncPeer,
)
from app.repositories.customers import clean_order_code, resolve_order
from app.schemas.transfer import ExportFile, XEvent, XProject, XServer, XTechnician
from app.transfer import (
    SERVER_EXPORT_FIELDS, Resolver, add_event, checked_end, export_projects, load_projects, new_report,
    where_label,
)

PROJECT_FIELDS = ("name", "description", "status")
EVENT_FIELDS = ("project", "event_date", "start_time", "end_time", "event_type", "status", "title",
                "order_code", "worked_hours", "notes", "participants")
ROW_FIELDS = ("target_operating_system", "target_kernel", "check_status", "migration_status",
              "planned_date", "executed_date", "technician", "notes")
DEFAULTS = {"equal": None, "changed": True, "changed_here": False, "conflict": None, "new": True,
            "deleted_here": False, "only_here": False, "deleted_there": False}


class SyncError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


# --- identity of this installation ------------------------------------------------------------


def instance_uid(session: Session) -> str:
    row = session.get(AppMeta, "instance_uid")
    if row is None:
        row = AppMeta(key="instance_uid", value=str(uuid.uuid4()))
        session.add(row)
        session.flush()
    return row.value


def instance_name() -> str:
    return socket.gethostname()


def export_extras(session: Session, customer: str | None) -> dict[str, Any]:
    """What an export adds for the sync: who exported it and its baselines for this customer."""
    out: dict[str, Any] = {"instance": {"uid": instance_uid(session), "name": instance_name()},
                           "sync_baselines": {}}
    if not customer:
        return out
    ckey = customer.lower()
    for peer in session.scalars(select(SyncPeer).where(SyncPeer.customer == ckey)):
        hashes = {b.key: b.hash for b in session.scalars(select(SyncBaseline).where(
            SyncBaseline.peer_uid == peer.uid, SyncBaseline.customer == ckey))}
        out["sync_baselines"][peer.uid] = {
            "at": peer.last_sync_at.isoformat(timespec="seconds") if peer.last_sync_at else None, "hashes": hashes}
    return out


# --- canonical content and hashes -------------------------------------------------------------


def _tm(v) -> str | None:
    return v.strftime("%H:%M") if v else None


def _iso(v) -> str | None:
    return v.isoformat() if v else None


class Side:
    """One side of the comparison (here or the file), as items: key → (canonical content, display)."""

    def __init__(self, projects: list[XProject], technicians: list[XTechnician], servers: list[XServer]):
        techs = {t.key: t for t in technicians}

        def ident(key: str | None) -> str | None:
            t = techs.get(key) if key else None
            return (t.email or t.display_name).lower() if t else None

        def name(key: str | None) -> str | None:
            t = techs.get(key) if key else None
            return t.display_name if t else None

        self.items: dict[str, dict[str, Any]] = {}
        self.projects: dict[str, XProject] = {}
        self.events: dict[str, tuple[XEvent, XProject]] = {}
        self.servers = {s.hostname: s for s in servers}
        for xp in projects:
            pkey = f"p:{xp.uid}"
            self.projects[pkey] = xp
            canon = {f: getattr(xp, f) for f in PROJECT_FIELDS}
            self._add(pkey, "project", canon, dict(canon), None)
            for xe in xp.events:
                ekey = f"e:{xe.uid}"
                self.events[ekey] = (xe, xp)
                rows = {}
                rows_show = {}
                for xr in xe.servers:
                    rows[xr.hostname] = {
                        "target_operating_system": xr.target_operating_system, "target_kernel": xr.target_kernel,
                        "check_status": xr.check_status, "migration_status": xr.migration_status,
                        "planned_date": _iso(xr.planned_date or xe.event_date), "executed_date": _iso(xr.executed_date),
                        "technician": ident(xr.technician), "notes": xr.notes,
                    }
                    rows_show[xr.hostname] = {**rows[xr.hostname], "technician": name(xr.technician)}
                code = clean_order_code(xe.order_code)
                canon = {
                    "project": xp.uid, "event_date": _iso(xe.event_date), "start_time": _tm(xe.start_time),
                    "end_time": _tm(xe.end_time), "event_type": xe.event_type, "status": xe.status,
                    "title": xe.title, "order_code": code.lower() if code else None,
                    "worked_hours": xe.worked_hours, "notes": xe.notes,
                    "participants": sorted(i for i in (ident(k) for k in xe.participants) if i),
                    "servers": rows,
                }
                show = {**canon, "project": xp.name, "order_code": code,
                        "participants": ", ".join(sorted(n for n in (name(k) for k in xe.participants) if n)) or None,
                        "servers": rows_show}
                self._add(ekey, "event", canon, show, pkey)
        for s in servers:
            canon = {f: getattr(s, f) for f in SERVER_EXPORT_FIELDS}
            self._add(f"s:{s.hostname}", "server", canon, dict(canon), None)

    def _add(self, key, kind, canon, show, parent) -> None:
        digest = hashlib.sha256(json.dumps(canon, sort_keys=True, default=str).encode()).hexdigest()[:32]
        self.items[key] = {"kind": kind, "hash": digest, "show": show, "parent": parent}


def _local_side(session: Session, data: ExportFile, customer: str | None) -> tuple[Side, list[Project]]:
    """This installation's side: the customer's projects (customer export) plus every project or
    intervention of the file that exists here; servers: those of the file that exist here."""
    puids = [xp.uid for xp in data.projects]
    euids = [xe.uid for xp in data.projects for xe in xp.events]
    cond = Project.sync_uid.in_(puids)
    if customer and _whole_customer(data):
        cond = cond | Project.customer_id.in_(select(Customer.id).where(func.lower(Customer.name) == customer.lower()))
    ids = set(session.scalars(select(Project.id).where(cond)))
    ids |= set(session.scalars(select(Event.project_id).where(Event.sync_uid.in_(euids))))
    projects = load_projects(session, list(ids)) if ids else []
    payload = export_projects(session, projects, {})
    xprojects = [XProject.model_validate(p) for p in payload["projects"]]
    xtechs = [XTechnician.model_validate(t) for t in payload["technicians"]]
    hosts = [s.hostname for s in data.servers]
    servers = list(session.scalars(select(Server).where(Server.hostname.in_(hosts)))) if hosts else []
    xservers = [XServer.model_validate({"hostname": s.hostname, **{f: getattr(s, f) for f in SERVER_EXPORT_FIELDS}})
                for s in servers]
    return Side(xprojects, xtechs, xservers), projects


def _whole_customer(data: ExportFile) -> bool:
    return bool(data.scope and data.scope.get("type") == "customer")


def _customer_of(data: ExportFile) -> str:
    names = {xp.customer for xp in data.projects}
    if _whole_customer(data) and data.scope.get("name"):
        names.add(data.scope["name"])
    names = {n for n in names if n}
    if len({n.lower() for n in names}) != 1:
        raise SyncError(tr("sync.one_customer"))
    return sorted(names)[0]


def _check_file(session: Session, data: ExportFile) -> None:
    if data.instance is None or any(not xp.uid or any(not xe.uid for xe in xp.events) for xp in data.projects):
        raise SyncError(tr("sync.old_file"))
    if data.instance.uid == instance_uid(session):
        raise SyncError(tr("sync.same_instance"))


# --- comparison --------------------------------------------------------------------------------


def _baseline(session: Session, data: ExportFile, customer: str) -> tuple[dict[str, str], dict[str, Any]]:
    """The most recent baseline of this pair: ours, or the one the exporter keeps for us."""
    peer_uid, ckey = data.instance.uid, customer.lower()
    peer = session.get(SyncPeer, (peer_uid, ckey))
    mine_at = peer.last_sync_at.isoformat(timespec="seconds") if peer and peer.last_sync_at else None
    theirs = data.sync_baselines.get(instance_uid(session))
    if theirs is not None and theirs.at and (mine_at is None or theirs.at > mine_at):
        return dict(theirs.hashes), {"at": theirs.at, "source": "file"}
    if mine_at is None:
        return {}, {"at": None, "source": None}
    hashes = {b.key: b.hash for b in session.scalars(select(SyncBaseline).where(
        SyncBaseline.peer_uid == peer_uid, SyncBaseline.customer == ckey))}
    return hashes, {"at": mine_at, "source": "here"}


def _state(h: str | None, t: str | None, b: str | None) -> str:
    if h and t:
        if h == t:
            return "equal"
        if b == h:
            return "changed"
        if b == t:
            return "changed_here"
        return "conflict"
    if t:
        return "deleted_here" if b else "new"
    return "deleted_there" if b else "only_here"


def _field_diff(here: dict | None, there: dict | None, fields) -> list[dict[str, Any]]:
    here, there = here or {}, there or {}
    return [{"field": f, "here": here.get(f), "there": there.get(f)} for f in fields if here.get(f) != there.get(f)]


def _rows_diff(here: dict | None, there: dict | None) -> list[dict[str, Any]]:
    here, there = (here or {}).get("servers") or {}, (there or {}).get("servers") or {}
    out = []
    for host in sorted(set(here) | set(there)):
        if host not in here:
            out.append({"hostname": host, "change": "added", "fields": []})
        elif host not in there:
            out.append({"hostname": host, "change": "removed", "fields": []})
        else:
            diff = _field_diff(here[host], there[host], ROW_FIELDS)
            if diff:
                out.append({"hostname": host, "change": "changed", "fields": diff})
    return out


def compare(session: Session, data: ExportFile) -> dict[str, Any]:
    """The differences between the file and this installation (writes nothing)."""
    _check_file(session, data)
    customer = _customer_of(data)
    here, _ = _local_side(session, data, customer)
    there = Side(data.projects, data.technicians, data.servers)
    base, base_info = _baseline(session, data, customer)
    whole = _whole_customer(data)

    keys = list(there.items)
    keys += [k for k in here.items if k not in there.items and (whole or here.items[k]["kind"] == "event")]
    items = []
    for key in keys:
        h, t = here.items.get(key), there.items.get(key)
        if h is None and t["kind"] == "server":
            continue                      # servers missing here are created with the rows that use them
        ref = t or h
        state = _state(h and h["hash"], t and t["hash"], base.get(key))
        hs, ts = h and h["show"], t and t["show"]
        item = {
            "key": key, "kind": ref["kind"], "state": state, "default": DEFAULTS[state],
            "here_hash": h and h["hash"], "there_hash": t and t["hash"],
            "here": hs, "there": ts, "parent": ref["parent"], "follows_parent": False, "blocked": None,
            "fields": [], "rows": [],
        }
        if state != "equal" and h and t:
            fields = {"project": PROJECT_FIELDS, "event": EVENT_FIELDS, "server": SERVER_EXPORT_FIELDS}[ref["kind"]]
            item["fields"] = _field_diff(hs, ts, fields)
            if ref["kind"] == "event":
                item["rows"] = _rows_diff(hs, ts)
        items.append(item)

    by_key = {i["key"]: i for i in items}
    for item in items:
        parent = by_key.get(item["parent"]) if item["parent"] else None
        if item["kind"] == "event" and parent is not None:
            # a new (or deleted) project carries its interventions: they follow its choice
            if parent["state"] in ("new", "deleted_here") and item["state"] in ("new", "deleted_here"):
                item["follows_parent"] = True
            elif parent["state"] in ("only_here", "deleted_there") and item["state"] in ("only_here", "deleted_there"):
                item["follows_parent"] = True
        if item["kind"] == "event" and item["state"] not in ("equal", "only_here", "deleted_there") and not item["follows_parent"]:
            target = item["there"]["project"]
            puid = there.events[item["key"]][1].uid
            if f"p:{puid}" not in here.items:
                item["blocked"] = tr("sync.blocked_project", name=target)
        if item["kind"] == "project" and item["state"] in ("new", "deleted_here", "changed", "changed_here", "conflict"):
            name = item["there"]["name"]
            clash = session.scalar(select(Project).where(func.lower(Project.name) == name.lower(),
                                                         Project.sync_uid != item["key"][2:]))
            if clash is not None:
                item["blocked"] = tr("sync.blocked_name", name=name)
        if item["blocked"]:
            item["default"] = False

    counts: dict[str, int] = {}
    for item in items:
        if not item["follows_parent"]:
            counts[item["state"]] = counts.get(item["state"], 0) + 1
    token = hashlib.sha256(json.dumps(sorted((i["key"], i["here_hash"] or "") for i in items)).encode()).hexdigest()[:32]
    return {
        "source": {"uid": data.instance.uid, "name": data.instance.name, "exported_at": data.exported_at,
                   "app_version": data.app_version},
        "customer": customer,
        "customer_exists": session.scalar(select(Customer.id).where(func.lower(Customer.name) == customer.lower())) is not None,
        "whole_customer": whole,
        "baseline": base_info,
        "items": items,
        "counts": counts,
        "token": token,
    }


# --- apply -------------------------------------------------------------------------------------


def _update_project(session: Session, project: Project, xp: XProject) -> None:
    changes = {f: (getattr(project, f), getattr(xp, f)) for f in PROJECT_FIELDS if getattr(project, f) != getattr(xp, f)}
    for f, (_, new) in changes.items():
        setattr(project, f, new)
    if changes:
        audit.record(session, "update", "projects", project.id, changes)


def _update_event(session: Session, event: Event, xe: XEvent, project: Project, res: Resolver) -> None:
    where = where_label(project.name, xe.event_date)
    values = {
        "event_date": xe.event_date, "start_time": xe.start_time, "end_time": checked_end(xe, where, res.warn),
        "event_type": xe.event_type, "status": xe.status, "title": xe.title, "notes": xe.notes,
        "worked_hours": xe.worked_hours,
    }
    changes = {f: (getattr(event, f), v) for f, v in values.items() if getattr(event, f) != v}
    if event.project_id != project.id:
        changes["project"] = (event.project.name, project.name)
        event.project = project
    order = resolve_order(session, project.customer_id, xe.order_code) if project.customer_id else None
    if (event.order_id or None) != (order.id if order else None):
        changes["order"] = (event.order.code if event.order else None, order.code if order else None)
        event.order = order
    for f, v in values.items():
        setattr(event, f, v)
    if changes:
        audit.record(session, "update", "events", event.id, changes, event_id=event.id)

    wanted = {u.id: u for u in (res.tech(k, where) for k in xe.participants) if u is not None}
    for link in list(event.participants):
        if link.user_id not in wanted:
            session.delete(link)
    have = {link.user_id for link in event.participants}
    for uid, user in wanted.items():
        if uid not in have:
            session.add(EventUser(event=event, user=user))

    rows = {link.server.hostname: link for link in event.server_links}
    incoming = {}
    for xr in xe.servers:
        incoming.setdefault(xr.hostname, xr)
    for host, link in rows.items():
        if host not in incoming:
            audit.record(session, "delete", "event_servers", link.id, {"server": (host, None)}, event_id=event.id)
            session.delete(link)
    session.flush()
    for position, (host, xr) in enumerate(incoming.items()):
        values = {
            "target_operating_system": xr.target_operating_system, "target_kernel": xr.target_kernel,
            "check_status": xr.check_status, "migration_status": xr.migration_status,
            "planned_date": xr.planned_date or xe.event_date, "executed_date": xr.executed_date,
            "assigned_user": res.tech(xr.technician, where), "notes": xr.notes, "position": position,
        }
        link = rows.get(host)
        if link is None:
            link = EventServer(event=event, server=res.server(host), **values)
            session.add(link)
            session.flush()
            audit.record(session, "create", "event_servers", link.id, {"server": (None, host)}, event_id=event.id)
            continue
        changes = {}
        for f, v in values.items():
            old = getattr(link, f)
            if old != v:
                if f != "position":
                    changes[f] = (old.display_name if f == "assigned_user" and old else old,
                                  v.display_name if f == "assigned_user" and v else v)
                setattr(link, f, v)
        if changes:
            audit.record(session, "update", "event_servers", link.id, changes, event_id=event.id)


def apply(session: Session, data: ExportFile, token: str, decisions: dict[str, bool]) -> dict[str, Any]:
    """Applies the chosen items (key → take the file's version or not). The caller commits."""
    diff = compare(session, data)
    if diff["token"] != token:
        raise SyncError(tr("sync.stale"), 409)
    by_key = {i["key"]: i for i in diff["items"]}
    for key in decisions:
        if key not in by_key:
            raise SyncError(tr("sync.unknown_item"))
    for item in diff["items"]:
        if item["state"] == "conflict" and not item["blocked"] and item["key"] not in decisions:
            raise SyncError(tr("sync.conflicts_open"))

    def take(item) -> bool:
        if item["state"] == "equal" or item["blocked"]:
            return False
        if item["follows_parent"]:
            return take(by_key[item["parent"]])
        return bool(decisions.get(item["key"], False))

    report = new_report()
    res = Resolver(session, data, report)
    there = Side(data.projects, data.technicians, data.servers)
    customer_name = diff["customer"]
    done = {"created": 0, "updated": 0, "deleted": 0}
    chosen = [i for i in diff["items"] if take(i)]
    if chosen:
        res.operating_systems()

    def local_project(uid: str) -> Project | None:
        return session.scalar(select(Project).where(Project.sync_uid == uid))

    def local_event(uid: str) -> Event | None:
        return session.scalar(select(Event).where(Event.sync_uid == uid))

    # projects first (their new interventions come with them), then interventions, then servers
    for item in (i for i in chosen if i["kind"] == "project"):
        uid = item["key"][2:]
        if item["state"] in ("new", "deleted_here"):
            xp = there.projects[item["key"]]
            project = Project(name=xp.name, description=xp.description, status=xp.status,
                              customer=res.customer(customer_name), is_demo=xp.is_demo, sync_uid=uid)
            session.add(project)
            session.flush()
            audit.record(session, "create", "projects", project.id, {"name": (None, project.name)})
            done["created"] += 1
        elif item["state"] in ("only_here", "deleted_there"):
            project = local_project(uid)
            audit.record(session, "delete", "projects", project.id, {"name": (project.name, None)})
            session.delete(project)
            done["deleted"] += 1
        else:
            _update_project(session, local_project(uid), there.projects[item["key"]])
            done["updated"] += 1
    session.flush()

    for item in (i for i in chosen if i["kind"] == "event"):
        uid = item["key"][2:]
        if item["state"] in ("only_here", "deleted_there"):
            if item["follows_parent"]:
                continue                      # deleted with its project
            event = local_event(uid)
            audit.record(session, "delete", "events", event.id, {"event_date": (event.event_date, None)}, event_id=event.id)
            session.delete(event)
            done["deleted"] += 1
            continue
        xe, xp = there.events[item["key"]]
        project = local_project(xp.uid)
        if item["state"] in ("new", "deleted_here"):
            add_event(session, project, xe, report, res)
            done["created"] += 1
        else:
            event = local_event(uid)
            _update_event(session, event, xe, project, res)
            done["updated"] += 1
    session.flush()

    for item in (i for i in chosen if i["kind"] == "server"):
        host = item["key"][2:]
        srv = session.scalar(select(Server).where(Server.hostname == host))
        xs = there.servers[host]
        changes = {f: (getattr(srv, f), getattr(xs, f)) for f in SERVER_EXPORT_FIELDS if getattr(srv, f) != getattr(xs, f)}
        for f, (_, v) in changes.items():
            setattr(srv, f, v)
        if changes:
            audit.record(session, "update", "servers", srv.id, changes)
            done["updated"] += 1
    session.flush()
    session.expire_all()

    # new baseline: every item that is now the same on both sides
    here, _ = _local_side(session, data, customer_name)
    ckey = customer_name.lower()
    peer_uid = data.instance.uid
    old = {b.key: b for b in session.scalars(select(SyncBaseline).where(
        SyncBaseline.peer_uid == peer_uid, SyncBaseline.customer == ckey))}
    base, _info = _baseline(session, data, customer_name)
    for key in set(here.items) | set(there.items) | set(old) | set(base):
        h, t = here.items.get(key), there.items.get(key)
        if h and t and h["hash"] == t["hash"]:
            new_hash = t["hash"]
        elif not h and not t:
            new_hash = None
        else:
            new_hash = base.get(key)          # still different: the last agreed version stays
        row = old.get(key)
        if new_hash is None:
            if row is not None:
                session.delete(row)
        elif row is None:
            session.add(SyncBaseline(peer_uid=peer_uid, key=key, customer=ckey, hash=new_hash))
        else:
            row.hash = new_hash
    peer = session.get(SyncPeer, (peer_uid, ckey))
    if peer is None:
        peer = SyncPeer(uid=peer_uid, customer=ckey)
        session.add(peer)
    peer.name = data.instance.name
    peer.last_sync_at = datetime.now().replace(microsecond=0)
    customer = session.scalar(select(Customer).where(func.lower(Customer.name) == ckey))
    audit.record(session, "sync", "customers", customer.id if customer else 0,
                 {"from": (None, data.instance.name or data.instance.uid)})
    session.flush()
    return {**done, "customer": customer_name, "source": diff["source"], "warnings": report["warnings"],
            "servers_created": report["servers"]["created"], "technicians_created": report["technicians"]["created"]}


def forget_identity(db_path) -> None:
    """After a restore: a new identity for this installation (see app.backup.restore_backup).

    The other installations then compare with it from scratch (differences become conflicts),
    instead of trusting baselines that describe data this database no longer has."""
    import sqlite3

    con = sqlite3.connect(db_path, timeout=30)
    try:
        if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_meta'").fetchone():
            con.execute("DELETE FROM app_meta WHERE key = 'instance_uid'")
            con.execute("INSERT INTO app_meta (key, value) VALUES ('instance_uid', ?)", (str(uuid.uuid4()),))
            con.commit()
    finally:
        con.close()


__all__ = ["SyncError", "apply", "compare", "export_extras", "forget_identity", "instance_uid"]
