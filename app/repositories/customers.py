"""Clienti: elenco, creazione (anche dai moduli dei progetti), rinomina, eliminazione se senza progetti."""

from __future__ import annotations

import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.i18n import tr
from app.models import Customer, CustomerOrder, Event, Project
from app.repositories.servers import Conflict, ValidationProblem


def clean_name(name: str | None) -> str:
    name = " ".join(str(name or "").split())
    if not name:
        raise ValidationProblem(tr("customers.name_required"))
    if len(name) > 200:
        raise ValidationProblem(tr("customers.name_too_long", max=200))
    return name


def list_customers(session: Session) -> list[tuple[Customer, int]]:
    counts = dict(session.execute(
        select(Project.customer_id, func.count()).where(Project.customer_id.is_not(None)).group_by(Project.customer_id)
    ).all())
    customers = session.scalars(select(Customer).order_by(func.lower(Customer.name)))
    return [(c, counts.get(c.id, 0)) for c in customers]


def _check_unique(session: Session, name: str, exclude_id: int | None = None) -> None:
    q = select(Customer).where(func.lower(Customer.name) == name.lower())
    if exclude_id:
        q = q.where(Customer.id != exclude_id)
    other = session.scalars(q).first()
    if other is not None:
        raise Conflict(tr("customers.name_taken", name=other.name))


def create_customer(session: Session, name: str) -> Customer:
    name = clean_name(name)
    _check_unique(session, name)
    customer = Customer(name=name)
    session.add(customer)
    session.flush()
    audit.record(session, "create", "customers", customer.id, {"name": (None, name)})
    return customer


def rename_customer(session: Session, customer: Customer, name: str) -> None:
    name = clean_name(name)
    _check_unique(session, name, exclude_id=customer.id)
    if name != customer.name:
        audit.record(session, "update", "customers", customer.id, {"name": (customer.name, name)})
        customer.name = name
        session.flush()


def delete_customer(session: Session, customer: Customer) -> None:
    used = session.scalar(select(func.count()).select_from(Project).where(Project.customer_id == customer.id))
    if used:
        raise Conflict(tr("customers.has_projects", name=customer.name, count=used))
    audit.record(session, "delete", "customers", customer.id, {"name": (customer.name, None)})
    session.delete(customer)
    session.flush()


def check_customer(session: Session, customer_id: int | None) -> None:
    if customer_id is not None and session.get(Customer, customer_id) is None:
        raise ValidationProblem(tr("customers.invalid"))


COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def set_color(session: Session, customer: Customer, color: str | None) -> None:
    """Colore dei progetti del cliente (#RRGGBB); None torna ai colori automatici."""
    if color is not None:
        color = color.strip()
        if not COLOR_RE.match(color):
            raise ValidationProblem(tr("customers.invalid_color"))
        color = color.lower()
    if color != customer.color:
        audit.record(session, "update", "customers", customer.id, {"color": (customer.color, color)})
        customer.color = color
        session.flush()


# --- commesse (job / order numbers) of a customer ------------------------------------------


def clean_order_code(code: str | None) -> str | None:
    """Spaces trimmed and collapsed; empty → None."""
    code = " ".join(str(code or "").split())
    return code[:100] or None


def list_orders(session: Session, customer_id: int) -> list[tuple[CustomerOrder, int]]:
    """Commesse of a customer with the number of interventions that use them, by code."""
    count = (
        select(func.count(Event.id)).where(Event.order_id == CustomerOrder.id).correlate(CustomerOrder).scalar_subquery()
    )
    rows = session.execute(
        select(CustomerOrder, count).where(CustomerOrder.customer_id == customer_id)
        .order_by(func.lower(CustomerOrder.code))
    ).all()
    return [(o, n) for o, n in rows]


def resolve_order(session: Session, customer_id: int | None, code: str | None) -> CustomerOrder | None:
    """The customer's commessa with this code (case-insensitive), created if it does not exist yet.

    None for an empty code. A commessa belongs to a customer: a project without customer cannot have one.
    """
    code = clean_order_code(code)
    if code is None:
        return None
    if customer_id is None:
        raise ValidationProblem(tr("orders.no_customer"))
    found = session.scalar(select(CustomerOrder).where(
        CustomerOrder.customer_id == customer_id, func.lower(CustomerOrder.code) == code.lower()))
    if found is not None:
        return found
    order = CustomerOrder(customer_id=customer_id, code=code)
    session.add(order)
    session.flush()
    audit.record(session, "create", "customer_orders", order.id, {"code": (None, code)})
    return order
