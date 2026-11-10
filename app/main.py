"""Punto di ingresso dell'applicazione FastAPI."""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import auth as auth_api
from app.api import calendar, customers, health, inventory, meta, oslist, servers, users
from app.auth import csrf_protect, require_user
from app import __version__
from app.config import PROJECT_ROOT, Settings, get_settings
from app.db import create_db_engine, make_session_factory


class RevalidatingStaticFiles(StaticFiles):
    """File statici con `Cache-Control: no-cache`: il browser li ricontrolla a ogni caricamento.

    Senza questa intestazione i browser tengono in cache i moduli JS "a occhio": dopo un
    aggiornamento potevano mescolare file vecchi e nuovi e la pagina restava vuota. Se un file
    non è cambiato la risposta è un 304 di pochi byte, quindi non pesa.
    """

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title=settings.app_name, version=__version__)

    engine = create_db_engine(settings)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)

    # Pubbliche: stato del servizio, versione/changelog, login.
    app.include_router(health.router, prefix="/api")
    app.include_router(meta.router, prefix="/api")
    app.include_router(auth_api.router, prefix="/api")
    # Tutto il resto richiede un utente autenticato (e l'intestazione anti-CSRF per le modifiche).
    protected = [Depends(require_user), Depends(csrf_protect)]
    for module in (calendar, servers, users, inventory, oslist, customers):
        app.include_router(module.router, prefix="/api", dependencies=protected)

    # Il frontend statico va montato per ultimo, così non copre le rotte /api.
    app.mount("/", RevalidatingStaticFiles(directory=PROJECT_ROOT / "static", html=True), name="static")
    return app


def run() -> None:
    import uvicorn

    s = get_settings()
    uvicorn.run("app.main:create_app", factory=True, host=s.host, port=s.port, reload=s.reload)


if __name__ == "__main__":
    run()
