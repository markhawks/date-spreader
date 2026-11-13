"""Screenshots for the READMEs, taken from a temporary instance with the sample data only.

    python scripts/make_screenshots.py [--out docs/images/screenshots] [--lang en it]

Run it with a Python that has Playwright (`pip install playwright && playwright install chromium`):
the portal itself runs with the project's virtualenv (.venv). It creates a temporary demo database
(scripts/make_demo_db.py), starts the portal on a free local port, adds a few sample interventions
(so that the Gantt and the project column are not empty), takes the screenshots and stops everything.
It never touches the configured database: only fictitious data appear in the images.
"""

from __future__ import annotations

import argparse
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"
LOGIN, PASSWORD = "admin", "demo-password-2026"   # the demo database account (scripts/make_demo_db.py)
VIEWPORT = {"width": 1600, "height": 900}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_portal(db: Path, port: int) -> subprocess.Popen:
    subprocess.run([str(VENV_PYTHON), "scripts/make_demo_db.py", str(db)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    con = sqlite3.connect(db)
    con.execute("UPDATE users SET must_change_password = 0")   # no password change at the first login
    con.commit()
    con.close()
    env = {**os.environ, "DATABASE_PATH": str(db), "HOST": "127.0.0.1", "PORT": str(port), "RELOAD": "false"}
    proc = subprocess.Popen([str(VENV_PYTHON), "-m", "app.main"], cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1)
            return proc
        except OSError:
            time.sleep(0.25)
    proc.terminate()
    raise SystemExit("The portal did not start.")


def month_day(months: int, day: int) -> str:
    """Day `day` of the month `months` away from the current one."""
    first = date.today().replace(day=1)
    y, m = divmod(first.month - 1 + months, 12)
    return date(first.year + y, m + 1, day).isoformat()


EXTRA = """async (days) => {
  const h = {'X-Requested-With': 'datespreader', 'Content-Type': 'application/json'};
  const ps = await (await fetch('/api/projects')).json();
  const users = (await (await fetch('/api/users')).json()).filter(u => u.is_active !== false && u.role !== 'admin').map(u => u.id);
  const byName = (n) => ps.find(p => p.name === n);
  const add = (p, body) => fetch(`/api/projects/${p.id}/events`, {method: 'POST', headers: h, body: JSON.stringify(body)});
  const g = byName('Gamma Retail'), a = byName('Alfa Logistica');
  await add(g, {event_date: days.g1, title: 'Gamma – assessment', event_type: 'configurazione', start_time: '09:00', end_time: '13:00',
                order_code: 'C-2026-021', participant_ids: users.slice(0, 2), status: 'completato'});
  await add(g, {event_date: days.g2, title: 'Gamma – pilot', start_time: '14:00', end_time: '18:00', order_code: 'C-2026-021',
                participant_ids: users.slice(1, 3), status: 'completato', worked_hours: 5});
  await add(a, {event_date: days.a1, title: 'Alfa – acceptance test', event_type: 'configurazione', start_time: '09:00', end_time: '12:00',
                order_code: 'C-2026-014', participant_ids: users.slice(2, 4)});
  // this week: two interventions at the same time for one technician (a scheduling conflict)
  const b = byName('Beta Assicurazioni');
  await add(b, {event_date: days.w1, title: 'Beta – patching', event_type: 'patching', start_time: '10:00', end_time: '12:00',
                order_code: 'BA-2026/07', participant_ids: users.slice(0, 2), status: 'confermato'});
  await add(g, {event_date: days.w1, title: 'Gamma – health check', event_type: 'configurazione', start_time: '11:00', end_time: '13:00',
                order_code: 'C-2026-021', participant_ids: users.slice(1, 3)});
  await add(a, {event_date: days.w2, title: 'Alfa – web02 upgrade', event_type: 'upgrade', start_time: '14:00', end_time: '17:00',
                order_code: 'C-2026-014', participant_ids: users.slice(3, 4)});
}"""


def shoot(page, out: Path, name: str, lang: str, **kw) -> None:
    path = out / f"{name}-{lang}.png"
    page.screenshot(path=str(path), **kw)
    print("  ", path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)


def to_month(page) -> None:
    """Scrolls the calendar so that the current month starts at the top."""
    page.evaluate("""() => {
      const box = document.getElementById('calendar-scroll');
      const m = document.querySelector('#months .month.is-current') ?? document.querySelector('#months .month');
      if (box && m) box.scrollTop += m.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
    }""")
    page.wait_for_timeout(400)


def take(base: str, out: Path, lang: str, first: bool) -> None:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport=VIEWPORT, locale="it-IT" if lang == "it" else "en-US",
                                   color_scheme="light").new_page()
        page.goto(base + "/")
        page.wait_for_selector(".auth-card")
        page.fill("[name=login]", LOGIN)
        page.fill("[name=password]", PASSWORD)
        page.click(".auth-submit")
        page.wait_for_selector(".chip[data-event-id]")
        prefs = {"language": lang, "theme": "light", "calendar_view": "month", "detail_position": "right",
                 "project_view": "list", "project_sort": "date", "project_group": "none", "sidebar_width": 320}
        page.evaluate("""async (body) => { await fetch('/api/me/preferences', {method: 'PATCH',
            headers: {'X-Requested-With': 'datespreader', 'Content-Type': 'application/json'}, body: JSON.stringify(body)}); }""", prefs)
        if first:
            monday = date.today() - timedelta(days=date.today().weekday())
            page.evaluate(EXTRA, {"g1": month_day(-1, 21), "g2": month_day(0, 4), "a1": month_day(0, 25),
                                  "w1": (monday + timedelta(days=1)).isoformat(), "w2": (monday + timedelta(days=3)).isoformat()})
        # projects expanded (this browser only)
        page.evaluate("ids => localStorage.setItem('datespreader.sidebar.expanded', JSON.stringify(ids))",
                      page.evaluate("async () => (await (await fetch('/api/projects')).json()).map(p => p.id)"))
        page.reload()
        page.wait_for_selector(".chip[data-event-id]")
        page.wait_for_timeout(500)

        # 1. calendar with the project column (projects expanded), current month at the top
        to_month(page)
        shoot(page, out, "calendar", lang)

        # 2. a day with its preview on the right
        chip = page.locator(".chip[data-event-id]").first
        chip.scroll_into_view_if_needed()
        chip.click()
        page.wait_for_selector("#detail:not([hidden]) .detail-body")
        page.wait_for_timeout(600)
        shoot(page, out, "preview", lang)

        # 3. full-screen server table
        page.locator("#detail .expand-btn").first.click()
        page.wait_for_selector("#sheet:not([hidden]) table")
        page.wait_for_timeout(500)
        page.evaluate("document.activeElement?.blur()")
        page.wait_for_timeout(200)
        shoot(page, out, "server-table", lang)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        page.locator("#detail [data-close]").click()

        # 4. Gantt of the customer with the commesse
        page.click("#btn-gantt")
        page.wait_for_selector(".gt-grid")
        sel = page.locator(".gt-customer")
        value = sel.evaluate("s => [...s.options].find(o => /Alfa/.test(o.text))?.value ?? ''")
        sel.select_option(value)
        page.wait_for_selector(".gt-grid")
        page.wait_for_timeout(600)
        shoot(page, out, "gantt", lang)
        page.click(".gt-actions .btn:last-child")

        # 5. Technicians view
        page.click(".view-switch-btn[data-view=team]")
        page.wait_for_selector(".wl-grid")
        page.wait_for_timeout(500)
        shoot(page, out, "technicians", lang)
        page.click(".view-switch-btn[data-view=month]")
        page.wait_for_timeout(300)

        # 6. dark theme
        page.evaluate("""async () => { await fetch('/api/me/preferences', {method: 'PATCH',
            headers: {'X-Requested-With': 'datespreader', 'Content-Type': 'application/json'}, body: JSON.stringify({theme: 'dark'})}); }""")
        page.reload()
        page.wait_for_selector(".chip[data-event-id]")
        page.wait_for_timeout(500)
        to_month(page)
        shoot(page, out, "calendar-dark", lang)
        browser.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "docs" / "images" / "screenshots"))
    ap.add_argument("--lang", nargs="+", default=["en", "it"], choices=["en", "it"])
    args = ap.parse_args()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        port = free_port()
        proc = start_portal(Path(tmp) / "screenshots.sqlite3", port)
        try:
            for i, lang in enumerate(args.lang):
                print(f"{lang}:")
                take(f"http://127.0.0.1:{port}", out, lang, first=(i == 0))
        finally:
            proc.terminate()
            proc.wait(timeout=10)
    return 0


if __name__ == "__main__":
    sys.exit(main())
