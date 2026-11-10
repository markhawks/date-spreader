"""Dati di ESEMPIO (demo) per sviluppo, collaudo e dimostrazioni: 3 progetti, 4 eventi, 10 server.

Tutti i record creati qui hanno `is_demo = True`, così si possono togliere da
un'installazione reale con `python -m app.cli demo remove` senza toccare i dati veri.

Nessun dato reale. Hostname su dominio riservato example.com (RFC 2606),
IP nei blocchi riservati alla documentazione (RFC 5737).
Le date sono calcolate rispetto a oggi, così il calendario a tre mesi
(precedente / corrente / successivo) mostra sempre degli interventi.

Scenari coperti di proposito:
- un progetto con due interventi in date diverse (Alfa);
- un server presente in due interventi (alfa-db01, rinviato alla seconda finestra);
- stati di check e migrazione diversi tra loro.
"""

from __future__ import annotations

import calendar
from datetime import date, time

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app import audit
from app.models import AuditLog, Customer, Event, EventServer, EventUser, Project, Server, User

RHEL7 = ("Red Hat Enterprise Linux 7.9", "3.10.0-1160.119.1.el7.x86_64")
RHEL8_8 = ("Red Hat Enterprise Linux 8.8", "4.18.0-477.10.1.el8_8.x86_64")
RHEL8_10 = ("Red Hat Enterprise Linux 8.10", "4.18.0-553.el8_10.x86_64")
KERNEL_RHEL9_4 = "5.14.0-427.13.1.el9_4.x86_64"


class AlreadySeededError(RuntimeError):
    pass


def month_day(base: date, month_offset: int, day: int) -> date:
    """Il giorno `day` del mese spostato di `month_offset` (limitato alla fine del mese)."""
    index = base.year * 12 + (base.month - 1) + month_offset
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def has_demo(session: Session) -> bool:
    return bool(session.scalar(select(func.count()).select_from(Project).where(Project.is_demo)))


