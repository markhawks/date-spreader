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
import os
import sys

from app.config import get_settings
from app.db import create_db_engine, make_session_factory
from app.i18n import MESSAGES, reset_language, set_language, tr
from app.migrations import upgrade_database
from app.seed import AlreadySeededError, plan_demo_removal, remove_demo, seed

USAGE = """Administration commands.

    python -m app.cli migrate            apply the migrations (creates the database if missing)
    python -m app.cli init [--demo]      migrate; with --demo also load the sample data
    python -m app.cli demo load          load the sample data (other data is not touched)
    python -m app.cli demo remove        show what would be removed and ask for confirmation
    python -m app.cli demo remove --yes  remove the sample data without asking
    python -m app.cli users list         list the users and who can log in
    python -m app.cli users admin LOGIN  make the user (email or username) an administrator
                                         and set the password (prompted, or --temporary)
    python -m app.cli users create-admin --name "Name" --email x@example.com [--username u] [--temporary]

No command deletes data entered by users: "demo remove" acts only on records
marked as sample data (is_demo).
"""

# Keys of plan_demo_removal() (app.seed), in display order; labels are "cli.plan_<key>" messages
PLAN_KEYS = (
    "progetti", "interventi", "server", "server_mantenuti",
    "tecnici", "tecnici_disattivati", "clienti", "clienti_mantenuti",
)


def language_from_env(environ=os.environ) -> str:
    """Language of the CLI messages from the POSIX locale (LC_ALL, LC_MESSAGES, LANG): "it_IT.UTF-8" → it."""
    for var in ("LC_ALL", "LC_MESSAGES", "LANG"):
        value = (environ.get(var) or "").strip()
        if value:
            return "it" if value.lower().startswith("it") else "en"
    return "en"


def _print_plan(plan: dict[str, list[str]]) -> None:
    for key in PLAN_KEYS:
        items = plan.get(key) or []
        if items:
            label = tr(f"cli.plan_{key}")
            print(f"  {label} ({len(items)}):")
            for item in items:
                print(f"    - {item}")


def _load_demo(factory) -> int:
    with factory.begin() as session:
        try:
            counts = seed(session)
        except AlreadySeededError:
            print(tr("cli.demo_already_loaded"))
            return 0
    summary = ", ".join(f"{v} {tr(f'cli.count_{k}') if f'cli.count_{k}' in MESSAGES else k}" for k, v in counts.items())
    print(tr("cli.demo_loaded", summary=summary))
    return 0


def _remove_demo(factory, assume_yes: bool) -> int:
    with factory() as session:
        plan = plan_demo_removal(session)
    if not any(plan.values()):
        print(tr("cli.demo_none"))
        return 0
    print(tr("cli.demo_found"))
    _print_plan(plan)
    if not assume_yes:
        if not sys.stdin.isatty():
            print(tr("cli.confirm_with_yes"), file=sys.stderr)
            return 1
        if input(tr("cli.confirm_prompt")).strip().lower() not in ("si", "sì", "s", "yes", "y"):
            print(tr("cli.cancelled"))
            return 1
    with factory.begin() as session:
        remove_demo(session)
    print(tr("cli.demo_removed"))
    return 0


def _ask_password(names: tuple[str | None, ...]) -> str | None:
    from app.security import password_problem

    for _ in range(3):
        pw = getpass.getpass(tr("cli.new_password"))
        problem = password_problem(pw, login_names=names)
        if problem:
            print(problem)
            continue
        if getpass.getpass(tr("cli.repeat_password")) != pw:
            print(tr("cli.passwords_differ"))
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
                print(tr("cli.needs_tty"), file=sys.stderr)
                return 1
            pw = _ask_password((user.username, email))
            if pw is None:
                print(tr("cli.password_not_set"), file=sys.stderr)
                return 1
        user.role = "admin"
        user.is_active = True
        user.password_hash = hash_password(pw)
        user.must_change_password = temporary
        user.password_changed_at = None if temporary else utcnow()
        revoke_sessions(session, user.id)
        login = user.username or email
    print(tr("cli.is_admin", name=user.display_name, login=login))
    if temporary:
        print(tr("cli.temporary_password", password=pw))
    return 0


def _users(factory, args) -> int:
    from sqlalchemy import func, or_, select

    from app.models import User
    from app.schemas.edit import UserCreate

    if args.action == "list":
        with factory() as session:
            for u in session.scalars(select(User).order_by(User.display_name)):
                email = "" if u.external_id.startswith("local:") else u.external_id
                access = tr("cli.access_yes") if u.can_login else (tr("cli.access_inactive") if not u.is_active else tr("cli.access_no_password"))
                print(f"  {u.id:>3}  {u.display_name:<25} {email:<30} {u.username or '':<15} {u.role:<13} {access}")
        return 0

    if args.action == "admin":
        key = args.login.strip().lower()
        with factory() as session:
            user = session.scalars(
                select(User).where(or_(func.lower(User.username) == key, func.lower(User.external_id) == key))
            ).first()
            if user is None:
                print(tr("cli.user_not_found", login=args.login), file=sys.stderr)
                return 1
            user_id = user.id
        return _set_admin_password(factory, user_id, args.temporary)

    if args.action == "create-admin":
        from app.repositories.servers import Conflict
        from app.repositories.users import create_user

        try:
            data = UserCreate(display_name=args.name, email=args.email, username=args.username, role="admin")
        except ValueError as exc:
            print(tr("cli.invalid_data", error=exc), file=sys.stderr)
            return 1
        try:
            with factory.begin() as session:
                user_id = create_user(session, data).id
        except Conflict as exc:
            print(tr("cli.user_exists", error=exc), file=sys.stderr)
            return 1
        return _set_admin_password(factory, user_id, args.temporary)
    return 1


def main(argv: list[str] | None = None) -> int:
    token = set_language(language_from_env())
    try:
        return _main(argv)
    finally:
        reset_language(token)


def _main(argv: list[str] | None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=USAGE,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="apply the database migrations")
    p_init = sub.add_parser("init", help="migrate (+ sample data with --demo)")
    p_init.add_argument("--demo", action="store_true", help="also load the sample data")
    p_demo = sub.add_parser("demo", help="sample data")
    demo_sub = p_demo.add_subparsers(dest="action", required=True)
    demo_sub.add_parser("load", help="load the sample data")
    p_rm = demo_sub.add_parser("remove", help="remove the sample data")
    p_rm.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    p_users = sub.add_parser("users", help="login accounts")
    users_sub = p_users.add_subparsers(dest="action", required=True)
    users_sub.add_parser("list", help="list the users")
    p_admin = users_sub.add_parser("admin", help="make an existing user an administrator and set their password")
    p_admin.add_argument("login", help="email or username")
    p_admin.add_argument("--temporary", action="store_true", help="generate a temporary password")
    p_create = users_sub.add_parser("create-admin", help="create a new administrator")
    p_create.add_argument("--name", required=True)
    p_create.add_argument("--email")
    p_create.add_argument("--username")
    p_create.add_argument("--temporary", action="store_true", help="generate a temporary password")
    args = parser.parse_args(argv)

    settings = get_settings()
    engine = create_db_engine(settings)
    print(f"Database: {settings.database_path}")
    factory = make_session_factory(engine)
    try:
        if args.command in ("migrate", "init"):
            upgrade_database(engine)
            print(tr("cli.migrated"))
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
