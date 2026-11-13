"""Modelli ORM SQLAlchemy.

Ogni tabella modificabile dagli utenti ha una colonna `version` usata per
l'optimistic locking: SQLAlchemy la incrementa a ogni UPDATE e, se nel frattempo
un altro utente ha salvato, l'UPDATE non trova la riga e solleva StaleDataError.
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from app.db import Base
from app.models import statuses


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class VersionedMixin:
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    @declared_attr.directive
    def __mapper_args__(cls) -> dict:
        return {"version_id_col": cls.__table__.c.version}


class Customer(VersionedMixin, TimestampMixin, Base):
    """Cliente: raggruppa i progetti. Nome unico (senza distinguere maiuscole)."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Colore personalizzato (#RRGGBB) per tutti i progetti del cliente; None = colori automatici
    color: Mapped[str | None] = mapped_column(String(7))

    projects: Mapped[list[Project]] = relationship(back_populates="customer")
    orders: Mapped[list[CustomerOrder]] = relationship(
        back_populates="customer", cascade="all, delete-orphan", passive_deletes=True, order_by="CustomerOrder.code"
    )


class CustomerOrder(TimestampMixin, Base):
    """Commessa (job / order number) of a customer. Interventions of the customer's projects refer to it.

    Codes are unique per customer, without distinguishing case (checked in app.repositories.customers).
    """

    __tablename__ = "customer_orders"
    __table_args__ = (UniqueConstraint("customer_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(100))

    customer: Mapped[Customer] = relationship(back_populates="orders")


class Project(VersionedMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default=statuses.PROJECT_STATUSES[0])
    # Dato di esempio (demo): rimovibile con `python -m app.cli demo remove`.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Cliente (facoltativo). RESTRICT: un cliente con progetti non si può eliminare.
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)

    customer: Mapped[Customer | None] = relationship(back_populates="projects")
    events: Mapped[list[Event]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Event.event_date"
    )


class Event(VersionedMixin, TimestampMixin, Base):
    """Un intervento (migrazione/upgrade) di un progetto in una data."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    event_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    event_type: Mapped[str] = mapped_column(String(30), default=statuses.EVENT_TYPES[0])
    status: Mapped[str] = mapped_column(String(30), default=statuses.EVENT_STATUSES[0])
    notes: Mapped[str | None] = mapped_column(Text)
    # Commessa of the customer (optional); SET NULL if the commessa is deleted
    order_id: Mapped[int | None] = mapped_column(ForeignKey("customer_orders.id", ondelete="SET NULL"), index=True)
    # hours actually worked on the intervention (optional): when set, replaces end − start in the reports
    worked_hours: Mapped[float | None] = mapped_column(Float)

    project: Mapped[Project] = relationship(back_populates="events")
    order: Mapped[CustomerOrder | None] = relationship()
    server_links: Mapped[list[EventServer]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="EventServer.position"
    )
    participants: Mapped[list[EventUser]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class Server(VersionedMixin, TimestampMixin, Base):
    """Attributi stabili di una macchina, indipendenti dal singolo intervento."""

    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(primary_key=True)
    hostname: Mapped[str] = mapped_column(String(255), unique=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), index=True)  # 45 = IPv6
    operating_system: Mapped[str | None] = mapped_column(String(100))
    environment: Mapped[str | None] = mapped_column(String(30))
    current_kernel: Mapped[str | None] = mapped_column(String(100))
    # Where the machine is (site, datacenter, room…): free text; values already used are proposed in a menu
    location: Mapped[str | None] = mapped_column(String(100), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    # Dato di esempio (demo): rimovibile con `python -m app.cli demo remove`.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    event_links: Mapped[list[EventServer]] = relationship(back_populates="server")


class User(VersionedMixin, TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Identità aziendale (es. email Google Workspace); per ora solo dati fittizi.
    external_id: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(30), default=statuses.USER_ROLES[0])
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Dato di esempio (demo): rimovibile con `python -m app.cli demo remove`.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    # --- accesso al portale (facoltativo: senza password l'utente è solo un nome assegnabile)
    username: Mapped[str | None] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def can_login(self) -> bool:
        return self.is_active and bool(self.password_hash)


class OperatingSystem(Base):
    """Voce dell'elenco dei sistemi operativi selezionabili (gestito dagli amministratori).

    Il server conserva il nome come testo (`servers.operating_system`): disattivare o
    eliminare una voce non tocca i server che la usano.
    """

    __tablename__ = "operating_systems"
    __table_args__ = (UniqueConstraint("family", "major", "minor"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    family: Mapped[str] = mapped_column(String(100))   # es. "Red Hat Enterprise Linux"
    major: Mapped[int] = mapped_column(Integer)
    minor: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @property
    def name(self) -> str:
        return f"{self.family} {self.major}" + (f".{self.minor}" if self.minor is not None else "")


class UserPreferences(Base):
    """Preferenze personali (impostazioni dell'utente), come JSON validato dall'API.

    Tabella separata da `users`: aggiungere preferenze non richiede migrazioni.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class AuthSession(Base):
    """Sessione di accesso. Nel cookie c'è il token; qui solo il suo hash (SHA-256)."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(300))

    user: Mapped[User] = relationship()


class EventServer(VersionedMixin, TimestampMixin, Base):
    """Una riga della tabella server di un intervento: lo stato del server *in quell'evento*."""

    __tablename__ = "event_servers"
    __table_args__ = (UniqueConstraint("event_id", "server_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id", ondelete="RESTRICT"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)  # ordine delle righe in tabella
    target_kernel: Mapped[str | None] = mapped_column(String(100))
    # Sistema operativo di destinazione in questo intervento (voce dell'elenco sistemi operativi)
    target_operating_system: Mapped[str | None] = mapped_column(String(100))
    check_status: Mapped[str] = mapped_column(String(30), default=statuses.CHECK_STATUSES[0])
    migration_status: Mapped[str] = mapped_column(
        String(30), default=statuses.MIGRATION_STATUSES[0]
    )
    planned_date: Mapped[date | None] = mapped_column(Date)
    executed_date: Mapped[date | None] = mapped_column(Date)
    assigned_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)

    event: Mapped[Event] = relationship(back_populates="server_links")
    server: Mapped[Server] = relationship(back_populates="event_links")
    assigned_user: Mapped[User | None] = relationship()


class EventUser(Base):
    """Partecipanti di un intervento."""

    __tablename__ = "event_users"

    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )

    event: Mapped[Event] = relationship(back_populates="participants")
    user: Mapped[User] = relationship()


class AuditLog(Base):
    """Cronologia delle modifiche, un record per campo modificato."""

    __tablename__ = "audit_log"
    # Su SQLite evita il riuso degli id dopo una cancellazione; ignorato da PostgreSQL.
    __table_args__ = (
        Index("ix_audit_log_record", "table_name", "record_id"),  # cronologia di un record
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(10))  # create / update / delete
    table_name: Mapped[str] = mapped_column(String(50))
    record_id: Mapped[int] = mapped_column(Integer)
    # Intervento coinvolto: permette ai client di sapere cosa ricaricare (feed delle modifiche).
    event_id: Mapped[int | None] = mapped_column(Integer, index=True)
    field: Mapped[str | None] = mapped_column(String(100))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)


