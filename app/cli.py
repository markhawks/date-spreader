"""Comandi di gestione.

    python -m app.cli migrate            applica le migrazioni (crea il database se manca)
    python -m app.cli init [--demo]      migrate; con --demo carica anche i dati di esempio
    python -m app.cli demo load          carica i dati di esempio (non tocca gli altri dati)
    python -m app.cli demo remove        mostra cosa verrebbe tolto e chiede conferma
    python -m app.cli demo remove --yes  toglie i dati di esempio senza chiedere
    python -m app.cli users list         elenca gli utenti e chi può accedere
    python -m app.cli users admin LOGIN  rende amministratore l'utente (email o nome utente)
                                         e gli imposta la password (chiesta, o --temporary)
    python -m app.cli users create-admin --name "Nome" --email x@y.it [--username u] [--temporary]

Nessun comando cancella i dati inseriti dagli utenti: "demo remove" agisce solo sui
record marcati come esempio (is_demo).
"""

from __future__ import annotations

import argparse
import getpass
import sys

from app.config import get_settings
from app.db import create_db_engine, make_session_factory
from app.migrations import upgrade_database
from app.seed import AlreadySeededError, plan_demo_removal, remove_demo, seed

LABELS = {
    "progetti": "Progetti da cancellare",
    "interventi": "Interventi da cancellare",
    "server": "Server da cancellare",
    "server_mantenuti": "Server mantenuti (usati in interventi reali)",
    "tecnici": "Tecnici da cancellare",
    "tecnici_disattivati": "Tecnici solo disattivati (usati da dati reali)",
    "clienti": "Clienti da cancellare",
    "clienti_mantenuti": "Clienti mantenuti (assegnati a progetti reali)",
}


def _print_plan(plan: dict[str, list[str]]) -> None:
    for key, label in LABELS.items():
        items = plan.get(key) or []
        if items:
            print(f"  {label} ({len(items)}):")
            for item in items:
                print(f"    - {item}")


