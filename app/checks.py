"""Pre-check of an intervention (e.g. the day before a patching): when it is due and when it is missing.

The check is not a separate intervention: the intervention has a check day (Event.check_date), optional
times and technicians, and each server row has its check status (da_fare/in_corso/ok/ko/non_applicabile).
"""

from __future__ import annotations

from datetime import date

PENDING = ("da_fare", "in_corso", "ko")      # check statuses that are not a good check (yet)
DONE = ("ok", "ko", "non_applicabile")       # check statuses of a server whose check is over
CLOSED_EVENT = ("completato", "annullato")   # interventions that no longer need a check


def warning(status: str, check_date: date | None, pending: int, today: date) -> bool:
    """A check was planned, its day is over, and some servers still have no good check (to do or KO)."""
    return bool(check_date and pending and status not in CLOSED_EVENT and today > check_date)
