// Calendario verticale: un blocco per mese (o per settimana, nella vista settimanale),
// impilati dall'alto verso il basso. All'avvio mostra il periodo precedente, il corrente e il
// successivo e centra il corrente; avvicinandosi al bordo superiore/inferiore ne aggiunge altri.

import { fetchEvents } from "./api.js";
import { colorFor } from "./colors.js";
import {
  WEEKDAYS, addDays, addMonths, daysInMonth, firstWeekdayMonday, formatMonth, formatTime, formatWeek,
  isoDate, isoWeek, monthRange, mondayOf, parseIso, todayIso, ymKey,
} from "./dates.js";
import { EVENT_STATUS, EVENT_TYPE } from "./labels.js";
import { people } from "./people.js";
import { warnIcon } from "./conflicts.js";
import { locale, t } from "./i18n.js";

const EDGE_PX = 400;        // distanza dal bordo che fa caricare un altro mese
const MAX_CHIPS = 2;        // interventi per giorno a zoom normale; oltre, la cella mostra "+N"
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
const COMPACT_BELOW = 78;   // px di altezza del giorno: sotto, gli interventi diventano barrette colorate
const DETAILED_FROM = 166;  // px: da qui un giorno con spazio mostra anche titolo e orario completo
// Altezze (px) di un intervento nei vari modi, più lo spazio fisso del giorno (margini + numero)
const CHIP_H = { detailed: 54, normal: 37, slim: 21 };
const CHIP_GAP = 3;
const DAY_FIXED = 39;       // padding 12 + numero del giorno 24 + spazio 3
const MORE_H = 16;          // riga «+N»
const BAR_H = 6;            // barretta nel modo compatto
const BAR_GAP = 2;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
const AUTO_SCROLL_MS = 1200; // limite massimo di uno scorrimento animato

const ymFromIso = (iso) => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
const cmpYm = (a, b) => (a.year - b.year) * 12 + (a.month - b.month);

/**
 * Unità di caricamento e di disegno del calendario. Un periodo è un mese ({year, month})
 * o una settimana (data ISO del suo lunedì); ogni periodo è un blocco <section class="month">.
 */
const MONTH = {
  view: "month",
  ofIso: ymFromIso,
  key: ymKey,
  parse: (key) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) }),
  add: addMonths,
  cmp: cmpYm,
  range: monthRange,
  loadError: (ym, message) => t("calendar.load_month_error", { month: formatMonth(ym), message }),
};
const WEEK = {
  view: "week",
  ofIso: mondayOf,
  key: (monday) => monday,
  parse: (key) => key,
  add: (monday, n) => addDays(monday, 7 * n),
  cmp: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  range: (monday) => ({ start: monday, end: addDays(monday, 6) }),
  loadError: (monday, message) => t("calendar.load_week_error", { range: formatWeek(monday), message }),
};
const fmtWeekdayShort = new Intl.DateTimeFormat(locale(), { weekday: "short" });
const fmtMonthShort = new Intl.DateTimeFormat(locale(), { month: "short" });

