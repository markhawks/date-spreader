from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import text

from app.migrations import schema_status

router = APIRouter(tags=["sistema"])


@router.get("/health")
def health(request: Request) -> dict:
    """Verifica che l'app risponda, che il database sia raggiungibile e lo schema aggiornato."""
    with request.app.state.engine.connect() as conn:
        journal_mode = conn.execute(text("PRAGMA journal_mode")).scalar_one()
        schema = schema_status(conn)
    return {
        "status": "ok" if schema["up_to_date"] else "schema_non_aggiornato",
        "app": request.app.state.settings.app_name,
        "database": {"journal_mode": journal_mode, "schema": schema},
    }