def seed(session: Session, today: date | None = None) -> dict[str, int]:
    """Carica i dati di esempio. Non tocca gli altri dati; rifiuta se l'esempio è già presente."""
    today = today or date.today()

    if has_demo(session):
        raise AlreadySeededError("I dati di esempio sono già presenti.")

    # --- Utenti -----------------------------------------------------------
    users = {
        key: User(external_id=f"{key}@example.com", display_name=name, role=role, is_demo=True)
        for key, name, role in [
            ("luca.bianchi", "Luca Bianchi", "coordinatore"),
            ("sara.verdi", "Sara Verdi", "tecnico"),
            ("marco.neri", "Marco Neri", "tecnico"),
            ("giulia.gallo", "Giulia Gallo", "tecnico"),
        ]
    }
    session.add_all(users.values())

    # --- Server (10) ------------------------------------------------------
    def srv(name: str, ip: str, env: str, os_kernel: tuple[str, str], notes: str | None = None):
        return Server(
            hostname=f"{name}.example.com",
            ip_address=ip,
            environment=env,
            operating_system=os_kernel[0],
            current_kernel=os_kernel[1],
            notes=notes,
            is_demo=True,
        )

    s = {
        "alfa-app01-test": srv("alfa-app01-test", "192.0.2.21", "TEST", RHEL8_10),
        "alfa-web01": srv("alfa-web01", "192.0.2.11", "PROD", RHEL8_10),
        "alfa-web02": srv("alfa-web02", "192.0.2.12", "PROD", RHEL7),
        "alfa-db01": srv("alfa-db01", "192.0.2.31", "PROD", RHEL7, "Database: richiede finestra concordata"),
        "beta-app01": srv("beta-app01", "198.51.100.11", "PROD", RHEL8_8),
        "beta-app02": srv("beta-app02", "198.51.100.12", "PROD", RHEL8_8),
        "beta-dev01": srv("beta-dev01", "198.51.100.51", "DEV", RHEL8_8),
        "gamma-pos01": srv("gamma-pos01", "203.0.113.11", "PROD", RHEL8_10),
        "gamma-pos02": srv("gamma-pos02", "203.0.113.12", "PROD", RHEL8_10),
        "gamma-test01": srv("gamma-test01", "203.0.113.41", "TEST", RHEL8_10),
    }
    session.add_all(s.values())

    # --- Progetti (3) -----------------------------------------------------
    # --- Clienti (3): Alfa e Gamma dello stesso gruppo, per provare il raggruppamento
    gruppo = Customer(name="Gruppo Alfa-Gamma", is_demo=True, color="#0d9488")  # colore personalizzato
    beta_spa = Customer(name="Beta Assicurazioni S.p.A.", is_demo=True)
    session.add_all([gruppo, beta_spa])
    session.add(Customer(name="Delta Energia (esempio)", is_demo=True))

    alfa = Project(name="Alfa Logistica", description="Migrazione RHEL 7 → RHEL 8 in due finestre.", is_demo=True, customer=gruppo)
    beta = Project(name="Beta Assicurazioni", description="Aggiornamento kernel RHEL 8.8 → 8.10.", is_demo=True, customer=beta_spa)
    gamma = Project(name="Gamma Retail", description="Migrazione punti cassa a RHEL 9.", is_demo=True, customer=gruppo)
    session.add_all([alfa, beta, gamma])

    # --- Eventi (4) -------------------------------------------------------
    e1 = Event(
        project=alfa,
        title="Alfa – prima finestra",
        event_date=month_day(today, -1, 18),
        start_time=time(20, 0),
        end_time=time(23, 59),
        event_type="migrazione",
        status="completato",
        notes="alfa-db01 rinviato alla seconda finestra su richiesta del cliente.",
    )
    e2 = Event(
        project=alfa,
        title="Alfa – seconda finestra",
        event_date=month_day(today, 0, 15),
        start_time=time(21, 0),
        event_type="migrazione",
        status="confermato",
    )
    e3 = Event(
        project=beta,
        title="Beta – upgrade kernel",
        event_date=month_day(today, 0, 26),
        start_time=time(18, 30),
        end_time=time(22, 0),
        event_type="upgrade",
        status="pianificato",
    )
    e4 = Event(
        project=gamma,
        title="Gamma – migrazione RHEL 9",
        event_date=month_day(today, 1, 12),
        event_type="migrazione",
        status="pianificato",
        notes="In attesa di conferma della finestra da parte del cliente.",
    )
    session.add_all([e1, e2, e3, e4])

    # --- Righe server degli eventi -----------------------------------------
    def link(event, key, pos, kernel, check, migration, user=None, executed=None, notes=None):
        return EventServer(
            event=event,
            server=s[key],
            position=pos,
            target_kernel=kernel,
            check_status=check,
            migration_status=migration,
            planned_date=event.event_date,
            executed_date=executed,
            assigned_user=users[user] if user else None,
            notes=notes,
        )

    k8 = RHEL8_10[1]
    session.add_all(
        [
            link(e1, "alfa-app01-test", 0, k8, "ok", "completata", "sara.verdi", e1.event_date),
            link(e1, "alfa-web01", 1, k8, "ok", "completata", "sara.verdi", e1.event_date),
            link(e1, "alfa-db01", 2, k8, "ok", "rinviata", "marco.neri", notes="Rinviato a seconda finestra"),
            link(e2, "alfa-web02", 0, k8, "ok", "pianificata", "sara.verdi"),
            link(e2, "alfa-db01", 1, k8, "in_corso", "pianificata", "marco.neri", notes="Verificare backup DB"),
            link(e3, "beta-dev01", 0, k8, "ok", "pianificata", "giulia.gallo"),
            link(e3, "beta-app01", 1, k8, "ko", "pianificata", "giulia.gallo", notes="Spazio /boot insufficiente"),
            link(e3, "beta-app02", 2, k8, "da_fare", "pianificata"),
            link(e4, "gamma-test01", 0, KERNEL_RHEL9_4, "da_fare", "pianificata", "marco.neri"),
            link(e4, "gamma-pos01", 1, KERNEL_RHEL9_4, "da_fare", "pianificata"),
            link(e4, "gamma-pos02", 2, KERNEL_RHEL9_4, "da_fare", "pianificata"),
        ]
    )

    # --- Partecipanti -------------------------------------------------------
    for event, keys in [
        (e1, ["sara.verdi", "marco.neri"]),
        (e2, ["sara.verdi", "marco.neri", "luca.bianchi"]),
        (e3, ["giulia.gallo"]),
        (e4, ["marco.neri", "luca.bianchi"]),
    ]:
        session.add_all(EventUser(event=event, user=users[k]) for k in keys)

    session.flush()
    return {
        "progetti": 3,
        "eventi": 4,
        "server": len(s),
        "utenti": len(users),
    }


