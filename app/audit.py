"""Scrittura della cronologia delle modifiche (tabella audit_log)."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def _fmt(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    return str(value)


def record(
    session: Session,
    action: str,
    table_name: str,
    record_id: int,
    changes: dict[str, tuple[Any, Any]] | None = None,
    user_id: int | None = None,
    event_id: int | None = None,
) -> None:
    """Un record per ogni campo modificato; per create/delete senza campi, un record unico.

    `user_id`: se non indicato, l'utente della richiesta in corso, che il controllo
    d'accesso (app.auth) salva in `session.info["user_id"]`. None da riga di comando.
    """
    if user_id is None:
        user_id = session.info.get("user_id")
    if not changes:
        session.add(
            AuditLog(user_id=user_id, action=action, table_name=table_name, record_id=record_id, event_id=event_id)
        )
        return
    for field, (old, new) in changes.items():
        session.add(
            AuditLog(
                user_id=user_id,
                action=action,
                table_name=table_name,
                record_id=record_id,
                event_id=event_id,
                field=field,
                old_value=_fmt(old),
                new_value=_fmt(new),
            )
        )