def _load_demo(factory) -> int:
    with factory.begin() as session:
        try:
            counts = seed(session)
        except AlreadySeededError as exc:
            print(str(exc))
            return 0
    print("Dati di esempio caricati: " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    return 0


def _remove_demo(factory, assume_yes: bool) -> int:
    with factory() as session:
        plan = plan_demo_removal(session)
    if not any(plan.values()):
        print("Nessun dato di esempio presente.")
        return 0
    print("Dati di esempio trovati:")
    _print_plan(plan)
    if not assume_yes:
        if not sys.stdin.isatty():
            print("Conferma richiesta: rilancia con --yes.", file=sys.stderr)
            return 1
        if input("Procedere? Scrivi 'si' per confermare: ").strip().lower() not in ("si", "sì", "s", "yes", "y"):
            print("Annullato.")
            return 1
    with factory.begin() as session:
        remove_demo(session)
    print("Dati di esempio rimossi. Chi ha il portale aperto deve ricaricare la pagina (Ctrl+F5).")
    return 0


def _ask_password(names: tuple[str | None, ...]) -> str | None:
    from app.security import password_problem

    for _ in range(3):
        pw = getpass.getpass("Nuova password: ")
        problem = password_problem(pw, login_names=names)
        if problem:
            print(problem)
            continue
        if getpass.getpass("Ripeti la password: ") != pw:
            print("Le due password non coincidono.")
            continue
        return pw
    return None


def _set_admin_password(factory, user_id: int, temporary: bool) -> int:
    from app.auth import utcnow
    from app.models import User
    from app.repositories.users import revoke_sessions
    from app.security import hash_password, temporary_password

    with factory.begin() as session:
        user = session.get(User, user_id)
        email = None if user.external_id.startswith("local:") else user.external_id
        if temporary:
            pw = temporary_password()
        else:
            if not sys.stdin.isatty():
                print("Serve un terminale interattivo per inserire la password (oppure usa --temporary).", file=sys.stderr)
                return 1
            pw = _ask_password((user.username, email))
            if pw is None:
                print("Password non impostata.", file=sys.stderr)
                return 1
        user.role = "admin"
        user.is_active = True
        user.password_hash = hash_password(pw)
        user.must_change_password = temporary
        user.password_changed_at = None if temporary else utcnow()
        revoke_sessions(session, user.id)
        login = user.username or email
    print(f"{user.display_name} è amministratore. Accesso con: {login}")
    if temporary:
        print(f"Password temporanea (da cambiare al primo accesso): {pw}")
    return 0


def _users(factory, args) -> int:
    from sqlalchemy import func, or_, select

    from app.models import User
    from app.schemas.edit import UserCreate

    if args.action == "list":
        with factory() as session:
            for u in session.scalars(select(User).order_by(User.display_name)):
                email = "" if u.external_id.startswith("local:") else u.external_id
                access = "accesso" if u.can_login else ("disattivato" if not u.is_active else "senza password")
                print(f"  {u.id:>3}  {u.display_name:<25} {email:<30} {u.username or '':<15} {u.role:<13} {access}")
        return 0

    if args.action == "admin":
        key = args.login.strip().lower()
        with factory() as session:
            user = session.scalars(
                select(User).where(or_(func.lower(User.username) == key, func.lower(User.external_id) == key))
            ).first()
            if user is None:
                print(f"Nessun utente con nome utente o email «{args.login}». Vedi: users list", file=sys.stderr)
                return 1
            user_id = user.id
        return _set_admin_password(factory, user_id, args.temporary)

    if args.action == "create-admin":
        from app.repositories.servers import Conflict
        from app.repositories.users import create_user

        try:
            data = UserCreate(display_name=args.name, email=args.email, username=args.username, role="admin")
        except ValueError as exc:
            print(f"Dati non validi: {exc}", file=sys.stderr)
            return 1
        try:
            with factory.begin() as session:
                user_id = create_user(session, data).id
        except Conflict as exc:
            print(f"{exc} Usa invece: users admin <email o nome utente>", file=sys.stderr)
            return 1
        return _set_admin_password(factory, user_id, args.temporary)
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="applica le migrazioni")
    p_init = sub.add_parser("init", help="migrate (+ dati di esempio con --demo)")
    p_init.add_argument("--demo", action="store_true", help="carica anche i dati di esempio")
    p_demo = sub.add_parser("demo", help="dati di esempio")
    demo_sub = p_demo.add_subparsers(dest="action", required=True)
    demo_sub.add_parser("load", help="carica i dati di esempio")
    p_rm = demo_sub.add_parser("remove", help="toglie i dati di esempio")
    p_rm.add_argument("--yes", action="store_true", help="non chiedere conferma")
    p_users = sub.add_parser("users", help="account di accesso")
    users_sub = p_users.add_subparsers(dest="action", required=True)
    users_sub.add_parser("list", help="elenca gli utenti")
    p_admin = users_sub.add_parser("admin", help="rende amministratore un utente esistente e ne imposta la password")
    p_admin.add_argument("login", help="email o nome utente")
    p_admin.add_argument("--temporary", action="store_true", help="genera una password temporanea")
    p_create = users_sub.add_parser("create-admin", help="crea un nuovo amministratore")
    p_create.add_argument("--name", required=True)
    p_create.add_argument("--email")
    p_create.add_argument("--username")
    p_create.add_argument("--temporary", action="store_true", help="genera una password temporanea")
    args = parser.parse_args(argv)

    settings = get_settings()
    engine = create_db_engine(settings)
    print(f"Database: {settings.database_path}")
    factory = make_session_factory(engine)
    try:
        if args.command in ("migrate", "init"):
            upgrade_database(engine)
            print("Migrazioni applicate.")
        if args.command == "init" and args.demo:
            return _load_demo(factory)  # se l'esempio c'è già, lo dice e non fa nulla
        if args.command == "users":
            return _users(factory, args)
        if args.command == "demo":
            return _load_demo(factory) if args.action == "load" else _remove_demo(factory, args.yes)
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
