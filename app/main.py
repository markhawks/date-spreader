"""Punto di ingresso dell'applicazione FastAPI."""

from __future__ import annotations

import hashlib

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from starlette.responses import FileResponse
from starlette.staticfiles import NotModifiedResponse

from app.api import auth as auth_api
from app.api import backups, calendar, customers, health, inventory, meta, oslist, reports, servers, sync, transfer, users
from app.auth import csrf_protect, require_user
from app import __version__
from app.build import build_info
from app.config import PROJECT_ROOT, Settings, get_settings
from app.db import create_db_engine, make_session_factory
from app.i18n import LanguageMiddleware


class RevalidatingStaticFiles(StaticFiles):
    """File statici con `Cache-Control: no-cache`: il browser li ricontrolla a ogni caricamento.

    Senza questa intestazione i browser tengono in cache i moduli JS "a occhio": dopo un
    aggiornamento potevano mescolare file vecchi e nuovi e la pagina restava vuota. Se un file
    non è cambiato la risposta è un 304 di pochi byte, quindi non pesa.

    Validation by ETag only, and the ETag also depends on the installed version: the RPM packages
    give every file the date of the package changelog, so two packages built on the same day have
    files with the same date. Older Starlette versions (0.47 on RHEL 10) then answered 304 by
    If-Modified-Since even when the ETag was different, and the browser kept the old JavaScript.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._release = build_info()["full_version"]

    def file_response(self, full_path, stat_result, scope, status_code=200):
        response = FileResponse(full_path, status_code=status_code, stat_result=stat_result)
        base = f"{self._release}-{stat_result.st_mtime}-{stat_result.st_size}"
        etag = f'"{hashlib.md5(base.encode(), usedforsecurity=False).hexdigest()}"'
        response.headers["etag"] = etag
        if_none_match = Headers(scope=scope).get("if-none-match")
        if if_none_match and etag in [t.strip().removeprefix("W/") for t in if_none_match.split(",")]:
            return NotModifiedResponse(response.headers)
        return response

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
    # Language of server messages: from the client's Accept-Language (English by default)
    app.add_middleware(LanguageMiddleware)

    # Pubbliche: stato del servizio, versione/changelog, login.
    app.include_router(health.router, prefix="/api")
    app.include_router(meta.router, prefix="/api")
    app.include_router(auth_api.router, prefix="/api")
    # Tutto il resto richiede un utente autenticato (e l'intestazione anti-CSRF per le modifiche).
    protected = [Depends(require_user), Depends(csrf_protect)]
    for module in (calendar, servers, users, inventory, oslist, customers, transfer, sync, backups, reports):
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
