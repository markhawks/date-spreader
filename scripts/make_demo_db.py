"""Rigenera demo/datespreader-demo.sqlite3: database di prova con i SOLI dati di esempio.

Uso:  .venv/bin/python scripts/make_demo_db.py [percorso]

Contiene i dati fittizi di app/seed.py (date calcolate rispetto al giorno in cui viene generato) e
un amministratore demo, «admin» con password «demo-password-2026», da cambiare al primo accesso.
Non legge mai il database reale: lo crea da zero.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DEMO_LOGIN = "admin"
DEMO_PASSWORD = "demo-password-2026"


def main() -> int:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "demo" / "datespreader-demo.sqlite3").resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        Path(f"{target}{suffix}").unlink(missing_ok=True)
    os.environ["DATABASE_PATH"] = str(target)  # mai il database configurato nel .env

    from app.config import get_settings
    from app.db import create_db_engine, make_session_factory
    from app.migrations import upgrade_database
    from app.models import User
    from app.repositories.users import create_user
    from app.schemas.edit import UserCreate
    from app.security import hash_password
    from app.seed import seed

    settings = get_settings()
    assert settings.database_path == target
    engine = create_db_engine(settings)
    upgrade_database(engine)
    factory = make_session_factory(engine)
    with factory.begin() as session:
        seed(session)
    with factory.begin() as session:
        user = create_user(session, UserCreate(display_name="Amministratore demo", email="admin@example.com",
                                               username=DEMO_LOGIN, role="admin"))
        u = session.get(User, user.id)
        u.password_hash = hash_password(DEMO_PASSWORD)
        u.must_change_password = True
    engine.dispose()
    # un solo file, compatto (niente WAL accanto)
    con = sqlite3.connect(target)
    con.execute("PRAGMA journal_mode=DELETE")
    con.execute("DELETE FROM audit_log")
    con.commit()
    con.execute("VACUUM")
    con.close()
    print(f"Creato {target} (login: {DEMO_LOGIN} / {DEMO_PASSWORD}, da cambiare al primo accesso)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
