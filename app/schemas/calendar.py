from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel

from app import checks, server_sort


class EventSummary(BaseModel):
    id: int
    project_id: int
    project_name: str
    title: str | None
    event_date: date
    start_time: time | None
    end_time: time | None
    event_type: str
    status: str
    server_count: int
    check_ko: int = 0           # righe con check KO (shown as FAIL)
    check_warn: int = 0         # rows with check "warning"
    migration_failed: int = 0   # righe con migrazione fallita
    migrated: int = 0           # righe con migrazione completata
    executed: int = 0           # righe con data di esecuzione (interventi di configurazione)
    user_ids: list[int] = []    # partecipanti e tecnici assegnati (per il filtro per tecnico)
    customer_id: int | None = None  # cliente del progetto (per il filtro per cliente)
    customer_name: str | None = None
    customer_color: str | None = None
    order_code: str | None = None   # commessa of the customer
    conflict_users: list[int] = []  # technicians also busy in another intervention at the same time
    conflict_servers: int = 0       # servers also in another intervention on the same day
    # "event" = the intervention on its day; "check" = its pre-check on the check day (same id: it opens
    # the same intervention; event_date/start_time/end_time/user_ids are the check's)
    kind: str = "event"
    intervention_date: date | None = None   # day of the intervention (on a "check" entry: not its day)
    check_date: date | None = None      # day of the pre-check (on the "event" entry)
    check_done: int = 0                 # rows whose check is over (OK, KO, not applicable)
    check_ok: int = 0                   # rows with check OK
    check_pending: int = 0              # rows with check to do, in progress or KO
    check_warning: bool = False         # the check day is over and some servers have no good check


class ProjectEventRef(BaseModel):
    id: int
    event_date: date
    title: str | None
    status: str
    event_type: str | None = None
    server_count: int = 0
    start_time: time | None = None
    end_time: time | None = None
    order_code: str | None = None   # commessa of the customer


class ProjectSummary(BaseModel):
    id: int
    version: int = 1
    name: str
    description: str | None
    status: str
    is_demo: bool = False
    customer_id: int | None = None
    customer_name: str | None = None
    customer_color: str | None = None
    events: list[ProjectEventRef]


class UserRef(BaseModel):
    id: int
    display_name: str


class ProjectRef(BaseModel):
    id: int
    name: str
    customer_name: str | None = None
    customer_id: int | None = None


class ServerRow(BaseModel):
    """Una riga della tabella server di un intervento (event_servers + dati del server)."""

    id: int  # id della riga event_servers
    version: int
    position: int
    server_id: int
    server_version: int  # versione del server: serve per modificare i suoi campi
    hostname: str
    ip_address: str | None
    operating_system: str | None
    environment: str | None
    current_kernel: str | None
    location: str | None = None
    steamroller_inventory: str | None = None
    target_kernel: str | None
    target_operating_system: str | None = None
    check_status: str
    migration_status: str
    planned_date: date | None
    executed_date: date | None
    check_executed_date: date | None = None   # when the check of this server was done (OK/KO)
    assigned_user: UserRef | None
    notes: str | None

    @classmethod
    def from_link(cls, link) -> ServerRow:
        """Da una riga EventServer (con .server e .assigned_user caricati)."""
        srv = link.server
        user = link.assigned_user
        return cls(
            id=link.id,
            version=link.version,
            position=link.position,
            server_id=srv.id,
            server_version=srv.version,
            hostname=srv.hostname,
            ip_address=srv.ip_address,
            operating_system=srv.operating_system,
            environment=srv.environment,
            current_kernel=srv.current_kernel,
            location=srv.location,
            steamroller_inventory=srv.steamroller_inventory,
            target_kernel=link.target_kernel,
            target_operating_system=link.target_operating_system,
            check_status=link.check_status,
            migration_status=link.migration_status,
            planned_date=link.planned_date,
            executed_date=link.executed_date,
            check_executed_date=link.check_executed_date,
            assigned_user=UserRef(id=user.id, display_name=user.display_name) if user else None,
            notes=link.notes,
        )


class ConflictEvent(BaseModel):
    id: int
    event_date: date
    start_time: time | None
    end_time: time | None
    title: str | None
    project_name: str
    customer_name: str | None
    is_check: bool = False   # the other one is the pre-check of that intervention (date/times of the check)


