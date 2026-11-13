from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel


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
    check_ko: int = 0           # righe con check KO
    migration_failed: int = 0   # righe con migrazione fallita
    migrated: int = 0           # righe con migrazione completata
    executed: int = 0           # righe con data di esecuzione (interventi di configurazione)
    user_ids: list[int] = []    # partecipanti e tecnici assegnati (per il filtro per tecnico)
    customer_id: int | None = None  # cliente del progetto (per il filtro per cliente)
    customer_name: str | None = None
    customer_color: str | None = None
    conflict_users: list[int] = []  # technicians also busy in another intervention at the same time
    conflict_servers: int = 0       # servers also in another intervention on the same day


class ProjectEventRef(BaseModel):
    id: int
    event_date: date
    title: str | None
    status: str
    event_type: str | None = None
    server_count: int = 0


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
    target_kernel: str | None
    target_operating_system: str | None = None
    check_status: str
    migration_status: str
    planned_date: date | None
    executed_date: date | None
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
            target_kernel=link.target_kernel,
            target_operating_system=link.target_operating_system,
            check_status=link.check_status,
            migration_status=link.migration_status,
            planned_date=link.planned_date,
            executed_date=link.executed_date,
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


class Conflict(BaseModel):
    """A scheduling conflict of an intervention (app/repositories/conflicts.py)."""

    kind: str          # "server" | "technician"
    ref_id: int        # server id or user id
    name: str          # hostname or technician name
    other: ConflictEvent


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
            notes=e.notes,
            participants=sorted(
                (UserRef(id=p.user.id, display_name=p.user.display_name) for p in e.participants),
                key=lambda u: u.display_name,
            ),
            servers=[ServerRow.from_link(link) for link in e.server_links],
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
                            event_type=e.event_type, server_count=len(e.server_links))
            for e in p.events
        ],
    )