class CustomFieldDefinition(VersionedMixin, TimestampMixin, Base):
    """Colonna aggiuntiva configurabile, senza modificare lo schema SQL a runtime."""

    __tablename__ = "custom_field_definitions"
    __table_args__ = (UniqueConstraint("entity", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(50))  # per ora: "event_server"
    key: Mapped[str] = mapped_column(String(50))
    label: Mapped[str] = mapped_column(String(100))
    field_type: Mapped[str] = mapped_column(String(20), default=statuses.CUSTOM_FIELD_TYPES[0])
    options: Mapped[str | None] = mapped_column(Text)  # JSON per il tipo "scelta"
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CustomFieldValue(VersionedMixin, TimestampMixin, Base):
    __tablename__ = "custom_field_values"
    __table_args__ = (UniqueConstraint("definition_id", "record_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    definition_id: Mapped[int] = mapped_column(
        ForeignKey("custom_field_definitions.id", ondelete="CASCADE"), index=True
    )
    record_id: Mapped[int] = mapped_column(Integer, index=True)
    value: Mapped[str | None] = mapped_column(Text)


__all__ = [
    "AuditLog",
    "AuthSession",
    "Customer",
    "CustomFieldDefinition",
    "CustomFieldValue",
    "Event",
    "EventServer",
    "EventUser",
    "OperatingSystem",
    "Project",
    "Server",
    "User",
    "UserPreferences",
]
