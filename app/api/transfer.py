"""Export e import di progetti tra installazioni di Date Spreader.

- Export (coordinatori e amministratori): un progetto, oppure un cliente con tutti i suoi progetti.
  Ogni export resta nella cronologia (chi, cosa, quando).
- Import (solo amministratori): prima l'anteprima, che non scrive nulla, poi l'import vero.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.api.deps import get_session
from app.auth import AuthUser, require_admin, require_user
from app.models import Customer, Project
from app.schemas.transfer import ImportRequest
from app.transfer import export_projects, import_file, load_projects

router = APIRouter(tags=["export e import"])
SessionDep = Annotated[Session, Depends(get_session)]

CAN_EXPORT = {"admin", "coordinatore"}


def require_exporter(user: Annotated[AuthUser, Depends(require_user)]) -> AuthUser:
    if user.role not in CAN_EXPORT:
        raise HTTPException(403, {"message": "L'export è riservato a coordinatori e amministratori.", "code": "forbidden"})
    return user


def _slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "export"


def _download(payload: dict[str, Any], kind: str, name: str) -> Response:
    filename = f"datespreader-{kind}-{_slug(name)}-{date.today():%Y%m%d}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.get("/export/projects/{project_id}", dependencies=[Depends(require_exporter)])
def export_project(session: SessionDep, project_id: int) -> Response:
    """File JSON con il progetto, i suoi interventi e le tabelle server."""
    projects = load_projects(session, [project_id])
    if not projects:
        raise HTTPException(404, "Progetto non trovato.")
    p = projects[0]
    payload = export_projects(session, projects, {"type": "project", "name": p.name})
    audit.record(session, "export", "export", p.id, {"progetto": (None, p.name)})
    session.commit()
    return _download(payload, "progetto", p.name)


@router.get("/export/customers/{customer_id}", dependencies=[Depends(require_exporter)])
def export_customer(session: SessionDep, customer_id: int) -> Response:
    """File JSON con tutti i progetti del cliente."""
    customer = session.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(404, "Cliente non trovato.")
    ids = list(session.scalars(select(Project.id).where(Project.customer_id == customer_id)))
    if not ids:
        raise HTTPException(409, {"message": f"«{customer.name}» non ha progetti da esportare.", "current": None})
    payload = export_projects(session, load_projects(session, ids), {"type": "customer", "name": customer.name})
    audit.record(session, "export", "export", customer.id, {"cliente": (None, customer.name)})
    session.commit()
    return _download(payload, "cliente", customer.name)


@router.post("/import/preview", dependencies=[Depends(require_admin)])
def import_preview(session: SessionDep, body: ImportRequest) -> dict[str, Any]:
    """Cosa farebbe l'import, senza scrivere nulla (l'import viene eseguito e poi annullato)."""
    try:
        return import_file(session, body.data, body.on_conflict)
    finally:
        session.rollback()


@router.post("/import", dependencies=[Depends(require_admin)])
def import_run(session: SessionDep, body: ImportRequest) -> dict[str, Any]:
    """Importa il file in un'unica transazione: o tutto, o niente."""
    try:
        report = import_file(session, body.data, body.on_conflict)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return report
