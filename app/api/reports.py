"""Reports: the Gantt of a period (optionally of one customer), as JSON and as an Excel file."""

from __future__ import annotations

import io
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.gantt import build_gantt
from app.i18n import tr
from app.models import Customer
from app.schemas.gantt import GanttReport

router = APIRouter(tags=["report"])
SessionDep = Annotated[Session, Depends(get_session)]
MAX_DAYS = 400


def _report(session: Session, start: date, end: date, customer_id: int | None) -> dict:
    if end < start:
        raise HTTPException(422, tr("gantt.bad_period"))
    if (end - start).days > MAX_DAYS:
        raise HTTPException(422, tr("gantt.period_too_long", n=MAX_DAYS))
    if customer_id is not None and session.get(Customer, customer_id) is None:
        raise HTTPException(404, tr("customers.not_found"))
    return build_gantt(session, start, end, customer_id)


@router.get("/reports/gantt", response_model=GanttReport)
def gantt(
    session: SessionDep,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    customer_id: Annotated[int | None, Query()] = None,
) -> dict:
    """Interventions from `start` to `end` grouped by commessa → project, with hours, man-hours,
    technicians, machines and statuses."""
    return _report(session, start, end, customer_id)


@router.get("/reports/gantt.xlsx")
def gantt_xlsx(
    session: SessionDep,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    customer_id: Annotated[int | None, Query()] = None,
) -> Response:
    """The same report as an Excel file: Gantt sheet (one column per day), hours per technician, summary."""
    report = _report(session, start, end, customer_id)
    customer = session.get(Customer, customer_id) if customer_id is not None else None
    data = gantt_workbook(report, customer.name if customer else None)
    name = f"gantt-{start:%Y%m%d}-{end:%Y%m%d}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"},
    )


# --- Excel ------------------------------------------------------------------------------------

STATUS_FILL = {   # same tones as the badges of the portal
    "completato": "86EFAC", "in_corso": "FCD34D", "confermato": "93C5FD", "pianificato": "BFDBFE",
    "rinviato": "FDE68A", "annullato": "D1D5DB",
}


def _hours(h: float) -> float:
    return round(h, 2)


