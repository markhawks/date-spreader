// Calendario verticale: un blocco per mese, impilati dall'alto verso il basso.
// All'avvio mostra mese precedente, corrente e successivo e centra il corrente;
// avvicinandosi al bordo superiore/inferiore aggiunge altri mesi.

import { fetchEvents } from "./api.js";
import { colorFor } from "./colors.js";
import {
  WEEKDAYS, addMonths, daysInMonth, firstWeekdayMonday, formatMonth, formatTime,
  isoDate, monthRange, todayIso, ymKey,
} from "./dates.js";
import { EVENT_STATUS, isConfigEvent } from "./labels.js";

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
    this.first = null;          // primo mese renderizzato {year, month}
    this.last = null;           // ultimo mese renderizzato
    this.current = null;        // mese di oggi
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
  }

  // --- zoom ---------------------------------------------------------------------

  /** Altezza attuale di un giorno e conseguente modo di disegno degli interventi. */
  #layout() {
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
      if (e.button !== 1) return;
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
      if (!e.ctrlKey) return;
      const pinch = e.deltaMode === 0 && (!Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50);
      if (!pinch) return; // Ctrl + rotellina del mouse: zoom della pagina, come sempre
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY / 100), { x: e.clientX, y: e.clientY });
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => this.onZoomEnd(this.zoom), 400);
    }, { passive: false });
  }

  #openContext(cell, x, y) {
    if (!this.onDayContext) return;
    cell.classList.add("ctx-target");
    this.onDayContext(cell.dataset.date, { x, y, hasEvents: cell.classList.contains("has-events"),
      done: () => cell.classList.remove("ctx-target") });
  }

  /** Tasto destro su un giorno; sui touch, pressione prolungata (mezzo secondo). */
  #setupContextMenu() {
    this.monthsEl.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest(".day[data-date]");
      if (!cell || !this.onDayContext) return;
      e.preventDefault();
      this.#openContext(cell, e.clientX, e.clientY);
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

  /** Mostra i tre mesi attorno a `today` e centra il mese corrente. */
  async init(today = new Date()) {
    this.current = { year: today.getFullYear(), month: today.getMonth() + 1 };
    this.first = addMonths(this.current, -1);
    this.last = addMonths(this.current, 1);
    this.monthsEl.replaceChildren();

    const loads = [];
    for (let ym = this.first; cmpYm(ym, this.last) <= 0; ym = addMonths(ym, 1)) {
      const section = this.#buildMonth(ym);
      this.monthsEl.append(section);
      loads.push(this.#loadMonthEvents(ym, section));
    }
    this.scrollToMonth(this.current, { behavior: "instant" });
    await Promise.all(loads);
    this.#onScroll(); // su schermi molto alti può servire subito un mese in più
  }

  /** Porta il mese al centro della vista (o in alto, se è più alto della vista). */
  scrollToMonth(ym, { behavior = "smooth" } = {}) {
    const section = this.monthsEl.querySelector(`[data-month="${ymKey(ym)}"]`);
    if (!section) return;
    const view = this.scrollEl.clientHeight;
    const offset = section.offsetTop - this.monthsEl.offsetTop;
    this.#scrollTo(offset - Math.max(0, (view - section.offsetHeight) / 2), behavior);
  }

  scrollToToday() {
    this.scrollToMonth(this.current);
  }

  /**
   * Scorre fino al giorno `iso` (caricando i mesi mancanti), lo centra e lo fa lampeggiare.
   * @returns {Promise<HTMLElement|null>} la cella del giorno
   */
  async goToDate(iso, { flash = true, behavior = "smooth" } = {}) {
    await this.#ensureMonth(ymFromIso(iso));
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

  /** Ricarica dal server gli eventi di tutti i mesi a video (es. dopo un import). */
  async reload() {
    const sections = [...this.monthsEl.querySelectorAll(".month")];
    await Promise.all(sections.map((section) => {
      const [year, month] = section.dataset.month.split("-").map(Number);
      return this.#loadMonthEvents({ year, month }, section);
    }));
  }

  /** Ricarica dal server gli eventi del mese che contiene `iso`. */
  async refreshDate(iso) {
    const ym = ymFromIso(iso);
    const section = this.monthsEl.querySelector(`[data-month="${ymKey(ym)}"]`);
    if (section) await this.#loadMonthEvents(ym, section);
  }

  cell(iso) {
    return this.monthsEl.querySelector(`.day[data-date="${iso}"]`);
  }

  // --- costruzione DOM ------------------------------------------------------

  #buildMonth(ym) {
    const section = document.createElement("section");
    section.className = "month";
    section.dataset.month = ymKey(ym);
    if (ymKey(ym) === ymKey(this.current)) section.classList.add("is-current");

    const title = document.createElement("h2");
    title.className = "month-title";
    title.textContent = formatMonth(ym);

    const head = document.createElement("div");
    head.className = "weekdays";
    head.setAttribute("aria-hidden", "true");
    for (const name of WEEKDAYS) {
      const el = document.createElement("div");
      el.textContent = name;
      head.append(el);
    }

    const grid = document.createElement("div");
    grid.className = "month-grid";
    const pad = () => Object.assign(document.createElement("div"), { className: "day pad" });
    const lead = firstWeekdayMonday(ym);
    for (let i = 0; i < lead; i++) grid.append(pad());

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
    for (let i = 0; i < trail; i++) grid.append(pad());

    section.append(title, head, grid);
    return section;
  }

  async #loadMonthEvents(ym, section) {
    const { start, end } = monthRange(ym);
    let events;
    try {
      events = await fetchEvents(start, end);
    } catch (err) {
      section.classList.add("load-error");
      this.onError(new Error(`Impossibile caricare ${formatMonth(ym)}: ${err.message}`));
      return;
    }
    section.classList.remove("load-error");
    // Sostituisce gli eventi del mese (serve anche quando si ricarica dopo una modifica).
    for (const cell of section.querySelectorAll(".day[data-date]")) this.eventsByDate.delete(cell.dataset.date);
    for (const ev of events) {
      if (!this.eventsByDate.has(ev.event_date)) this.eventsByDate.set(ev.event_date, []);
      this.eventsByDate.get(ev.event_date).push(ev);
    }
    this.#renderMonth(section);
  }

  /** Disegna gli eventi di un mese già caricato, applicando il filtro attivo. */
  #renderMonth(section) {
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
    for (const section of this.monthsEl.querySelectorAll(".month")) this.#renderMonth(section);
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
      more.textContent = `+${events.length - max}`;
      ul.append(more);
    }
    const label = events.map((e) => e.project_name).join(", ");
    cell.setAttribute("aria-label", `${cell.dataset.date}: ${label}. Apri dettaglio`);
  }

  #chip(ev) {
    const li = document.createElement("li");
    li.className = `chip status-${ev.status}`;
    li.style.setProperty("--c", colorFor(ev.project_id));
    li.dataset.eventId = ev.id;
    li.dataset.projectId = ev.project_id;
    const n = ev.server_count;
    // Avanzamento: righe eseguite (configurazione) o migrate (altri tipi) sul totale
    const done = isConfigEvent(ev) ? ev.executed : ev.migrated;
    const progress = n ? `${done}/${n}` : "0 srv";
    if (n) {
      li.style.setProperty("--p", `${Math.round((done / n) * 100)}%`);
      li.classList.add("has-progress");
      if (done === n) li.classList.add("all-done");
    }

    const name = document.createElement("span");
    name.className = "chip-name";
    name.textContent = ev.project_name;
    const meta = document.createElement("span");
    meta.className = "chip-meta";
    // Seconda riga: avanzamento, cliente (se c'è), ora
    const prog = Object.assign(document.createElement("span"), { className: "chip-progress", textContent: progress });
    meta.append(prog, [ev.customer_name, formatTime(ev.start_time)].filter(Boolean).map((t) => ` · ${t}`).join(""));
    li.append(name, meta);
    // Terza riga, visibile solo con lo zoom grande: titolo e orario completo
    const extra = [ev.title, ev.start_time && `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`]
      .filter(Boolean).join(" · ");
    if (extra) li.append(Object.assign(document.createElement("span"), { className: "chip-extra", textContent: extra }));

    li.title = [
      ev.customer_name,
      ev.project_name,
      ev.title,
      ev.start_time && `ore ${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`,
      n ? `completati ${done}/${n} server` : "nessun server",
      EVENT_STATUS[ev.status] ?? ev.status,
    ].filter(Boolean).join(" · ");
    return li;
  }

  #onClick(e) {
    if (this.suppressClick) { this.suppressClick = false; return; }
    const cell = e.target.closest(".day.has-events");
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
    if (this.extending || this.autoScrolling || !this.first) return;
    const { scrollTop, scrollHeight, clientHeight } = this.scrollEl;
    if (scrollTop < EDGE_PX) this.#extend(-1);
    else if (scrollHeight - scrollTop - clientHeight < EDGE_PX) this.#extend(1);
  }

  /** Aggiunge un mese sopra, mantenendo ferma la vista. Restituisce il caricamento eventi. */
  #prependMonth() {
    const ym = addMonths(this.first, -1);
    const section = this.#buildMonth(ym);
    const before = this.scrollEl.scrollHeight;
    this.monthsEl.prepend(section);
    this.scrollEl.scrollTop += this.scrollEl.scrollHeight - before;
    this.first = ym;
    return this.#loadMonthEvents(ym, section);
  }

  #appendMonth() {
    const ym = addMonths(this.last, 1);
    const section = this.#buildMonth(ym);
    this.monthsEl.append(section);
    this.last = ym;
    return this.#loadMonthEvents(ym, section);
  }

  /** Aggiunge i mesi necessari perché `ym` sia presente e ne attende gli eventi. */
  async #ensureMonth(ym) {
    const loads = [];
    while (cmpYm(ym, this.first) < 0) loads.push(this.#prependMonth());
    while (cmpYm(ym, this.last) > 0) loads.push(this.#appendMonth());
    await Promise.all(loads);
  }

  async #extend(direction) {
    this.extending = true;
    try {
      await (direction < 0 ? this.#prependMonth() : this.#appendMonth());
    } finally {
      this.extending = false;
    }
    this.#onScroll(); // se siamo ancora vicini al bordo, continua
  }
}
