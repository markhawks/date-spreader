"""Preferenze personali dell'utente (sezione Impostazioni → Aspetto).

Per aggiungere una preferenza: un campo qui (con valore di default) e il controllo nell'interfaccia.
Le chiavi sconosciute salvate in passato vengono ignorate in lettura.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Account Gmail: vuoto (= email del profilo nel portale) oppure un indirizzo email
GMAIL_ACCOUNT = r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$"


class Preferences(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Dove mostrare l'anteprima dell'intervento: a destra (compatta) o sotto il calendario (estesa, modificabile)
    detail_position: Literal["right", "bottom"] = "right"
    # Altezza del pannello in basso, in percentuale dell'area del calendario
    bottom_panel_height: int = Field(default=45, ge=20, le=80)
    # Tema: come il sistema operativo, chiaro o scuro
    theme: Literal["system", "light", "dark"] = "system"
    # Colonna progetti: larghezza in pixel, vista a quadrati o a rettangoli (uno per riga), ordinamento
    sidebar_width: int = Field(default=280, ge=200, le=640)
    project_view: Literal["grid", "list"] = "grid"
    project_sort: Literal["name", "date"] = "name"
    project_group: Literal["none", "customer"] = "none"
    # Formato degli orari: 24 ore (europeo, "14:00") o 12 ore con AM/PM ("2:00 PM")
    time_format: Literal["24h", "12h"] = "24h"
    # Condivisione via email: account Google con cui aprire Gmail (vuoto = email del profilo nel portale)
    # e se far scegliere l'account a Google a ogni invio
    gmail_account: str = Field(default="", max_length=254, pattern=GMAIL_ACCOUNT)
    gmail_choose_account: bool = False
    # Zoom del calendario (altezza dei giorni): 1 = normale, da 0.5 a 2.5
    calendar_zoom: float = Field(default=1.0, ge=0.5, le=2.5)
    # Vista del calendario: mesi (griglia classica) o settimane (colonne alte, interventi in dettaglio)
    calendar_view: Literal["month", "week", "team"] = "month"
    # Days shown in the calendar: the whole week, or Mon–Fri (weekends only where there are interventions)
    calendar_days: Literal["all", "workweek"] = "all"
    # Data e orologio nella barra in alto
    topbar_clock: Literal["date_time", "date_time_seconds", "date", "time", "off"] = "date_time"
    # Interface language: "auto" = the browser's (Italian if preferred, otherwise English)
    language: Literal["auto", "en", "it"] = "auto"


class PreferencesPatch(BaseModel):
    """Aggiornamento parziale: solo i campi inviati."""

    model_config = ConfigDict(extra="forbid")

    detail_position: Literal["right", "bottom"] | None = None
    bottom_panel_height: int | None = Field(default=None, ge=20, le=80)
    theme: Literal["system", "light", "dark"] | None = None
    sidebar_width: int | None = Field(default=None, ge=200, le=640)
    project_view: Literal["grid", "list"] | None = None
    project_sort: Literal["name", "date"] | None = None
    project_group: Literal["none", "customer"] | None = None
    time_format: Literal["24h", "12h"] | None = None
    gmail_account: str | None = Field(default=None, max_length=254, pattern=GMAIL_ACCOUNT)
    gmail_choose_account: bool | None = None
    calendar_zoom: float | None = Field(default=None, ge=0.5, le=2.5)
    calendar_view: Literal["month", "week", "team"] | None = None
    calendar_days: Literal["all", "workweek"] | None = None
    topbar_clock: Literal["date_time", "date_time_seconds", "date", "time", "off"] | None = None
    language: Literal["auto", "en", "it"] | None = None