class Conflict(BaseModel):
    """A scheduling conflict of an intervention (app/repositories/conflicts.py)."""

    kind: str          # "server" | "technician"
    ref_id: int        # server id or user id
    name: str          # hostname or technician name
    other: ConflictEvent
    on_check: bool = False   # conflict of the pre-check of this intervention (not of the intervention day)


class EventDetail(BaseModel):
    id: int
    version: int
    project: ProjectRef
    title: str | None
    event_date: date
    start_time: time | None
    end_time: time | None
    event_type: str
    status: str
    notes: str | None
    participants: list[UserRef]
    servers: list[ServerRow]
    conflicts: list[Conflict] = []
    order_code: str | None = None   # commessa of the customer
    worked_hours: float | None = None  # hours actually worked (null = from the times)
    check_date: date | None = None             # pre-check (see app/checks.py)
    check_start_time: time | None = None
    check_end_time: time | None = None
    check_worked_hours: float | None = None    # hours actually worked on the check (null = from its times)
    check_participants: list[UserRef] = []     # technicians of the check (empty = the participants)
    check_warning: bool = False
    server_sort: str | None = None             # order of the servers, the same for everybody (app/server_sort.py)

    @classmethod
    def from_event(cls, e) -> EventDetail:
        """Da un Event con project, participants e server_links caricati."""
        return cls(
            id=e.id,
            version=e.version,
            project=ProjectRef(id=e.project.id, name=e.project.name,
                               customer_name=e.project.customer.name if e.project.customer else None,
                               customer_id=e.project.customer_id),
            title=e.title,
            event_date=e.event_date,
            start_time=e.start_time,
            end_time=e.end_time,
            event_type=e.event_type,
            status=e.status,
            order_code=e.order.code if e.order else None,
            worked_hours=e.worked_hours,
            notes=e.notes,
            participants=sorted(
                (UserRef(id=p.user.id, display_name=p.user.display_name) for p in e.participants),
                key=lambda u: u.display_name,
            ),
            servers=[ServerRow.from_link(link) for link in server_sort.sort_rows(e.server_links, e.server_sort)],
            server_sort=e.server_sort,
            check_date=e.check_date,
            check_start_time=e.check_start_time,
            check_end_time=e.check_end_time,
            check_worked_hours=e.check_worked_hours,
            check_participants=sorted(
                (UserRef(id=p.user.id, display_name=p.user.display_name) for p in e.check_participants),
                key=lambda u: u.display_name,
            ),
            check_warning=checks.warning(e.status, e.check_date,
                                         sum(1 for link in e.server_links if link.check_status in checks.PENDING),
                                         date.today()),
        )


class SearchServerHit(BaseModel):
    row_id: int
    event_id: int
    event_date: date
    project_id: int
    project_name: str
    hostname: str
    ip_address: str | None
    operating_system: str | None
    check_status: str
    migration_status: str


class SearchResult(BaseModel):
    projects: list[ProjectRef]
    servers: list[SearchServerHit]


class ChangedEvent(BaseModel):
    id: int
    event_date: date


class Changes(BaseModel):
    last_id: int
    events: list[ChangedEvent]
    projects_changed: bool = False  # progetti creati o modificati: la sidebar va ricaricata
    users_changed: bool = False     # tecnici creati o modificati: ricaricare i menu
    dates: list[date] = []          # altre date da ridisegnare (interventi spostati o eliminati)


def project_summary(p) -> ProjectSummary:
    """Da un Project con `events` (e relativi server_links) caricati."""
    return ProjectSummary(
        id=p.id, version=p.version, name=p.name, description=p.description, status=p.status,
        is_demo=p.is_demo,
        customer_id=p.customer_id,
        customer_name=p.customer.name if p.customer else None,
        customer_color=p.customer.color if p.customer else None,
        events=[
            ProjectEventRef(id=e.id, event_date=e.event_date, title=e.title, status=e.status,
                            event_type=e.event_type, server_count=len(e.server_links),
                            start_time=e.start_time, end_time=e.end_time,
                            order_code=e.order.code if e.order else None)
            for e in p.events
        ],
    )
