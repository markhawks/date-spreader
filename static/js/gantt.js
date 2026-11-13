// Gantt of a customer (or of all customers) over a period: one group per commessa, then its
// projects (a bar from the first to the last intervention), then every intervention on its day.
// Next to each row: technicians, hours, man-hours, machines and statuses. Below: hours per
// technician and commessa. Printable (landscape) and exportable to Excel.
// The figures come from the server (GET /api/reports/gantt, see app/gantt.py).

import { downloadGantt, fetchGantt } from "./api.js";
import { colorFor } from "./colors.js";
import { addDays, daysInMonth, formatMediumDate, formatShortDate, formatTime, isoDate, parseIso, todayIso } from "./dates.js";
import { locale, t } from "./i18n.js";
import { EVENT_STATUS, EVENT_TYPE, badge, toneOf } from "./labels.js";
import { customers } from "./customers.js";
import { formatHours } from "./projectdialog.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const STATE_KEY = "datespreader.gantt";        // last customer/period/zoom (this browser only)
const ZOOM = { s: 14, m: 24, l: 38 };          // pixels per day
const LEFT = 700;                              // width of the columns on the left
const PRINT_WIDTH = 1050;                      // usable width of an A4 landscape page, in CSS pixels
const STATUS_ORDER = ["completato", "in_corso", "confermato", "pianificato", "rinviato", "annullato"];

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}"); } catch { return {}; }
}
function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* optional */ }
}

const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
const monthEnd = (iso) => {
  const [year, month] = iso.split("-").map(Number);
  return isoDate(year, month, daysInMonth({ year, month }));
};
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
const hoursText = (h) => `${formatHours(h)} h`;