# ---------------------------------------------------------------------------
# Rimozione dei dati di esempio
# ---------------------------------------------------------------------------

def _user_in_use(session: Session, user_id: int, ignore_event_ids: set[int]) -> bool:
    """True se il tecnico è usato da dati reali (o compare nella cronologia)."""
    ignore = list(ignore_event_ids) or [-1]
    return bool(
        session.scalar(
            select(
                or_(
                    exists().where(EventUser.user_id == user_id, EventUser.event_id.not_in(ignore)),
                    exists().where(EventServer.assigned_user_id == user_id, EventServer.event_id.not_in(ignore)),
                    exists().where(AuditLog.user_id == user_id),
                )
            )
        )
    )


def plan_demo_removal(session: Session) -> dict[str, list[str]]:
    """Cosa farebbe remove_demo, senza modificare nulla (per l'anteprima)."""
    projects = list(session.scalars(select(Project).where(Project.is_demo).order_by(Project.name)))
    demo_event_ids = {e.id for p in projects for e in p.events}
    plan: dict[str, list[str]] = {
        "progetti": [p.name for p in projects],
        "interventi": [f"{e.event_date} {p.name}" for p in projects for e in p.events],
        "server": [],
        "server_mantenuti": [],
        "tecnici": [],
        "tecnici_disattivati": [],
        "clienti": [],
        "clienti_mantenuti": [],
    }
    for c in session.scalars(select(Customer).where(Customer.is_demo).order_by(Customer.name)):
        real = [p for p in c.projects if not p.is_demo]
        plan["clienti_mantenuti" if real else "clienti"].append(c.name)
    for srv in session.scalars(select(Server).where(Server.is_demo).order_by(Server.hostname)):
        used_by_real = any(link.event_id not in demo_event_ids for link in srv.event_links)
        plan["server_mantenuti" if used_by_real else "server"].append(srv.hostname)
    for user in session.scalars(select(User).where(User.is_demo).order_by(User.display_name)):
        key = "tecnici_disattivati" if _user_in_use(session, user.id, demo_event_ids) else "tecnici"
        plan[key].append(user.display_name)
    return plan


def remove_demo(session: Session) -> dict[str, list[str]]:
    """Toglie i dati di esempio senza toccare quelli reali.

    - progetti di esempio: cancellati con interventi, righe server e partecipanti;
    - server di esempio: cancellati, salvo quelli usati in interventi reali (restano, non più "esempio");
    - tecnici di esempio: cancellati, salvo quelli usati da dati reali o nella cronologia (disattivati).
    """
    plan = plan_demo_removal(session)
    projects = list(session.scalars(select(Project).where(Project.is_demo)))
    demo_event_ids = {e.id for p in projects for e in p.events}

    for project in projects:
        for event in project.events:
            audit.record(session, "delete", "events", event.id, {"event_date": (event.event_date, None)}, event_id=event.id)
        audit.record(session, "delete", "projects", project.id, {"name": (project.name, None)})
        session.delete(project)  # a cascata: interventi, righe server, partecipanti
    session.flush()
    session.expire_all()  # rilegge i collegamenti dei server dopo le cancellazioni

    for customer in session.scalars(select(Customer).where(Customer.is_demo)):
        if customer.projects:  # assegnato a un progetto reale: resta, non più "esempio"
            customer.is_demo = False
        else:
            audit.record(session, "delete", "customers", customer.id, {"name": (customer.name, None)})
            session.delete(customer)

    for srv in session.scalars(select(Server).where(Server.is_demo)):
        if srv.event_links:  # ancora usato da un intervento reale
            srv.is_demo = False
        else:
            session.delete(srv)

    for user in session.scalars(select(User).where(User.is_demo)):
        if _user_in_use(session, user.id, demo_event_ids):
            if user.is_active:
                user.is_active = False
                audit.record(session, "update", "users", user.id, {"is_active": (True, False)})
        else:
            audit.record(session, "delete", "users", user.id, {"display_name": (user.display_name, None)})
            session.delete(user)
    session.flush()
    return plan
