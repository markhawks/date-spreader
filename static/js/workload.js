// Technicians' workload: one row per technician, one column per day of the week, with the
// interventions each technician is in (as participant or assigned to a server row).
// Interventions where the technician is double-booked are highlighted (conflicts computed by
// the server: EventSummary.conflict_users). A last row lists interventions without technicians.

import { fetchEvents } from "./api.js";
import { colorFor } from "./colors.js";
import { addDays, formatTime, formatWeek, isoWeek, mondayOf, parseIso, todayIso } from "./dates.js";
import { locale, t } from "./i18n.js";
import { EVENT_STATUS } from "./labels.js";
import { people } from "./people.js";
import { warnIcon } from "./conflicts.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const NOBODY = "none";

export class Workload {
  /**
   * @param {HTMLElement} root container (hidden while the calendar is shown)
   * @param {{ onOpenEvent: (ev) => void, onError: (err) => void }} opts
   */
  constructor(root, { onOpenEvent = () => {}, onError = console.error } = {}) {
    this.root = root;
    this.onOpenEvent = onOpenEvent;
    this.onError = onError;
    this.monday = mondayOf(todayIso());
    this.events = [];
    this.filter = null;
    this.showAll = false;
    this.isOpen = false;
    this.selectedId = null;
    this.request = 0;
    people.onChange(() => { if (this.isOpen) this.#render(); });
  }

  async open(iso = todayIso()) {
    this.isOpen = true;
    this.root.hidden = false;
    this.monday = mondayOf(iso);
    await this.refresh();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
  }

  async goToday() {
    this.monday = mondayOf(todayIso());
    await this.refresh();
  }

  async move(weeks) {
    this.monday = addDays(this.monday, 7 * weeks);
    await this.refresh();
  }

  /** "all" or "workweek" (Mon–Fri; Saturday and Sunday only in weeks with interventions on them). */
  setDays(mode) {
    this.days = mode;
    if (this.isOpen) this.#render();
  }

  setFilter(predicate) {
    this.filter = predicate;
    if (this.isOpen) this.#render();
  }

  setSelected(eventId) {
    this.selectedId = eventId;
    this.root.querySelectorAll(".wl-chip.selected").forEach((c) => c.classList.remove("selected"));
    if (eventId) this.root.querySelectorAll(`.wl-chip[data-event-id="${eventId}"]`).forEach((c) => c.classList.add("selected"));
  }

  async refresh() {
    const req = ++this.request;
    try {
      const events = await fetchEvents(this.monday, addDays(this.monday, 6));
      if (req !== this.request) return;
      this.events = events;
    } catch (err) {
      this.onError(new Error(t("workload.load_error", { message: err.message })));
      return;
    }
    this.#render();
  }

  #render() {
    const today = todayIso();
    const events = this.filter ? this.events.filter(this.filter) : this.events;
    const weekendBusy = events.some((ev) => parseIso(ev.event_date).getDay() % 6 === 0);
    const days = Array.from({ length: this.days === "workweek" && !weekendBusy ? 5 : 7 }, (_, i) => addDays(this.monday, i));

    // technician → day → events
    const rows = new Map();
    const add = (key, ev) => {
      if (!rows.has(key)) rows.set(key, new Map(days.map((d) => [d, []])));
      rows.get(key).get(ev.event_date)?.push(ev);
    };
    for (const ev of events) {
      if (ev.user_ids?.length) ev.user_ids.forEach((uid) => add(uid, ev));
      else add(NOBODY, ev);
    }
    const name = (id) => people.byId(id)?.display_name ?? `#${id}`;
    let ids = [...rows.keys()].filter((k) => k !== NOBODY);
    if (this.showAll) {
      for (const u of people.active()) if (!rows.has(u.id)) { rows.set(u.id, new Map(days.map((d) => [d, []]))); ids.push(u.id); }
    }
    ids = ids.sort((a, b) => name(a).localeCompare(name(b), locale()));
    if (rows.has(NOBODY)) ids.push(NOBODY);

    // toolbar
    const bar = el("div", "wl-bar");
    const prev = el("button", "btn btn-small", "‹");
    prev.type = "button";
    prev.setAttribute("aria-label", t("workload.prev"));
    prev.title = t("workload.prev");
    prev.addEventListener("click", () => this.move(-1));
    const next = el("button", "btn btn-small", "›");
    next.type = "button";
    next.setAttribute("aria-label", t("workload.next"));
    next.title = t("workload.next");
    next.addEventListener("click", () => this.move(1));
    const title = el("h2", `wl-title${days.includes(today) ? " is-current" : ""}`,
      t("workload.title", { n: isoWeek(this.monday), range: formatWeek(this.monday) }));
    const all = el("label", "wl-all");
    const cb = Object.assign(el("input"), { type: "checkbox", checked: this.showAll });
    cb.addEventListener("change", () => { this.showAll = cb.checked; this.#render(); });
    all.append(cb, " ", t("workload.show_all"));
    const conflicts = events.reduce((n, ev) => n + (ev.conflict_users?.length ?? 0), 0);
    const summary = el("span", "muted small wl-summary");
    if (conflicts) summary.append(warnIcon());
    summary.append(conflicts
      ? t("workload.summary_conflicts", { n: events.length, c: conflicts })
      : t("workload.summary", { n: events.length }));
    bar.append(prev, title, next, summary, all);

    // grid
    const grid = el("div", "wl-grid");
    grid.style.setProperty("--wl-days", days.length);
    grid.setAttribute("role", "table");
    grid.setAttribute("aria-label", t("workload.table_label"));
    const head = el("div", "wl-row wl-head");
    head.setAttribute("role", "row");
    head.append(el("div", "wl-name", t("workload.technician")));
    const fmtDay = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric" });
    for (const d of days) {
      const c = el("div", `wl-day${d === today ? " today" : ""}${parseIso(d).getDay() % 6 === 0 ? " weekend" : ""}`, fmtDay.format(parseIso(d)));
      c.setAttribute("role", "columnheader");
      head.append(c);
    }
    grid.append(head);

    if (!ids.length) {
      const empty = el("p", "muted wl-empty", t("workload.empty"));
      grid.append(empty);
    }
    for (const id of ids) {
      const row = el("div", `wl-row${id === NOBODY ? " wl-nobody" : ""}`);
      row.setAttribute("role", "row");
      const cells = rows.get(id);
      const count = [...cells.values()].reduce((n, list) => n + list.length, 0);
      const who = el("div", "wl-name");
      who.setAttribute("role", "rowheader");
      who.append(el("strong", null, id === NOBODY ? t("workload.nobody") : name(id)),
        el("span", "muted small", count ? t("workload.count", { n: count }) : t("workload.free")));
      row.append(who);
      for (const d of days) {
        const cell = el("div", `wl-cell${d === today ? " today" : ""}${parseIso(d).getDay() % 6 === 0 ? " weekend" : ""}`);
        cell.dataset.day = fmtDay.format(parseIso(d)); // label shown when the days are stacked (narrow view)
        cell.setAttribute("role", "cell");
        const list = cells.get(d);
        const busy = id !== NOBODY && list.filter((ev) => ev.conflict_users?.includes(id));
        if (busy && busy.length) cell.classList.add("wl-overbooked");
        for (const ev of list) cell.append(this.#chip(ev, id));
        row.append(cell);
      }
      grid.append(row);
    }
    this.root.replaceChildren(bar, el("div", "wl-scroll"));
    this.root.lastChild.append(grid);
    this.setSelected(this.selectedId);
  }

  #chip(ev, userId) {
    const b = el("button", `wl-chip status-${ev.status}`);
    b.type = "button";
    b.dataset.eventId = ev.id;
    b.style.setProperty("--c", colorFor(ev.project_id));
    const conflict = userId !== NOBODY && ev.conflict_users?.includes(userId);
    if (conflict) b.classList.add("has-conflict");
    const time = ev.start_time ? `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}` : t("workload.all_day");
    const nameEl = el("span", "wl-chip-name", ev.project_name);
    if (conflict) nameEl.prepend(warnIcon());
    b.append(nameEl, el("span", "wl-chip-meta", [time, ev.customer_name].filter(Boolean).join(" · ")));
    b.title = [
      ev.customer_name, ev.order_code && t("workload.order", { code: ev.order_code }), ev.project_name, ev.title, time, EVENT_STATUS[ev.status] ?? ev.status,
      conflict && t("workload.conflict_tip"),
    ].filter(Boolean).join(" · ");
    b.addEventListener("click", () => { this.setSelected(ev.id); this.onOpenEvent(ev); });
    return b;
  }
}