export class Gantt {
  /**
   * @param {HTMLElement} root empty container (hidden)
   * @param {{ getProjects: () => object[], onOpenEvent: (ev) => void }} opts
   */
  constructor(root, { getProjects, onOpenEvent }) {
    this.root = root;
    this.getProjects = getProjects;
    this.onOpenEvent = onOpenEvent;
    const s = loadState();
    this.zoom = ZOOM[s.zoom] ? s.zoom : "m";
    this.collapsed = new Set();
    this.request = 0;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen && !e.defaultPrevented && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        this.close();
      }
    });
    window.addEventListener("beforeprint", () => { if (this.isOpen) { this.printing = true; this.#render(); } });
    window.addEventListener("afterprint", () => { if (this.printing) { this.printing = false; this.#render(); } });
  }

  get isOpen() { return !this.root.hidden; }

  /** @param {{ customerId?: string|number|null }} opts customer of the filter, if any */
  async open({ customerId = null } = {}) {
    this.returnFocus = document.activeElement;
    await customers.load();
    const s = loadState();
    this.customerId = customerId ? String(customerId) : (s.customerId ?? "");
    if (customerId && String(customerId) !== s.customerId) {
      Object.assign(this, this.#customerRange(this.customerId) ?? this.#defaultRange());
    } else {
      Object.assign(this, s.start && s.end ? { start: s.start, end: s.end } : (this.#customerRange(this.customerId) ?? this.#defaultRange()));
    }
    this.root.hidden = false;
    document.body.classList.add("sheet-open", "gantt-open");
    this.#build();
    await this.refresh();
  }

  close() {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.root.replaceChildren();
    document.body.classList.remove("sheet-open", "gantt-open");
    this.returnFocus?.focus?.();
  }

  /** @param {{ quiet?: boolean }} opts quiet: no "Loading…" (live updates from other users) */
  async refresh({ quiet = false } = {}) {
    if (!this.isOpen) return;
    const req = ++this.request;
    this.#save();
    if (!quiet) this.body.replaceChildren(el("p", "muted sheet-msg", t("gantt.loading")));
    try {
      const report = await fetchGantt(this.start, this.end, this.customerId || null);
      if (req !== this.request) return;
      this.report = report;
    } catch (err) {
      if (req === this.request) this.body.replaceChildren(el("p", "pf-error sheet-msg", t("gantt.load_error", { message: err.message })));
      return;
    }
    this.#render();
  }

  // ---------------------------------------------------------------------------

  #save() {
    saveState({ customerId: this.customerId, start: this.start, end: this.end, zoom: this.zoom });
  }

  #defaultRange() {
    const today = todayIso();
    return { start: monthStart(addDays(monthStart(today), -1)), end: monthEnd(today) };
  }

  /** From the first to the last intervention of the customer (whole months). */
  #customerRange(customerId) {
    if (!customerId) return null;
    const dates = this.getProjects()
      .filter((p) => String(p.customer_id ?? "") === String(customerId))
      .flatMap((p) => p.events.map((e) => e.event_date))
      .sort();
    if (!dates.length) return null;
    let start = monthStart(dates[0]);
    const end = monthEnd(dates.at(-1));
    if (daysBetween(start, end) > 366) start = monthStart(addDays(end, -365));
    return { start, end };
  }

  #customerName() {
    return customers.list.find((c) => String(c.id) === String(this.customerId))?.name ?? null;
  }

  #build() {
    const head = el("header", "sheet-header");
    const info = el("div", "sheet-info");
    const h = el("h2", "sheet-title", t("gantt.title"));
    h.id = "gantt-title";
    this.factsEl = el("p", "sheet-facts muted");
    info.append(h, this.factsEl);
    const side = el("div", "sheet-side gt-actions");
    const print = el("button", "btn", t("gantt.print"));
    print.type = "button";
    print.title = t("gantt.print_title");
    print.addEventListener("click", () => window.print());
    const xlsx = el("button", "btn", t("gantt.excel"));
    xlsx.type = "button";
    xlsx.title = t("gantt.excel_title");
    xlsx.addEventListener("click", async () => {
      xlsx.disabled = true;
      try { await downloadGantt(this.start, this.end, this.customerId || null); } catch (err) { alert(err.message); } finally { xlsx.disabled = false; }
    });
    const close = el("button", "btn", t("gantt.close"));
    close.type = "button";
    close.title = t("gantt.close_title");
    close.addEventListener("click", () => this.close());
    side.append(print, xlsx, close);
    head.append(info, side);

    // toolbar: customer, period, presets, zoom
    const bar = el("div", "sheet-toolbar gt-toolbar");
    const cust = el("select", "mini-select gt-customer");
    cust.setAttribute("aria-label", t("gantt.customer"));
    cust.append(new Option(t("gantt.all_customers"), ""));
    for (const c of customers.list) cust.append(new Option(c.name, String(c.id)));
    cust.value = this.customerId;
    cust.addEventListener("change", () => {
      this.customerId = cust.value;
      Object.assign(this, this.#customerRange(this.customerId) ?? { start: this.start, end: this.end });
      this.#syncInputs();
      this.refresh();
    });
    const from = Object.assign(el("input", "gt-date"), { type: "date", value: this.start });
    const to = Object.assign(el("input", "gt-date"), { type: "date", value: this.end });
    from.setAttribute("aria-label", t("gantt.from"));
    to.setAttribute("aria-label", t("gantt.to"));
    const onDates = () => {
      if (!from.value || !to.value) return;
      if (to.value < from.value) { to.value = from.value; }
      this.start = from.value;
      this.end = to.value;
      this.refresh();
    };
    from.addEventListener("change", onDates);
    to.addEventListener("change", onDates);
    this.fromEl = from;
    this.toEl = to;
    const period = el("span", "gt-period");
    period.append(el("span", "muted small", t("gantt.from")), from, el("span", "muted small", t("gantt.to")), to);

    const presets = el("div", "gt-presets");
    const preset = (label, title, range) => {
      const b = el("button", "btn btn-small", label);
      b.type = "button";
      b.title = title;
      b.addEventListener("click", () => {
        const r = range();
        if (!r) return;
        Object.assign(this, r);
        this.#syncInputs();
        this.refresh();
      });
      return b;
    };
    const today = todayIso();
    presets.append(
      preset(t("gantt.preset_month"), t("gantt.preset_month_title"), () => ({ start: monthStart(today), end: monthEnd(today) })),
      preset(t("gantt.preset_two"), t("gantt.preset_two_title"), () => ({ start: monthStart(addDays(monthStart(today), -1)), end: monthEnd(today) })),
      preset(t("gantt.preset_quarter"), t("gantt.preset_quarter_title"), () => ({ start: monthStart(addDays(monthStart(today), -1)), end: monthEnd(addDays(monthEnd(today), 1)) })),
      preset(t("gantt.preset_all"), t("gantt.preset_all_title"), () => this.#customerRange(this.customerId)),
    );
    this.allPreset = presets.lastChild;

    const zoom = el("div", "view-toggle gt-zoom");
    zoom.setAttribute("role", "group");
    zoom.setAttribute("aria-label", t("gantt.zoom"));
    for (const [key, label] of [["s", "S"], ["m", "M"], ["l", "L"]]) {
      const b = el("button", "view-btn", label);
      b.type = "button";
      b.title = t(`gantt.zoom_${key}`);
      b.setAttribute("aria-pressed", String(this.zoom === key));
      b.addEventListener("click", () => {
        this.zoom = key;
        zoom.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        this.#save();
        this.#render();
      });
      zoom.append(b);
    }
    bar.append(cust, period, presets, zoom);
    this.custEl = cust;

    this.body = el("div", "gt-body");
    this.root.replaceChildren(head, bar, this.body);
    this.#syncInputs();
  }

  #syncInputs() {
    this.fromEl.value = this.start;
    this.toEl.value = this.end;
    this.allPreset.disabled = !this.customerId;
  }

  #render() {
    const r = this.report;
    if (!r || !this.body) return;
    const name = this.#customerName() ?? t("gantt.all_customers");
    this.factsEl.textContent = t("gantt.facts", { customer: name, start: formatMediumDate(this.start), end: formatMediumDate(this.end) });
    this.root.querySelector(".gt-print-title")?.remove();
    const printTitle = el("h1", "gt-print-title", `${t("gantt.title")} · ${name} · ${formatMediumDate(this.start)} – ${formatMediumDate(this.end)}`);
    if (!r.totals.events) {
      this.body.replaceChildren(printTitle, el("p", "muted sheet-msg", t("gantt.empty")));
      return;
    }
    // keep the scroll positions when the same period is drawn again (zoom aside)
    const old = this.body.querySelector(".gt-scroll");
    const keep = old && this.drawn === `${this.start}|${this.end}|${this.zoom}` ? { left: old.scrollLeft, top: this.body.scrollTop } : null;
    this.drawn = `${this.start}|${this.end}|${this.zoom}`;
    this.keepScroll = keep;
    this.body.replaceChildren(printTitle, this.#summary(r.totals), this.#chart(r), this.#techTable(r));
    if (keep) this.body.scrollTop = keep.top;
  }

  // --- summary cards ----------------------------------------------------------

  #summary(tot) {
    const box = el("section", "gt-summary");
    const card = (label, value, sub) => {
      const c = el("div", "gt-card");
      c.append(el("span", "gt-card-label", label), el("strong", "gt-card-value", value));
      if (sub) c.append(sub);
      return c;
    };
    const statuses = el("div", "gt-card-statuses");
    for (const s of STATUS_ORDER) {
      if (!tot.statuses[s]) continue;
      const b = badge(s, EVENT_STATUS);
      b.textContent = `${EVENT_STATUS[s] ?? s} ${tot.statuses[s]}`;
      statuses.append(b);
    }
    const orders = this.report.orders.filter((o) => o.order_code).length;
    box.append(
      card(t("gantt.card_events"), String(tot.events), statuses),
      card(t("gantt.card_orders"), String(orders), el("span", "muted small", this.report.orders.some((o) => !o.order_code) ? t("gantt.card_orders_none") : "")),
      card(t("gantt.card_servers"), String(tot.servers), el("span", "muted small", t("gantt.card_servers_sub"))),
      card(t("gantt.card_hours"), hoursText(tot.hours), tot.missing_hours
        ? el("span", "gt-warn small", t("gantt.card_missing", { n: tot.missing_hours }))
        : el("span", "muted small", t("gantt.card_hours_sub"))),
      card(t("gantt.card_man_hours"), hoursText(tot.man_hours), el("span", "muted small", t("gantt.card_man_hours_sub"))),
      card(t("gantt.card_technicians"), String(tot.technicians.length), tot.no_technicians
        ? el("span", "gt-warn small", t("gantt.card_no_tech", { n: tot.no_technicians }))
        : el("span", "muted small", tot.technicians.slice(0, 3).map((x) => x.name).join(", "))),
    );
    return box;
  }

  // --- the chart --------------------------------------------------------------

  #chart(r) {
    const nDays = daysBetween(this.start, this.end) + 1;
    const left = this.printing ? 620 : window.innerWidth < 1300 ? LEFT - 110 : LEFT;
    const dw = this.printing ? Math.max(4, Math.min(ZOOM.m, (PRINT_WIDTH - left) / nDays)) : ZOOM[this.zoom];
    const days = Array.from({ length: nDays }, (_, i) => addDays(this.start, i));
    const today = todayIso();
    const x = (iso) => daysBetween(this.start, iso) * dw;

    const wrap = el("section", "gt-wrap");
    wrap.style.setProperty("--gt-left", `${left}px`);
    wrap.style.setProperty("--gt-dw", `${dw}px`);
    wrap.style.setProperty("--gt-width", `${nDays * dw}px`);
    const scroll = el("div", "gt-scroll");
    const grid = el("div", "gt-grid");
    grid.setAttribute("role", "table");
    grid.setAttribute("aria-label", t("gantt.table_label"));

    // header: columns on the left, months and days on the right
    const head = el("div", "gt-row gt-head");
    head.setAttribute("role", "row");
    const lh = el("div", "gt-left");
    for (const [cls, key] of [["gt-c-name", "col_name"], ["gt-c-tech", "col_technicians"], ["gt-c-num", "col_hours"],
      ["gt-c-num", "col_man_hours"], ["gt-c-num", "col_servers"], ["gt-c-status", "col_status"]]) {
      const c = el("span", cls, t(`gantt.${key}`));
      c.setAttribute("role", "columnheader");
      lh.append(c);
    }
    const track = el("div", "gt-track gt-days");
    const fmtMonth = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
    const fmtWd = new Intl.DateTimeFormat(locale(), { weekday: "narrow" });
    let i = 0;
    while (i < nDays) {
      const m = days[i].slice(0, 7);
      let j = i;
      while (j < nDays && days[j].slice(0, 7) === m) j++;
      const month = el("span", "gt-month", fmtMonth.format(parseIso(days[i])));
      month.style.left = `${i * dw}px`;
      month.style.width = `${(j - i) * dw}px`;
      track.append(month);
      i = j;
    }
    days.forEach((d, k) => {
      const wd = parseIso(d).getDay();
      const c = el("span", `gt-day${wd % 6 === 0 ? " weekend" : ""}${d === today ? " today" : ""}`);
      c.style.left = `${k * dw}px`;
      c.title = formatMediumDate(d);
      if (dw >= 18) c.append(el("b", null, String(parseIso(d).getDate())), el("i", null, fmtWd.format(parseIso(d))));
      else if (dw >= 10 && (parseIso(d).getDate() === 1 || wd === 1)) c.append(el("b", null, String(parseIso(d).getDate())));
      track.append(c);
    });
    head.append(lh, track);
    grid.append(head);

    // background: weekends and today, across all the rows
    const bg = el("div", "gt-bg");
    days.forEach((d, k) => {
      if (parseIso(d).getDay() % 6 === 0) {
        const w = el("span", "gt-bg-weekend");
        w.style.left = `${k * dw}px`;
        bg.append(w);
      }
    });
    if (today >= this.start && today <= this.end) {
      const line = el("span", "gt-bg-today");
      line.style.left = `${x(today) + dw / 2}px`;
      line.title = t("gantt.today");
      bg.append(line);
    }

    const rowsBox = el("div", "gt-rows");
    rowsBox.append(bg);
    for (const o of r.orders) {
      const key = `${o.customer_id ?? ""}|${o.order_code ?? ""}`;
      const closed = this.collapsed.has(key) && !this.printing;
      rowsBox.append(this.#orderRow(o, key, closed, x, dw));
      if (closed) continue;
      for (const p of o.projects) {
        rowsBox.append(this.#projectRow(p, x, dw));
        for (const ev of p.events) rowsBox.append(this.#eventRow(ev, p, x, dw));
      }
    }
    // total
    const tot = el("div", "gt-row gt-total");
    tot.setAttribute("role", "row");
    tot.append(this.#left(t("gantt.total"), null, r.totals, { cls: "gt-total-left" }), el("div", "gt-track"));
    rowsBox.append(tot);
    grid.append(rowsBox);
    scroll.append(grid);
    wrap.append(scroll);

    // legend
    const legend = el("div", "gt-legend small muted");
    for (const s of STATUS_ORDER) {
      const item = el("span", "gt-legend-item");
      item.append(el("span", `gt-swatch tone-${toneOf(s)}`), EVENT_STATUS[s] ?? s);
      legend.append(item);
    }
    legend.append(el("span", "gt-legend-note", t("gantt.legend_hours")));
    wrap.append(legend);

    // starts on today (or on the first intervention) when the period is wide
    requestAnimationFrame(() => {
      if (this.printing) return;
      if (this.keepScroll) { scroll.scrollLeft = this.keepScroll.left; return; }
      // from the first intervention, so that the start of the work is visible
      const target = x(r.totals.first ?? this.start) - 2 * dw;
      if (target > 0) scroll.scrollLeft = target;
    });
    return wrap;
  }

  /** The columns on the left of a row: name, technicians, hours, man-hours, machines, statuses. */
  #left(nameNode, techs, tot, { cls = "", status = null } = {}) {
    const left = el("div", `gt-left ${cls}`);
    left.setAttribute("role", "rowheader");
    const name = el("span", "gt-c-name");
    name.append(nameNode);
    const techList = techs ?? tot.technicians.map((x) => x.name);
    const tech = el("span", "gt-c-tech", techList.join(", "));
    tech.title = techList.join(", ");
    const hours = el("span", "gt-c-num", hoursText(tot.hours));
    const man = el("span", "gt-c-num", hoursText(tot.man_hours));
    const servers = el("span", "gt-c-num", String(tot.servers));
    const st = el("span", "gt-c-status");
    st.append(status ?? this.#statusBar(tot.statuses));
    left.append(name, tech, hours, man, servers, st);
    return left;
  }

  /** Proportional bar of the statuses of a group, with the counts in the tooltip. */
  #statusBar(statuses) {
    const bar = el("span", "gt-status-bar");
    const total = Object.values(statuses).reduce((a, b) => a + b, 0);
    for (const s of STATUS_ORDER) {
      if (!statuses[s]) continue;
      const seg = el("span", `tone-${toneOf(s)}`);
      seg.style.flexGrow = statuses[s];
      bar.append(seg);
    }
    bar.title = STATUS_ORDER.filter((s) => statuses[s]).map((s) => `${EVENT_STATUS[s] ?? s}: ${statuses[s]}`).join(" · ");
    bar.setAttribute("aria-label", bar.title);
    bar.dataset.n = total;
    return bar;
  }

  #span(cls, first, last, x, dw) {
    const b = el("span", `gt-bar ${cls}`);
    b.style.left = `${x(first)}px`;
    b.style.width = `${x(last) - x(first) + dw}px`;
    return b;
  }

  #orderRow(o, key, closed, x, dw) {
    const row = el("div", "gt-row gt-order");
    row.setAttribute("role", "row");
    const name = el("button", "gt-toggle");
    name.type = "button";
    name.setAttribute("aria-expanded", String(!closed));
    const label = o.order_code ? t("gantt.order", { code: o.order_code }) : t("gantt.no_order");
    name.append(el("span", "gt-chev", "›"), el("strong", null, o.order_code ?? t("gantt.no_order")));
    if (!this.customerId && o.customer_name) name.append(el("span", "muted small gt-order-cust", o.customer_name));
    name.append(el("span", "muted small", t("gantt.events_n", { n: o.totals.events })));
    name.title = t(closed ? "gantt.expand" : "gantt.collapse");
    name.addEventListener("click", () => {
      if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key);
      this.#render();
    });
    const track = el("div", "gt-track");
    if (o.totals.first) {
      const bar = this.#span("gt-bar-order", o.totals.first, o.totals.last, x, dw);
      bar.title = `${label} · ${formatShortDate(o.totals.first)} – ${formatShortDate(o.totals.last)} · ${hoursText(o.totals.man_hours)} ${t("gantt.man_hours_short")}`;
      track.append(bar);
    }
    row.append(this.#left(name, null, o.totals, { cls: "gt-order-left" }), track);
    return row;
  }

  #projectRow(p, x, dw) {
    const row = el("div", "gt-row gt-project");
    row.setAttribute("role", "row");
    row.style.setProperty("--c", colorFor(p.id));
    const name = el("span", "gt-project-name");
    name.append(el("span", "gt-dot"), el("span", null, p.name));
    const track = el("div", "gt-track");
    if (p.totals.first) {
      const bar = this.#span("gt-bar-project", p.totals.first, p.totals.last, x, dw);
      bar.title = `${p.name} · ${formatShortDate(p.totals.first)} – ${formatShortDate(p.totals.last)}`;
      track.append(bar);
    }
    row.append(this.#left(name, null, p.totals), track);
    return row;
  }

  #eventRow(ev, p, x, dw) {
    const row = el("div", `gt-row gt-event status-${ev.status}`);
    row.setAttribute("role", "row");
    row.style.setProperty("--c", colorFor(p.id));
    const time = ev.start_time ? `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}` : "";
    const what = ev.title || EVENT_TYPE[ev.event_type] || ev.event_type;
    const open = el("button", "gt-event-name");
    open.type = "button";
    open.append(el("span", "gt-event-date", formatShortDate(ev.event_date)), el("span", "gt-event-title", what));
    open.title = [formatMediumDate(ev.event_date), time, what, t("gantt.open_event")].filter(Boolean).join(" · ");
    open.addEventListener("click", () => this.onOpenEvent(ev));
    const tot = { hours: ev.hours, man_hours: ev.man_hours, servers: ev.servers, statuses: {}, technicians: [] };
    const left = this.#left(open, ev.technicians, tot, { status: badge(ev.status, EVENT_STATUS) });
    // hours: source in the tooltip, flagged when missing
    const hoursCell = left.children[2];
    if (ev.hours_source === "missing") {
      hoursCell.textContent = "—";
      hoursCell.classList.add("gt-warn");
      hoursCell.title = t("gantt.hours_missing");
    } else {
      hoursCell.title = t(`gantt.hours_${ev.hours_source}`, { time });
      if (ev.hours_source === "worked") hoursCell.classList.add("gt-worked");
    }
    if (!ev.technicians.length) {
      left.children[1].textContent = "—";
      left.children[1].classList.add("gt-warn");
      left.children[1].title = t("gantt.no_technicians");
    }
    const serversCell = left.children[4];
    serversCell.textContent = ev.servers ? `${ev.migrated}/${ev.servers}` : "0";
    serversCell.title = t("gantt.servers_done", { done: ev.migrated, n: ev.servers });

    const track = el("div", "gt-track");
    const block = el("button", `gt-block tone-${toneOf(ev.status)}`);
    block.type = "button";
    block.style.left = `${x(ev.event_date)}px`;
    block.style.width = `${dw}px`;
    if (dw >= 30 && ev.hours) block.textContent = formatHours(ev.hours);
    block.title = [formatMediumDate(ev.event_date), time, p.name, what, EVENT_STATUS[ev.status] ?? ev.status,
      ev.hours_source === "missing" ? t("gantt.hours_missing") : hoursText(ev.hours),
      ev.technicians.join(", ")].filter(Boolean).join(" · ");
    block.addEventListener("click", () => this.onOpenEvent(ev));
    track.append(block);
    row.append(left, track);
    return row;
  }

  // --- hours per technician and commessa ----------------------------------------

  #techTable(r) {
    const box = el("section", "gt-techs");
    box.append(el("h3", null, t("gantt.tech_title")));
    if (!r.totals.technicians.length) {
      box.append(el("p", "muted", t("gantt.tech_none")));
      return box;
    }
    const orders = r.orders;
    const table = el("table", "gt-tech-table");
    const thead = el("thead");
    const hr = el("tr");
    hr.append(el("th", null, t("gantt.col_technician")));
    for (const o of orders) {
      const label = o.order_code ?? t("gantt.no_order");
      const th = el("th", "num", !this.customerId && o.customer_name ? `${o.customer_name} · ${label}` : label);
      hr.append(th);
    }
    hr.append(el("th", "num", t("gantt.total")));
    thead.append(hr);
    const tbody = el("tbody");
    for (const tech of r.totals.technicians) {
      const tr = el("tr");
      tr.append(el("th", null, tech.name));
      for (const o of orders) {
        const h = o.totals.technicians.find((x) => x.id === tech.id);
        const td = el("td", "num", h ? hoursText(h.hours) : "");
        if (h) td.title = t("gantt.events_n", { n: h.events });
        tr.append(td);
      }
      const td = el("td", "num strong", hoursText(tech.hours));
      td.title = t("gantt.events_n", { n: tech.events });
      tr.append(td);
      tbody.append(tr);
    }
    const tfoot = el("tfoot");
    const fr = el("tr");
    fr.append(el("th", null, t("gantt.man_hours_total")));
    for (const o of orders) fr.append(el("td", "num", hoursText(o.totals.man_hours)));
    fr.append(el("td", "num strong", hoursText(r.totals.man_hours)));
    tfoot.append(fr);
    table.append(thead, tbody, tfoot);
    const wrap = el("div", "gt-tech-wrap");
    wrap.append(table);
    box.append(wrap, el("p", "muted small", t("gantt.tech_note")));
    return box;
  }
}