export class Calendar {
  /**
   * @param {HTMLElement} scrollEl contenitore con lo scorrimento verticale
   * @param {HTMLElement} monthsEl contenitore dei blocchi mese
   * @param {{ onError?: (err: Error) => void,
   *           onDayClick?: (iso: string, eventId: number|null) => void }} [opts]
   */
  constructor(scrollEl, monthsEl, opts = {}) {
    this.scrollEl = scrollEl;
    this.monthsEl = monthsEl;
    this.onError = opts.onError ?? console.error;
    this.onDayClick = opts.onDayClick ?? (() => {});
    this.onDayContext = opts.onDayContext ?? null; // tasto destro / pressione prolungata su un giorno
    this.unit = MONTH;          // vista: mesi o settimane (vedi useView)
    this.first = null;          // primo periodo renderizzato (mese {year, month} o lunedì ISO)
    this.last = null;           // ultimo periodo renderizzato
    this.current = null;        // periodo di oggi
    this.eventsByDate = new Map();
    this.extending = false;
    this.autoScrolling = false; // durante uno scorrimento animato non si aggiungono mesi
    this.selected = null;
    this.filter = null;         // filtro attivo sugli eventi (null = tutti)
    this.zoom = 1;              // altezza dei giorni rispetto al normale
    this.onZoomEnd = opts.onZoomEnd ?? (() => {}); // fine di un gesto di zoom (per salvare la preferenza)
    this.onZoom = opts.onZoom ?? (() => {});       // ogni cambio di zoom (per l'indicatore)
    this.layout = this.#layout();

    this.scrollEl.addEventListener("scroll", () => this.#onScroll(), { passive: true });
    this.monthsEl.addEventListener("click", (e) => this.#onClick(e));
    this.monthsEl.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".day.has-events")) {
        e.preventDefault();
        this.onDayClick(e.target.dataset.date, null);
      }
      // Tasto Menu o Maiusc+F10 su un giorno selezionato: stesso menu del tasto destro
      if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && e.target.matches(".day[data-date]")) {
        e.preventDefault();
        const r = e.target.getBoundingClientRect();
        this.#openContext(e.target, r.left + 12, r.top + 28);
      }
    });
    this.#setupContextMenu();
    this.#setupZoomGestures();
    addEventListener("resize", () => this.#relayout());
    // Nella vista settimanale gli interventi mostrano i tecnici: ridisegna quando cambiano i nomi
    people.onChange(() => { if (this.unit === WEEK && this.first) this.rerender(); });
  }

  // --- vista mese / settimana -------------------------------------------------------

  get view() {
    return this.unit.view;
  }

  /** Days shown: "all" (7) or "workweek" (Mon–Fri; weekends only where there are interventions). */
  setDays(mode) {
    this.days = mode === "workweek" ? "workweek" : "all";
    this.#keepAnchor(() => { this.scrollEl.dataset.days = this.days; });
  }

  /** Imposta la vista ("month" o "week") senza ridisegnare: da usare prima di init(). */
  useView(view) {
    this.unit = view === "week" ? WEEK : MONTH;
    this.scrollEl.dataset.view = this.unit.view;
    this.layout = this.#layout();
    this.scrollEl.dataset.zoomMode = this.layout.mode;
  }

  /** Cambia vista restando sullo stesso giorno (quello al centro della vista, o il selezionato). */
  async setView(view) {
    if ((view === "week" ? WEEK : MONTH) === this.unit) return;
    const anchor = this.#centerDate() ?? this.selected ?? todayIso();
    this.useView(view);
    await this.init(new Date(), anchor);
    await this.goToDate(anchor, { flash: false, behavior: "instant" });
  }

  /** Data del giorno al centro della parte visibile del calendario. */
  #centerDate() {
    const box = this.scrollEl.getBoundingClientRect();
    const mid = box.top + box.height / 2;
    let best = null;
    let dist = Infinity;
    for (const cell of this.monthsEl.querySelectorAll(".day[data-date]")) {
      const r = cell.getBoundingClientRect();
      if (r.bottom < box.top || r.top > box.bottom) continue;
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < dist) { dist = d; best = cell.dataset.date; }
    }
    return best;
  }

  /**
   * Nella vista settimanale l'altezza dei blocchi dipende dagli interventi: ridisegnando
   * un blocco sopra la vista il contenuto si sposterebbe. Qui si tiene fermo il primo giorno visibile.
   */
  #keepAnchor(fn) {
    if (this.unit !== WEEK) return fn();
    const top = this.scrollEl.getBoundingClientRect().top;
    const anchor = [...this.monthsEl.querySelectorAll(".day[data-date]")].find((c) => c.getBoundingClientRect().bottom > top);
    const before = anchor?.getBoundingClientRect().top;
    const result = fn();
    if (anchor && anchor.isConnected) this.scrollEl.scrollTop += anchor.getBoundingClientRect().top - before;
    return result;
  }

  // --- zoom ---------------------------------------------------------------------

  /** Altezza attuale di un giorno e conseguente modo di disegno degli interventi. */
  #layout() {
    if (this.unit === WEEK) return { h: 0, mode: "week", key: "week" }; // giorni alti quanto serve
    const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-h")) || 104;
    const h = base * this.zoom;
    const narrow = matchMedia("(max-width: 760px)").matches; // su telefono sono già barrette
    const mode = narrow || h < COMPACT_BELOW ? "compact" : h >= DETAILED_FROM ? "detailed" : "normal";
    return { h, mode, key: `${mode}:${Math.round(h)}` };
  }

  /**
   * Come disegnare `n` interventi in un giorno: il modo più ricco in cui stanno tutti,
   * altrimenti righe sottili più «+N». Niente testo tagliato.
   * @returns {{ fit: string, shown: number }}
   */
  #fit(n) {
    const { h, mode } = this.layout;
    if (mode === "week") return { fit: "week", shown: n }; // si vedono sempre tutti
    if (mode === "compact") {
      const avail = h - 30;
      const all = Math.floor((avail + BAR_GAP) / (BAR_H + BAR_GAP));
      return { fit: "bars", shown: n <= all ? n : Math.max(1, Math.floor((avail - 10) / (BAR_H + BAR_GAP))) };
    }
    const avail = h - DAY_FIXED;
    const fits = (kind) => n * (CHIP_H[kind] + CHIP_GAP) - CHIP_GAP <= avail;
    if (h >= DETAILED_FROM && fits("detailed")) return { fit: "detailed", shown: n };
    if (fits("normal")) return { fit: "normal", shown: n };
    if (fits("slim")) return { fit: "slim", shown: n };
    return { fit: "slim", shown: Math.max(1, Math.floor((avail - MORE_H) / (CHIP_H.slim + CHIP_GAP))) };
  }

  /** Ridisegna gli interventi quando cambia l'altezza dei giorni (zoom o dimensione della finestra). */
  #relayout() {
    const next = this.#layout();
    const changed = next.key !== this.layout.key;
    this.layout = next;
    this.scrollEl.dataset.zoomMode = next.mode;
    if (changed) this.setFilter(this.filter);
  }

  /**
   * Imposta lo zoom tenendo fermo il punto (clientX, clientY): il giorno lì sotto resta sotto il cursore.
   * Senza punto, si tiene fermo il centro della vista.
   */
  setZoom(z, { x = null, y = null } = {}) {
    z = clampZoom(z);
    if (z === this.zoom && this.scrollEl.style.getPropertyValue("--zoom")) return;
    const box = this.scrollEl.getBoundingClientRect();
    const px = x ?? box.left + box.width / 2;
    const py = y ?? box.top + box.height / 2;
    const cell = document.elementsFromPoint(px, py).find((n) => n.matches?.(".day"));
    let anchor = null;
    if (cell) {
      const r = cell.getBoundingClientRect();
      anchor = { cell, frac: (py - r.top) / r.height };
    }
    this.zoom = z;
    this.scrollEl.style.setProperty("--zoom", String(z));
    this.#relayout();
    if (anchor) {
      const r = anchor.cell.getBoundingClientRect();
      this.scrollEl.scrollTop += r.top + anchor.frac * r.height - py;
    }
    this.onZoom(z);
    this.#onScroll(); // rimpicciolendo può servire un mese in più
  }

  /**
   * Gesti di zoom sul calendario:
   * - tasto centrale premuto e mouse avanti/indietro (come in Blender): avanti ingrandisce;
   * - pizzico sul touchpad (arriva come rotellina con Ctrl, a scatti piccoli e frazionari).
   * Ctrl + rotellina di un mouse vero resta lo zoom della pagina del browser.
   */
  #setupZoomGestures() {
    let drag = null;
    this.scrollEl.addEventListener("mousedown", (e) => {
      if (e.button !== 1 || this.paused) return;
      e.preventDefault(); // niente scorrimento automatico del browser
      drag = { y: e.clientY, x: e.clientX, z: this.zoom };
      this.scrollEl.classList.add("zooming");
    });
    addEventListener("mousemove", (e) => {
      if (!drag) return;
      e.preventDefault();
      const z = drag.z * Math.exp((drag.y - e.clientY) / 180);
      if (!this.zoomFrame) {
        this.zoomFrame = requestAnimationFrame(() => {
          this.zoomFrame = null;
          if (drag) this.setZoom(z, { x: drag.x, y: drag.y });
        });
      }
    });
    addEventListener("mouseup", (e) => {
      if (!drag || e.button !== 1) return;
      drag = null;
      this.scrollEl.classList.remove("zooming");
      this.onZoomEnd(this.zoom);
    });
    // Il clic centrale non deve aprire nulla (né incollare, su Linux)
    this.scrollEl.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });

    let wheelTimer = null;
    this.scrollEl.addEventListener("wheel", (e) => {
      if (!e.ctrlKey || this.paused) return;
      const pinch = e.deltaMode === 0 && (!Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50);
      if (!pinch) return; // Ctrl + rotellina del mouse: zoom della pagina, come sempre
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY / 100), { x: e.clientX, y: e.clientY });
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => this.onZoomEnd(this.zoom), 400);
    }, { passive: false });
  }

  #openContext(cell, x, y, eventId = null) {
    if (!this.onDayContext) return;
    cell.classList.add("ctx-target");
    const ev = eventId ? (this.eventsByDate.get(cell.dataset.date) ?? []).find((e) => e.id === eventId) : null;
    this.onDayContext(cell.dataset.date, { x, y, hasEvents: cell.classList.contains("has-events"), event: ev ?? null,
      done: () => cell.classList.remove("ctx-target") });
  }

  /** Tasto destro su un giorno; sui touch, pressione prolungata (mezzo secondo). */
  #setupContextMenu() {
    this.monthsEl.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest(".day[data-date]");
      if (!cell || !this.onDayContext) return;
      e.preventDefault();
      const chip = e.target.closest(".chip[data-event-id]");
      this.#openContext(cell, e.clientX, e.clientY, chip ? Number(chip.dataset.eventId) : null);
    });
    let timer = null;
    let start = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    this.monthsEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      const cell = e.target.closest(".day[data-date]");
      if (!cell) return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        this.suppressClick = true; // il rilascio non deve aprire anche il dettaglio
        this.#openContext(cell, start.x, start.y);
      }, 550);
    });
    this.monthsEl.addEventListener("pointermove", (e) => {
      if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); // è uno scorrimento
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => this.monthsEl.addEventListener(t, cancel));
  }

  /**
   * Mostra i tre periodi (mesi o settimane) attorno a `around` (data ISO; predefinito: oggi)
   * e centra quello di oggi, o quello di `around`.
   */
  async init(today = new Date(), around = null) {
    const u = this.unit;
    this.current = u.ofIso(isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));
    const center = around ? u.ofIso(around) : this.current;
    this.first = u.add(center, -1);
    this.last = u.add(center, 1);
    this.eventsByDate.clear();
    this.monthsEl.replaceChildren();

    const loads = [];
    for (let p = this.first; u.cmp(p, this.last) <= 0; p = u.add(p, 1)) {
      const section = this.#buildPeriod(p);
      this.monthsEl.append(section);
      loads.push(this.#loadEvents(p, section));
    }
    this.scrollToPeriod(center, { behavior: "instant" });
    await Promise.all(loads);
    if (u === WEEK) this.scrollToPeriod(center, { behavior: "instant" }); // le settimane crescono con gli interventi
    this.#onScroll(); // su schermi molto alti può servire subito un periodo in più
  }

  /** Porta il periodo al centro della vista (o in alto, se è più alto della vista). */
  scrollToPeriod(p, { behavior = "smooth" } = {}) {
    const section = this.monthsEl.querySelector(`[data-period="${this.unit.key(p)}"]`);
    if (!section) return;
    const view = this.scrollEl.clientHeight;
    const offset = section.offsetTop - this.monthsEl.offsetTop;
    this.#scrollTo(offset - Math.max(0, (view - section.offsetHeight) / 2), behavior);
  }

  async scrollToToday() {
    await this.#ensurePeriod(this.current);
    this.scrollToPeriod(this.current);
  }

  /**
   * Scorre fino al giorno `iso` (caricando i mesi mancanti), lo centra e lo fa lampeggiare.
   * @returns {Promise<HTMLElement|null>} la cella del giorno
   */
  async goToDate(iso, { flash = true, behavior = "smooth" } = {}) {
    await this.#ensurePeriod(this.unit.ofIso(iso));
    const cell = this.cell(iso);
    if (!cell) return null;
    const box = this.scrollEl.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const top = this.scrollEl.scrollTop + rect.top - box.top - (box.height - rect.height) / 2;
    this.#scrollTo(top, behavior);
    if (flash) {
      cell.classList.remove("flash");
      void cell.offsetWidth; // riavvia l'animazione
      cell.classList.add("flash");
    }
    return cell;
  }

  /** Evidenzia stabilmente un giorno (null per togliere l'evidenziazione). */
  setSelected(iso) {
    this.monthsEl.querySelectorAll(".day.selected").forEach((c) => c.classList.remove("selected"));
    this.selected = iso;
    if (iso) this.cell(iso)?.classList.add("selected");
  }

  /** Ridisegna i mesi già caricati (es. dopo un cambio di colore dei clienti). */
  rerender() {
    this.setFilter(this.filter);
  }

  /** Ricarica dal server gli eventi di tutti i periodi a video (es. dopo un import). */
  async reload() {
    const sections = [...this.monthsEl.querySelectorAll(".month")];
    await Promise.all(sections.map((section) => this.#loadEvents(this.unit.parse(section.dataset.period), section)));
  }

  /** Reloads every period (month or week) containing one of the dates, once per period. */
  async refreshDates(isos) {
    const byPeriod = new Map(isos.map((iso) => [this.unit.key(this.unit.ofIso(iso)), iso]));
    await Promise.all([...byPeriod.values()].map((iso) => this.refreshDate(iso)));
  }

  /** While another view covers the calendar (technicians' workload): no loading on scroll, no zoom gestures. */
  setPaused(paused) {
    this.paused = paused;
    if (!paused) this.#onScroll();
  }

  /** Ricarica dal server gli eventi del periodo (mese o settimana) che contiene `iso`. */
  async refreshDate(iso) {
    const p = this.unit.ofIso(iso);
    const section = this.monthsEl.querySelector(`[data-period="${this.unit.key(p)}"]`);
    if (section) await this.#loadEvents(p, section);
  }

  cell(iso) {
    return this.monthsEl.querySelector(`.day[data-date="${iso}"]`);
  }

  // --- costruzione DOM ------------------------------------------------------

  #buildPeriod(p) {
    return this.unit === WEEK ? this.#buildWeek(p) : this.#buildMonth(p);
  }

  /** Una settimana: titolo con numero e date, poi 7 giorni in colonne alte quanto i loro interventi. */
  #buildWeek(monday) {
    const section = document.createElement("section");
    section.className = "month week";
    section.dataset.period = monday;
    if (monday === this.current) section.classList.add("is-current");

    const title = document.createElement("h2");
    title.className = "month-title";
    title.textContent = t("calendar.week_title", { n: isoWeek(monday), range: formatWeek(monday) });

    const grid = document.createElement("div");
    grid.className = "month-grid";
    const today = todayIso();
    for (let i = 0; i < 7; i++) {
      const iso = addDays(monday, i);
      const date = parseIso(iso);
      const cell = document.createElement("div");
      cell.className = "day";
      cell.dataset.date = iso;
      if (i >= 5) cell.classList.add("weekend");
      if (iso === today) {
        cell.classList.add("today");
        cell.setAttribute("aria-current", "date");
      }
      if (iso === this.selected) cell.classList.add("selected");
      const head = document.createElement("div");
      head.className = "day-head";
      const wd = Object.assign(document.createElement("span"), { className: "day-wd", textContent: fmtWeekdayShort.format(date) });
      const num = Object.assign(document.createElement("span"), { className: "day-num", textContent: date.getDate() });
      head.append(wd, num);
      // Il mese accanto al numero: il primo giorno della settimana e il primo del mese
      if (i === 0 || date.getDate() === 1) {
        head.append(Object.assign(document.createElement("span"), { className: "day-month", textContent: fmtMonthShort.format(date) }));
      }
      const chips = document.createElement("ul");
      chips.className = "chips";
      cell.append(head, chips);
      grid.append(cell);
    }
    section.append(title, grid);
    return section;
  }

  #buildMonth(ym) {
    const section = document.createElement("section");
    section.className = "month";
    section.dataset.period = ymKey(ym);
    if (ymKey(ym) === ymKey(this.current)) section.classList.add("is-current");

    const title = document.createElement("h2");
    title.className = "month-title";
    title.textContent = formatMonth(ym);

    const head = document.createElement("div");
    head.className = "weekdays";
    head.setAttribute("aria-hidden", "true");
    WEEKDAYS.forEach((name, i) => {
      const el = document.createElement("div");
      el.textContent = name;
      if (i >= 5) el.classList.add("is-weekend-col"); // hidden in the Mon–Fri view
      head.append(el);
    });

    const grid = document.createElement("div");
    grid.className = "month-grid";
    const pad = (col) => Object.assign(document.createElement("div"), { className: `day pad${col >= 5 ? " is-weekend-col" : ""}` });
    const lead = firstWeekdayMonday(ym);
    for (let i = 0; i < lead; i++) grid.append(pad(i));

    const today = todayIso();
    for (let d = 1; d <= daysInMonth(ym); d++) {
      const iso = isoDate(ym.year, ym.month, d);
      const cell = document.createElement("div");
      cell.className = "day";
      cell.dataset.date = iso;
      const col = (lead + d - 1) % 7;
      if (col >= 5) cell.classList.add("weekend");
      if (iso === today) {
        cell.classList.add("today");
        cell.setAttribute("aria-current", "date");
      }
      if (iso === this.selected) cell.classList.add("selected");
      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = d;
      const chips = document.createElement("ul");
      chips.className = "chips";
      cell.append(num, chips);
      grid.append(cell);
    }
    // Celle vuote fino a fine settimana, così la griglia resta rettangolare.
    const trail = (7 - ((lead + daysInMonth(ym)) % 7)) % 7;
    for (let i = 0; i < trail; i++) grid.append(pad((lead + daysInMonth(ym) + i) % 7));

    section.append(title, head, grid);
    return section;
  }

  async #loadEvents(p, section) {
    const unit = this.unit;
    const { start, end } = unit.range(p);
    let events;
    try {
      events = await fetchEvents(start, end);
    } catch (err) {
      section.classList.add("load-error");
      this.onError(new Error(unit.loadError(p, err.message)));
      return;
    }
    if (unit !== this.unit || !section.isConnected) return; // nel frattempo è cambiata la vista
    section.classList.remove("load-error");
    // Sostituisce gli eventi del mese (serve anche quando si ricarica dopo una modifica).
    for (const cell of section.querySelectorAll(".day[data-date]")) this.eventsByDate.delete(cell.dataset.date);
    for (const ev of events) {
      if (!this.eventsByDate.has(ev.event_date)) this.eventsByDate.set(ev.event_date, []);
      this.eventsByDate.get(ev.event_date).push(ev);
    }
    this.#keepAnchor(() => this.#renderMonth(section));
  }

  /** Disegna gli eventi di un mese già caricato, applicando il filtro attivo. */
  #renderMonth(section) {
    // Mon–Fri view: Saturday and Sunday come back only in the months/weeks that have interventions on them
    section.classList.toggle("has-weekend-events", [...section.querySelectorAll(".day.weekend[data-date]")]
      .some((c) => (this.eventsByDate.get(c.dataset.date) ?? []).length > 0));
    for (const cell of section.querySelectorAll(".day[data-date]")) {
      const all = this.eventsByDate.get(cell.dataset.date) ?? [];
      const shown = this.filter ? all.filter(this.filter) : all;
      if (shown.length) {
        this.#renderDay(cell, shown);
      } else if (cell.classList.contains("has-events")) {
        cell.classList.remove("has-events");
        delete cell.dataset.fit;
        cell.removeAttribute("tabindex");
        cell.removeAttribute("role");
        cell.removeAttribute("aria-label");
        cell.querySelector(".chips").replaceChildren();
      }
      cell.classList.toggle("filtered-out", shown.length < all.length);
    }
  }

  /**
   * Imposta il filtro (funzione evento → boolean, o null per nessun filtro) e ridisegna
   * tutti i mesi caricati; i mesi caricati in seguito lo applicano automaticamente.
   */
  setFilter(predicate) {
    this.filter = predicate;
    this.#keepAnchor(() => {
      for (const section of this.monthsEl.querySelectorAll(".month")) this.#renderMonth(section);
    });
  }

  #renderDay(cell, events) {
    cell.classList.add("has-events");
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    const ul = cell.querySelector(".chips");
    ul.replaceChildren();
    const { fit, shown: max } = this.#fit(events.length);
    cell.dataset.fit = fit;
    events.slice(0, max).forEach((ev) => ul.append(this.#chip(ev)));
    if (events.length > max) {
      const more = document.createElement("li");
      more.className = "chip more";
      more.textContent = t("calendar.more", { n: events.length - max });
      ul.append(more);
    }
    const label = events.map((e) => e.project_name).join(", ");
    cell.setAttribute("aria-label", t("calendar.day_aria", { date: cell.dataset.date, projects: label }));
  }

  #chip(ev) {
    const li = document.createElement("li");
    li.className = `chip status-${ev.status}`;
    li.style.setProperty("--c", colorFor(ev.project_id));
    li.dataset.eventId = ev.id;
    li.dataset.projectId = ev.project_id;
    const n = ev.server_count;
    // Avanzamento: righe eseguite (configurazione) o migrate (altri tipi) sul totale
    const done = ev.migrated; // rows with status "completata" (for every type of intervention)
    const progress = n ? `${done}/${n}` : t("calendar.no_servers_short");
    if (n) {
      li.style.setProperty("--p", `${Math.round((done / n) * 100)}%`);
      li.classList.add("has-progress");
      if (done === n) li.classList.add("all-done");
    }

    const name = document.createElement("span");
    name.className = "chip-name";
    name.textContent = ev.project_name;
    const conflictCount = (ev.conflict_users?.length ?? 0) + (ev.conflict_servers ?? 0);
    if (conflictCount) {
      li.classList.add("has-conflict");
      name.prepend(warnIcon());
    }
    const meta = document.createElement("span");
    meta.className = "chip-meta";
    // Seconda riga: avanzamento, cliente (se c'è), ora
    const prog = Object.assign(document.createElement("span"), { className: "chip-progress", textContent: progress });
    // (nella vista settimanale l'orario completo sta nella riga sotto, con il titolo)
    const metaRest = [ev.customer_name, this.unit === WEEK ? null : formatTime(ev.start_time)];
    meta.append(prog, metaRest.filter(Boolean).map((t) => ` · ${t}`).join(""));
    li.append(name, meta);
    // Terza riga, visibile solo con lo zoom grande: titolo e orario completo
    const extra = [ev.title, ev.start_time && `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`]
      .filter(Boolean).join(" · ");
    if (extra) li.append(Object.assign(document.createElement("span"), { className: "chip-extra", textContent: extra }));
    if (this.unit === WEEK) {
      // Vista settimanale: anche tipo di intervento e tecnici (partecipanti e assegnati alle righe)
      const names = (ev.user_ids ?? []).map((id) => people.byId(id)?.display_name).filter(Boolean);
      li.append(Object.assign(document.createElement("span"), {
        className: "chip-week", textContent: EVENT_TYPE[ev.event_type] ?? ev.event_type,
      }));
      if (names.length) {
        li.append(Object.assign(document.createElement("span"), { className: "chip-people", textContent: names.join(", ") }));
      }
    }

    li.title = [
      ev.customer_name,
      ev.project_name,
      ev.title,
      ev.start_time && t("calendar.chip_time", { time: `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}` }),
      n ? t("calendar.chip_done", { done, n }) : t("calendar.chip_no_servers"),
      EVENT_STATUS[ev.status] ?? ev.status,
      conflictCount && t("calendar.chip_conflicts", { n: conflictCount }),
    ].filter(Boolean).join(" · ");
    return li;
  }

  #onClick(e) {
    if (this.suppressClick) { this.suppressClick = false; return; }
    // Anche i giorni vuoti: si selezionano e aprono l'anteprima (vuota, con i pulsanti per creare)
    const cell = e.target.closest(".day[data-date]");
    if (!cell) return;
    const chip = e.target.closest(".chip[data-event-id]");
    this.onDayClick(cell.dataset.date, chip ? Number(chip.dataset.eventId) : null);
  }

  // --- scorrimento e caricamento progressivo ---------------------------------

  #scrollTo(top, behavior) {
    const target = Math.max(0, Math.min(top, this.scrollEl.scrollHeight - this.scrollEl.clientHeight));
    if (behavior !== "smooth" || Math.abs(target - this.scrollEl.scrollTop) < 2) {
      this.scrollEl.scrollTo({ top: target, behavior: "instant" });
      return;
    }
    // Finché l'animazione è in corso non si aggiungono mesi: cambierebbe scrollTop e la interromperebbe.
    this.autoScrolling = true;
    const done = () => {
      clearTimeout(timer);
      this.scrollEl.removeEventListener("scrollend", done);
      this.autoScrolling = false;
      this.#onScroll();
    };
    const timer = setTimeout(done, AUTO_SCROLL_MS);
    this.scrollEl.addEventListener("scrollend", done);
    this.scrollEl.scrollTo({ top: target, behavior: "smooth" });
  }

  #onScroll() {
    if (this.paused || this.extending || this.autoScrolling || !this.first) return;
    const { scrollTop, scrollHeight, clientHeight } = this.scrollEl;
    if (scrollTop < EDGE_PX) this.#extend(-1);
    else if (scrollHeight - scrollTop - clientHeight < EDGE_PX) this.#extend(1);
  }

  /** Aggiunge un periodo sopra, mantenendo ferma la vista. Restituisce il caricamento eventi. */
  #prependPeriod() {
    const p = this.unit.add(this.first, -1);
    const section = this.#buildPeriod(p);
    const before = this.scrollEl.scrollHeight;
    this.monthsEl.prepend(section);
    this.scrollEl.scrollTop += this.scrollEl.scrollHeight - before;
    this.first = p;
    return this.#loadEvents(p, section);
  }

  #appendPeriod() {
    const p = this.unit.add(this.last, 1);
    const section = this.#buildPeriod(p);
    this.monthsEl.append(section);
    this.last = p;
    return this.#loadEvents(p, section);
  }

  /** Aggiunge i periodi necessari perché `p` sia presente e ne attende gli eventi. */
  async #ensurePeriod(p) {
    const loads = [];
    while (this.unit.cmp(p, this.first) < 0) loads.push(this.#prependPeriod());
    while (this.unit.cmp(p, this.last) > 0) loads.push(this.#appendPeriod());
    await Promise.all(loads);
  }

  async #extend(direction) {
    this.extending = true;
    try {
      await (direction < 0 ? this.#prependPeriod() : this.#appendPeriod());
    } finally {
      this.extending = false;
    }
    this.#onScroll(); // se siamo ancora vicini al bordo, continua
  }
}