def gantt_workbook(report: dict, customer_name: str | None) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    bold = Font(bold=True)
    head_fill = PatternFill("solid", fgColor="E5E7EB")
    order_fill = PatternFill("solid", fgColor="F3F4F6")
    weekend_fill = PatternFill("solid", fgColor="F5F5F4")
    span_fill = PatternFill("solid", fgColor="E0E7FF")
    thin = Side(style="thin", color="D1D5DB")
    start, end = report["start"], report["end"]
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]

    wb = Workbook()
    ws = wb.active
    ws.title = tr("gantt.xlsx.sheet_gantt")[:31]
    title = tr("gantt.xlsx.title", customer=customer_name or tr("gantt.all_customers"),
               start=start.strftime("%d/%m/%Y"), end=end.strftime("%d/%m/%Y"))
    ws.append([title])
    ws["A1"].font = Font(bold=True, size=13)
    cols = [tr(f"gantt.xlsx.col.{c}") for c in
            ("order", "project", "event", "date", "time", "status", "technicians", "hours", "man_hours", "servers", "events")]
    fixed = len(cols)
    ws.append(cols + [d.strftime("%d/%m") for d in days])
    header_row = 2
    for c in range(1, fixed + len(days) + 1):
        cell = ws.cell(header_row, c)
        cell.font = bold
        cell.fill = head_fill
        if c > fixed:
            cell.alignment = Alignment(text_rotation=90, horizontal="center")
            if days[c - fixed - 1].weekday() >= 5:
                cell.fill = PatternFill("solid", fgColor="D6D3D1")

    def day_col(d: date) -> int:
        return fixed + (d - start).days + 1

    def shade_weekends(row: int) -> None:
        for i, d in enumerate(days):
            if d.weekday() >= 5:
                ws.cell(row, fixed + i + 1).fill = weekend_fill

    for o in report["orders"]:
        t = o["totals"]
        label = o["order_code"] or tr("gantt.no_order")
        if not customer_name and o["customer_name"]:
            label = f"{o['customer_name']} · {label}"
        ws.append([label, "", "", "", "", ", ".join(f"{status_label(s)}: {n}" for s, n in t["statuses"].items()),
                   ", ".join(x["name"] for x in t["technicians"]), _hours(t["hours"]), _hours(t["man_hours"]),
                   t["servers"], t["events"]])
        r = ws.max_row
        for c in range(1, fixed + len(days) + 1):
            ws.cell(r, c).fill = order_fill
            ws.cell(r, c).font = bold
        for p in o["projects"]:
            pt = p["totals"]
            ws.append(["", p["name"], "", "", "", "", ", ".join(x["name"] for x in pt["technicians"]),
                       _hours(pt["hours"]), _hours(pt["man_hours"]), pt["servers"], pt["events"]])
            r = ws.max_row
            ws.cell(r, 2).font = bold
            shade_weekends(r)
            if pt["first"] and pt["last"]:
                for d in days:
                    if pt["first"] <= d <= pt["last"]:
                        ws.cell(r, day_col(d)).fill = span_fill
            for ev in p["events"]:
                time_text = ""
                if ev["start_time"]:
                    time_text = ev["start_time"].strftime("%H:%M") + (f"–{ev['end_time']:%H:%M}" if ev["end_time"] else "")
                hours = _hours(ev["hours"]) if ev["hours_source"] != "missing" else None
                ws.append(["", "", ev["title"] or tr(f"gantt.type.{ev['event_type']}"), ev["event_date"], time_text,
                           status_label(ev["status"]), ", ".join(ev["technicians"]), hours, _hours(ev["man_hours"]),
                           ev["servers"], 1])
                r = ws.max_row
                ws.cell(r, 4).number_format = "DD/MM/YYYY"
                shade_weekends(r)
                cell = ws.cell(r, day_col(ev["event_date"]))
                cell.fill = PatternFill("solid", fgColor=STATUS_FILL.get(ev["status"], "C7D2FE"))
                cell.value = hours if hours else None
                cell.alignment = Alignment(horizontal="center")
                cell.font = Font(size=8)
    tt = report["totals"]
    ws.append([tr("gantt.xlsx.total"), "", "", "", "", ", ".join(f"{status_label(s)}: {n}" for s, n in tt["statuses"].items()),
               "", _hours(tt["hours"]), _hours(tt["man_hours"]), tt["servers"], tt["events"]])
    for c in range(1, fixed + 1):
        ws.cell(ws.max_row, c).font = bold
        ws.cell(ws.max_row, c).border = Border(top=thin)
    widths = [18, 24, 28, 11, 12, 16, 26, 7, 9, 9, 10]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for i in range(len(days)):
        ws.column_dimensions[get_column_letter(fixed + i + 1)].width = 4.2
    ws.freeze_panes = ws.cell(header_row + 1, fixed + 1)

    # hours per technician and commessa
    ws2 = wb.create_sheet(tr("gantt.xlsx.sheet_technicians")[:31])
    ws2.append([tr("gantt.xlsx.col.order"), tr("gantt.xlsx.col.technician"), tr("gantt.xlsx.col.hours"), tr("gantt.xlsx.col.events")])
    for c in range(1, 5):
        ws2.cell(1, c).font = bold
        ws2.cell(1, c).fill = head_fill
    for o in report["orders"]:
        label = o["order_code"] or tr("gantt.no_order")
        if not customer_name and o["customer_name"]:
            label = f"{o['customer_name']} · {label}"
        for x in o["totals"]["technicians"]:
            ws2.append([label, x["name"], _hours(x["hours"]), x["events"]])
    ws2.append([])
    ws2.append([tr("gantt.xlsx.total"), "", "", ""])
    ws2.cell(ws2.max_row, 1).font = bold
    for x in tt["technicians"]:
        ws2.append(["", x["name"], _hours(x["hours"]), x["events"]])
    for col, w in zip("ABCD", (26, 26, 9, 11)):
        ws2.column_dimensions[col].width = w

    # summary
    ws3 = wb.create_sheet(tr("gantt.xlsx.sheet_summary")[:31])
    rows = [
        (tr("gantt.xlsx.col.order"), tr("gantt.xlsx.col.events"), tr("gantt.xlsx.col.servers"),
         tr("gantt.xlsx.col.hours"), tr("gantt.xlsx.col.man_hours"), tr("gantt.xlsx.col.status"),
         tr("gantt.xlsx.col.from"), tr("gantt.xlsx.col.to")),
    ]
    for o in report["orders"]:
        t = o["totals"]
        label = o["order_code"] or tr("gantt.no_order")
        if not customer_name and o["customer_name"]:
            label = f"{o['customer_name']} · {label}"
        rows.append((label, t["events"], t["servers"], _hours(t["hours"]), _hours(t["man_hours"]),
                     ", ".join(f"{status_label(s)}: {n}" for s, n in t["statuses"].items()), t["first"], t["last"]))
    rows.append((tr("gantt.xlsx.total"), tt["events"], tt["servers"], _hours(tt["hours"]), _hours(tt["man_hours"]),
                 ", ".join(f"{status_label(s)}: {n}" for s, n in tt["statuses"].items()), tt["first"], tt["last"]))
    for row in rows:
        ws3.append(list(row))
    for c in range(1, 9):
        ws3.cell(1, c).font = bold
        ws3.cell(1, c).fill = head_fill
        ws3.cell(ws3.max_row, c).font = bold
    for r in range(2, ws3.max_row + 1):
        for c in (7, 8):
            ws3.cell(r, c).number_format = "DD/MM/YYYY"
    if tt["missing_hours"]:
        ws3.append([])
        ws3.append([tr("gantt.xlsx.missing_note", n=tt["missing_hours"])])
    for col, w in zip("ABCDEFGH", (28, 11, 10, 9, 10, 40, 12, 12)):
        ws3.column_dimensions[col].width = w

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def status_label(status: str) -> str:
    return tr(f"gantt.status.{status}")
