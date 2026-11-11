"""Clienti. Tutti possono vedere e crearne di nuovi (dai moduli dei progetti);
rinominare ed eliminare è riservato agli amministratori."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_session
from app.auth import require_admin
from app.i18n import tr
from app.models import Customer
from app.repositories import customers as repo
from app.repositories.servers import Conflict, ValidationProblem

router = APIRouter(tags=["clienti"])
SessionDep = Annotated[Session, Depends(get_session)]


class CustomerOut(BaseModel):
    id: int
    version: int
    name: str
    color: str | None       # #RRGGBB, oppure None = colori automatici
    is_demo: bool
    project_count: int


class CustomerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=300)


class CustomerPatch(BaseModel):
    """Si inviano solo i campi da cambiare. color: "#RRGGBB" oppure null per tornare ai colori automatici."""

    model_config = ConfigDict(extra="forbid")
    version: int
    name: str | None = Field(default=None, max_length=300)
    color: str | None = Field(default=None, max_length=7)


def _out(c: Customer, n: int) -> CustomerOut:
    return CustomerOut(id=c.id, version=c.version, name=c.name, color=c.color, is_demo=c.is_demo, project_count=n)


def _errors(session: Session, exc: Exception) -> HTTPException:
    session.rollback()
    if isinstance(exc, Conflict):
        return HTTPException(409, {"message": str(exc), "current": None})
    return HTTPException(422, str(exc))


@router.get("/customers", response_model=list[CustomerOut])
def list_customers(session: SessionDep) -> list[CustomerOut]:
    """Clienti in ordine alfabetico, con il numero di progetti."""
    return [_out(c, n) for c, n in repo.list_customers(session)]


@router.post("/customers", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(session: SessionDep, data: CustomerIn) -> CustomerOut:
    try:
        customer = repo.create_customer(session, data.name)
        session.commit()
    except (Conflict, ValidationProblem) as exc:
        raise _errors(session, exc) from None
    return _out(customer, 0)


def _get(session: Session, customer_id: int) -> Customer:
    customer = session.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(404, tr("customers.not_found"))
    return customer


@router.patch("/customers/{customer_id}", response_model=CustomerOut, dependencies=[Depends(require_admin)])
def rename_customer(session: SessionDep, customer_id: int, data: CustomerPatch) -> CustomerOut:
    """Rinomina e/o cambia colore (solo amministratori)."""
    customer = _get(session, customer_id)
    if data.version != customer.version:
        raise HTTPException(409, {"message": tr("customers.conflict"), "current": None})
    try:
        if "name" in data.model_fields_set:
            repo.rename_customer(session, customer, data.name)
        if "color" in data.model_fields_set:
            repo.set_color(session, customer, data.color)
        session.commit()
    except (Conflict, ValidationProblem) as exc:
        raise _errors(session, exc) from None
    except StaleDataError:
        session.rollback()
        raise HTTPException(409, {"message": tr("customers.conflict"), "current": None}) from None
    n = dict((c.id, k) for c, k in repo.list_customers(session)).get(customer.id, 0)
    return _out(customer, n)


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_customer(session: SessionDep, customer_id: int) -> Response:
    customer = _get(session, customer_id)
    try:
        repo.delete_customer(session, customer)
        session.commit()
    except Conflict as exc:
        raise _errors(session, exc) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
