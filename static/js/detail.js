// Pannello di dettaglio: interventi di un giorno (o un singolo intervento) con la tabella server.
// In sola lettura: la modifica in tabella arriva al punto 5.

import { markOutdated } from "./osbaseline.js";
import { markHeader, nextSort, saveSort, sortableHeader } from "./serversort.js";
import { fetchDay, fetchEvent, patchEvent, setParticipants } from "./api.js";
import { orderField } from "./projectdialog.js";
import { paint } from "./colors.js";
import { eventStatusControl } from "./eventstatus.js";
import { participantPicker } from "./people.js";
import { makeResizable } from "./resize.js";
import { Sheet } from "./sheet.js";
import { checkIcon, conflictBox, warnIcon } from "./conflicts.js";
import { formatLongDate, formatMediumDate, formatShortDate, formatTime } from "./dates.js";
import { t } from "./i18n.js";
import { CHECK_STATUS, EVENT_TYPE, MIGRATION_STATUS, badge, isConfigEvent, stageDone, stageLabel, markNote } from "./labels.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** "Red Hat Enterprise Linux 8.10" → "RHEL 8.10" (il nome completo resta nel tooltip). */
const shortOs = (os) => (os ?? "").replace(/^Red Hat Enterprise Linux/i, "RHEL");

/** Toglie il suffisso di architettura (".x86_64") per compattezza. */
const shortKernel = (k) => (k ?? "").replace(/\.(x86_64|aarch64|ppc64le|s390x)$/, "");

const stack = (main, sub) => {
  const wrap = el("div", "stack");
  wrap.append(main instanceof Node ? main : el("span", null, main));
  if (sub) wrap.append(sub instanceof Node ? sub : el("span", "sub", sub));
  return wrap;
};

// Visible column headers; the first element of each COLUMNS entry is the stable column key (saved widths).
const COLUMN_LABELS = {
  "Server": t("detail.col_server"),
  "Amb.": t("detail.col_env"),
  "SO · kernel": t("detail.col_os_kernel"),
  "Check": t("detail.col_check"),
  "Tecnico": t("detail.col_technician"),
  "Note": t("detail.col_notes"),
  "SO": t("detail.col_os"),
  "Eseguito il": t("detail.col_executed"),
};

// Vista compatta in sola lettura: le informazioni secondarie stanno sotto quelle principali.
const COLUMNS = [
  ["Server", (s) => stack(el("span", "mono strong", s.hostname), el("span", "mono sub", s.ip_address ?? ""))],
  ["Amb.", (s) => stack(
    s.environment ? el("span", `env env-${s.environment.toLowerCase()}`, s.environment) : null,
    s.location ? el("span", "sub location", s.location) : null,
    s.steamroller_inventory ? el("span", "sub inventory", s.steamroller_inventory) : null,
  )],
  ["SO · kernel", (s) => {
    const os = markOutdated(el("span", null, shortOs(s.operating_system) || "—"), s.operating_system);
    const wrap = stack(os, el("span", "mono sub", shortKernel(s.current_kernel) || "—"));
    const target = [shortOs(s.target_operating_system), shortKernel(s.target_kernel)].filter(Boolean).join(" · ");
    wrap.append(el("span", "mono sub target", `→ ${target || "—"}`));
    wrap.title = [
      t("detail.os_current", { value: s.operating_system ?? "-" }), t("detail.kernel_current", { value: s.current_kernel ?? "-" }),
      t("detail.os_target", { value: s.target_operating_system ?? "-" }), t("detail.kernel_target", { value: s.target_kernel ?? "-" }),
    ].join("\n");
    return wrap;
  }],
  ["Check", (s) => stack(
    badge(s.check_status, CHECK_STATUS),
    s.check_executed_date ? el("span", "sub", t("detail.check_done_on", { date: formatShortDate(s.check_executed_date) })) : null,
  )],
  ["Migrazione", (s) => stack(
    badge(s.migration_status, MIGRATION_STATUS),
    s.executed_date ? t("detail.executed_on", { date: formatShortDate(s.executed_date) }) : null,
  )],
  ["Tecnico", (s) => s.assigned_user?.display_name ?? el("span", "muted", "—")],
  ["Note", (s) => (s.notes ? markNote(el("span", "note-text", s.notes), s.notes) : "")],
];

// Interventi di «Configurazione»: niente kernel, check e migrazione; le note stanno in una riga sotto il server.
const CONFIG_COLUMNS = [
  COLUMNS[0],
  COLUMNS[1],
  ["SO", (s) => {
    const os = el("span", null, shortOs(s.operating_system) || "—");
    os.title = s.operating_system ?? "";
    return markOutdated(os, s.operating_system);
  }],
  ["Migrazione", (s) => badge(s.migration_status, MIGRATION_STATUS)],
  ["Eseguito il", (s) => (s.executed_date ? formatShortDate(s.executed_date) : el("span", "muted", "—"))],
  ["Tecnico", (s) => s.assigned_user?.display_name ?? el("span", "muted", "—")],
];

/** "Check: Tue 17 Nov · 15:00–17:00 · Luca, Sara · 2/4 OK" (null without a planned check). */
function checkLineOf(ev, { highlight = false } = {}) {
  if (!ev.check_date) return null;
  const n = ev.servers.length;
  const ok = ev.servers.filter((s) => s.check_status === "ok").length;
  const pending = ev.servers.filter((s) => ["da_fare", "in_corso", "ko"].includes(s.check_status)).length; // warning = done
  const time = ev.check_start_time
    ? (ev.check_end_time
      ? t("detail.time_range", { start: formatTime(ev.check_start_time), end: formatTime(ev.check_end_time) })
      : t("detail.time_from", { start: formatTime(ev.check_start_time) }))
    : null;
  const who = (ev.check_participants?.length ? ev.check_participants : ev.participants).map((p) => p.display_name).join(", ");
  const box = el("div", `event-check${ev.check_warning ? " warn" : ""}${highlight ? " highlight" : ""}`);
  if (highlight) box.append(el("strong", "event-check-title", t("detail.check_of_this")));
  box.append(checkIcon(), el("span", "chip-check-tag", t("detail.check_tag")), " ",
    [formatMediumDate(ev.check_date), time, who || null, n ? t("detail.check_progress", { ok, n }) : null].filter(Boolean).join(" · "));
  if (ev.check_warning) {
    box.prepend(warnIcon());
    box.append(" — ", el("strong", null, t("detail.check_missing", { n: pending })));
  }
  return box;
}

/** Columns of the compact table → sort field (the first value of a stacked column). */
const COMPACT_SORT = {
  Server: "hostname", "Amb.": "environment", "SO · kernel": "operating_system", SO: "operating_system",
  Check: "check_status", Migrazione: "migration_status", "Eseguito il": "executed_date", Tecnico: "assigned_user",
  Note: "notes",
};

export class DetailPanel {
  /**
   * @param {HTMLElement} root contenitore del pannello (con .detail-title, .detail-body, [data-close])
   * @param {{ onClose?: () => void, onPickEvent?: (projectEvent) => void,
   *           projectById?: (id:number) => object|undefined }} opts
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.titleEl = root.querySelector(".detail-title");
    this.subEl = root.querySelector(".detail-sub");
    this.bodyEl = root.querySelector(".detail-body");
    this.onClose = opts.onClose ?? (() => {});
    this.onPickEvent = opts.onPickEvent ?? (() => {});
    this.onPickCheckDay = opts.onPickCheckDay ?? null;
    this.projectById = opts.projectById ?? (() => undefined);
    this.onExpand = opts.onExpand ?? (() => {});
    this.onEventChanged = opts.onEventChanged ?? (() => {});
    this.onEditEvent = opts.onEditEvent ?? null;
    this.onEditProject = opts.onEditProject ?? null;
    this.onShare = opts.onShare ?? null;
    this.onDuplicate = opts.onDuplicate ?? null;
    this.onCustomerPick = opts.onCustomerPick ?? null; // click on the customer name: show only that customer
    this.customerFilter = null; // customer id: the day preview shows only its interventions
    this.onNewEvent = opts.onNewEvent ?? null;     // giorno vuoto: nuovo intervento in un progetto esistente
    this.onNewProject = opts.onNewProject ?? null; // giorno vuoto: nuovo progetto in quella data
    this.toast = opts.toast ?? (() => {});
    this.onRowsChanged = opts.onRowsChanged ?? (() => {});
    this.onResizeEnd = opts.onResizeEnd ?? (() => {});
    this.embedded = [];     // tabelle modificabili mostrate nell'anteprima in basso
    this.#setupResizer();
    this.last = null;      // ultima apertura, per reload()
    this.request = 0;      // per ignorare risposte arrivate fuori ordine
    this.returnFocus = null;

    root.querySelector("[data-close]").addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => {
      // Esc chiude l'anteprima solo se nessun altro l'ha già usato: una finestra aperta (dialog),
      // la tabella a tutto schermo o l'anagrafica (che chiamano preventDefault). Attenzione: tra un
      // gestore e l'altro il browser esegue i microtask, quindi la tabella può essere già chiusa qui.
      if (e.key === "Escape" && this.isOpen && !e.defaultPrevented && !document.querySelector(".chooser, dialog[open]")
          && !document.body.classList.contains("sheet-open")) {
        if (this.maximized) this.setMaximized(false); // first Esc: back to the normal size
        else this.close();
      }
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  get maximized() { return document.body.classList.contains("detail-max"); }

  /** Preview on the whole screen (over calendar and project column), or back to normal. */
  setMaximized(on) {
    document.body.classList.toggle("detail-max", Boolean(on));
    const label = on ? t("detail.max_off") : t("detail.max_on");
    for (const b of document.querySelectorAll("#btn-detail-max")) {
      b.setAttribute("aria-pressed", String(Boolean(on)));
      b.title = label;
      b.setAttribute("aria-label", label);
    }
  }

  /** Anteprima in basso (estesa e modificabile) invece che a destra. */
  get bottomMode() {
    return document.body.classList.contains("detail-bottom");
  }

  /**
   * Allinea l'anteprima alle modifiche di altri utenti sugli interventi `ids`.
   * Le tabelle modificabili si aggiornano riga per riga (senza toccare le celle in modifica);
   * il resto si ricarica.
   */
  async sync(ids) {
    const handled = new Set();
    for (const sheet of this.embedded) {
      if (sheet.isOpen && ids.includes(sheet.event?.id)) {
        await sheet.syncFromServer();
        // Cambiati i dati dell'intervento (tipo, titolo, ora, note…) e non solo le righe:
        // si ridisegna anche la scheda, se nessuno ci sta scrivendo dentro.
        const card = this.bodyEl.querySelector(`.event-card[data-event-id="${sheet.event.id}"]`);
        const stale = card && sheet.remoteVersion != null && String(sheet.remoteVersion) !== card.dataset.version;
        if (!stale || card.contains(document.activeElement)) handled.add(sheet.event.id);
      }
    }
    const shown = [...this.bodyEl.querySelectorAll(".event-card")].map((c) => Number(c.dataset.eventId));
    if (shown.some((id) => ids.includes(id) && !handled.has(id))) await this.reload();
  }

  /** Tutti gli interventi di un giorno; se `focusEventId`, porta in vista quello. */
  async openDay(iso, focusEventId = null) {
    this.last = () => this.openDay(iso, focusEventId);
    this.currentDay = true; // day view (the customer filter applies), not a single intervention
    this.currentDate = iso; // giorno mostrato: serve al pulsante «+ Intervento» della barra
    this.#show(formatLongDate(iso), "");
    const req = ++this.request;
    try {
      const all = await fetchDay(iso);
      if (req !== this.request) return;
      // Customer filter: only the interventions of the chosen customer (the others are counted)
      const events = this.customerFilter ? all.filter((ev) => ev.project.customer_id === this.customerFilter) : all;
      const hidden = all.length - events.length;
      this.subEl.textContent = !events.length ? t("detail.no_events") : t("detail.events_count", { n: events.length });
      this.bodyEl.replaceChildren(
        ...(events.length ? events.map((ev) => this.#eventCard(ev, false, { checkDay: ev.check_date === iso && ev.event_date !== iso })) : [this.#emptyDay(iso)]),
      );
      if (hidden) this.bodyEl.append(this.#hiddenNote(hidden));
      this.#afterRender();
      this.#focusEvent(focusEventId);
    } catch (err) {
      if (req === this.request) this.#error(err);
    }
  }

  /**
   * Commessa of the intervention, editable in place: the label (or "+ Commessa") opens a field with
   * the customer's commesse in a drop-down list; Enter or leaving the field saves, Esc cancels.
   */
  #orderControl(ev) {
    const box = el("span", "order-edit");
    const show = () => {
      const b = el("button", ev.order_code ? "event-order" : "event-order add", ev.order_code
        ? t("detail.order", { code: ev.order_code }) : t("detail.order_add"));
      b.type = "button";
      b.title = t("detail.order_edit_title");
      b.addEventListener("click", edit);
      box.replaceChildren(b);
    };
    const edit = () => {
      const field = orderField(ev.project.customer_id, ev.order_code ?? "");
      field.input.classList.add("order-input");
      field.input.setAttribute("aria-label", t("detail.order_label"));
      let done = false;
      const finish = async (save) => {
        if (done) return;
        done = true;
        const value = field.input.value.trim();
        field.dispose();
        if (!save || value === (ev.order_code ?? "")) { show(); return; }
        field.input.disabled = true;
        try {
          const updated = await patchEvent(ev.id, { version: ev.version, order_code: value });
          Object.assign(ev, { version: updated.version, order_code: updated.order_code });
          this.toast(updated.order_code ? t("detail.order_saved", { code: updated.order_code }) : t("detail.order_removed"));
          this.onEventChanged(updated);
        } catch (err) {
          this.toast(err.message);
          if (err.isConflict) this.reload();
        }
        show();
      };
      field.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      field.input.addEventListener("blur", () => finish(true));
      box.replaceChildren(field.input);
      field.input.focus();
      field.input.select();
    };
    show();
    return box;
  }

  /** Shows only the interventions of one customer in the day preview (null = all) and redraws it. */
  setCustomerFilter(customerId) {
    const next = customerId ? Number(customerId) : null;
    if (next === this.customerFilter) return;
    this.customerFilter = next;
    if (this.isOpen && this.currentDay) this.reload();
  }

  /** "N interventions of other customers hidden by the filter · Show all customers". */
  #hiddenNote(n) {
    const note = el("p", "hidden-note muted small");
    note.append(t("detail.hidden_by_customer", { n }), " ");
    if (this.onCustomerPick) {
      const b = el("button", "link-btn", t("detail.show_all_customers"));
      b.type = "button";
      b.addEventListener("click", () => this.onCustomerPick(""));
      note.append(b);
    }
    return note;
  }

  /** Un singolo intervento, con i collegamenti alle altre date dello stesso progetto. */
  async openEvent(eventId, { highlightRowId = null } = {}) {
    this.last = () => this.openEvent(eventId);
    this.currentDay = false;
    this.#show(t("detail.loading"), "");
    const req = ++this.request;
    try {
      const ev = await fetchEvent(eventId);
      if (req !== this.request) return;
      this.currentDate = ev.event_date;
      this.titleEl.textContent = formatLongDate(ev.event_date);
      this.subEl.textContent = ev.project.name;
      this.bodyEl.replaceChildren(this.#eventCard(ev, true));
      await this.#afterRender();
      if (req !== this.request) return;
      this.bodyEl.scrollTop = 0;
      if (highlightRowId) this.#highlightRow(highlightRowId);
    } catch (err) {
      if (req === this.request) this.#error(err);
    }
  }

  /** true se il pannello mostra almeno uno degli interventi indicati. */
  showsAnyEvent(ids) {
    if (!this.isOpen) return false;
    return [...this.bodyEl.querySelectorAll(".event-card")].some((c) => ids.includes(Number(c.dataset.eventId)));
  }

  /** Ricarica il contenuto attuale (es. dopo modifiche nella tabella a tutto schermo). */
  reload() {
    if (this.isOpen && this.last) {
      const scroll = this.bodyEl.scrollTop;
      return this.last().then(() => { this.bodyEl.scrollTop = scroll; });
    }
    return Promise.resolve();
  }

  close() {
    if (!this.isOpen) return;
    this.#releaseEmbedded();
    this.request++;
    this.root.hidden = true;
    this.setMaximized(false);
    document.body.classList.remove("detail-open");
    this.onClose();
    this.returnFocus?.focus?.();
    this.returnFocus = null;
  }

  // ---------------------------------------------------------------------------

  /** Prima di sostituire il contenuto: salva la cella in modifica (il salvataggio prosegue da sé). */
  #releaseEmbedded() {
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.embedded = [];
  }

  /** Bordo superiore trascinabile per l'altezza dell'anteprima in basso. */
  #setupResizer() {
    const handle = this.root.querySelector(".detail-resizer");
    if (!handle) return;
    const layout = this.root.parentElement;
    const pctFor = (clientY) => {
      const box = layout.getBoundingClientRect();
      return Math.round(Math.min(80, Math.max(20, ((box.bottom - clientY) / box.height) * 100)));
    };
    handle.addEventListener("pointerdown", (e) => {
      if (!this.bottomMode || e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add("row-resizing");
      let pct = null;
      const move = (ev) => {
        pct = pctFor(ev.clientY);
        document.documentElement.style.setProperty("--bottom-h", `${pct}%`);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        document.body.classList.remove("row-resizing");
        if (pct !== null) this.onResizeEnd(pct);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
    handle.addEventListener("keydown", (e) => {
      if (!this.bottomMode || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const now = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--bottom-h"), 10) || 45;
      const pct = Math.min(80, Math.max(20, now + (e.key === "ArrowUp" ? 5 : -5)));
      document.documentElement.style.setProperty("--bottom-h", `${pct}%`);
      this.onResizeEnd(pct);
    });
  }

  #show(title, sub) {
    this.#releaseEmbedded();
    if (!this.isOpen) this.returnFocus = document.activeElement;
    this.root.hidden = false;
    document.body.classList.add("detail-open");
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
    this.bodyEl.replaceChildren(el("p", "muted", t("detail.loading")));
    this.root.querySelector("[data-close]").focus({ preventScroll: true });
  }

  #error(err) {
    this.bodyEl.replaceChildren(el("p", "error", t("detail.load_error", { message: err.message })));
  }

  #focusEvent(eventId) {
    const card = eventId && this.bodyEl.querySelector(`[data-event-id="${eventId}"]`);
    if (card) {
      card.scrollIntoView({ block: "start" });
      card.classList.add("focused");
    } else {
      this.bodyEl.scrollTop = 0;
    }
  }

  /** Anteprima di un giorno senza interventi: messaggio e pulsanti per crearne uno. */
  #emptyDay(iso) {
    const box = el("div", "empty-day");
    box.append(el("p", "empty-day-title", t("detail.empty_day")));
    const actions = el("div", "empty-day-actions");
    if (this.onNewEvent) {
      const b = el("button", "btn btn-primary btn-small", t("detail.new_event_existing"));
      b.type = "button";
      b.addEventListener("click", () => this.onNewEvent(iso));
      actions.append(b);
    }
    if (this.onNewProject) {
      const b = el("button", "btn btn-small", t("detail.new_project_here"));
      b.type = "button";
      b.addEventListener("click", () => this.onNewProject(iso));
      actions.append(b);
    }
    if (actions.childElementCount) box.append(actions);
    box.append(el("p", "muted small", t("detail.empty_day_hint")));
    return box;
  }

  /** checkDay: the card is shown on the day of its pre-check (the check box goes at the top, highlighted). */
  #eventCard(ev, withSiblings, { checkDay = false } = {}) {
    const card = el("article", `event-card${checkDay ? " on-check-day" : ""}`);
    card.dataset.eventId = ev.id;
    card.dataset.version = ev.version;
    paint(card, ev.project.id);

    // Intestazione
    const head = el("header", "event-head");
    const titleRow = el("div", "event-title-row");
    const expand = el("button", "btn btn-small expand-btn");
    expand.type = "button";
    expand.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>';
    expand.querySelector("span").textContent = t("detail.fullscreen_edit");
    expand.title = t("detail.fullscreen_edit_title");
    expand.addEventListener("click", () => this.onExpand(ev.id));
    const status = eventStatusControl(ev, {
      onSaved: (updated) => this.onEventChanged(updated),
      onConflict: (current, message) => {
        this.toast(message);
        this.onEventChanged(current);
      },
      onError: (message) => this.toast(t("detail.status_not_saved", { message })),
    });
    const tools = el("div", "event-tools");
    if (this.onShare) {
      const b = el("button", "btn btn-small share-btn");
      b.type = "button";
      b.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.5 4.5h11v8h-11z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.8 4.8 8 9l5.2-4.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><span></span>';
      b.querySelector("span").textContent = t("detail.share");
      b.title = t("detail.share_title");
      b.addEventListener("click", () => this.onShare(ev.id));
      tools.append(b);
    }
    if (this.onDuplicate) {
      const b = el("button", "btn btn-small duplicate-btn");
      b.type = "button";
      b.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="5.2" y="5.2" width="8.6" height="8.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.8 5.2V3.6c0-.8-.6-1.4-1.4-1.4H3.6c-.8 0-1.4.6-1.4 1.4v5.8c0 .8.6 1.4 1.4 1.4h1.6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><span></span>';
      b.querySelector("span").textContent = t("detail.duplicate");
      b.title = t("detail.duplicate_title");
      b.addEventListener("click", () => this.onDuplicate(ev));
      tools.append(b);
    }
    if (this.onEditEvent) {
      const b = el("button", "btn btn-small", t("detail.edit"));
      b.type = "button";
      b.title = t("detail.edit_title");
      b.addEventListener("click", () => this.onEditEvent(ev));
      tools.append(b);
    }
    if (this.onEditProject) {
      const b = el("button", "btn btn-small", t("detail.project"));
      b.type = "button";
      b.title = t("detail.project_title");
      b.addEventListener("click", () => this.onEditProject(ev.project.id));
      tools.append(b);
    }
    // «Full screen · edit»: only with the compact preview on the right (read-only table); below the
    // calendar the table is already editable and ⛶ in the preview bar makes it bigger
    if (!this.bottomMode) tools.append(expand);
    const projTitle = el("h3", "event-project", ev.project.name);
    if (ev.project.customer_name) {
      const cust = el(ev.project.customer_id != null && this.onCustomerPick ? "button" : "span", "event-customer", ev.project.customer_name);
      if (cust.tagName === "BUTTON") {
        cust.type = "button";
        cust.title = t("detail.customer_pick", { name: ev.project.customer_name });
        cust.addEventListener("click", () => this.onCustomerPick(ev.project.customer_id));
      }
      // Customer and, next to it, the commessa of the intervention
      const line = el("span", "event-customer-line");
      line.append(cust, this.#orderControl(ev));
      projTitle.prepend(line);
    }
    titleRow.append(projTitle, status, tools);
    head.append(titleRow);

    const facts = [
      ev.title,
      EVENT_TYPE[ev.event_type] ?? ev.event_type,
      ev.start_time && (ev.end_time
      ? t("detail.time_range", { start: formatTime(ev.start_time), end: formatTime(ev.end_time) })
      : t("detail.time_from", { start: formatTime(ev.start_time) })),
    ].filter(Boolean);
    head.append(el("p", "event-facts", facts.join(" · ")));

    const people = el("div", "event-people");
    people.append(el("span", "muted", t("detail.participants")));
    people.append(participantPicker(ev.participants.map((p) => p.id), {
      onChange: async (ids) => {
        try {
          ev.participants = await setParticipants(ev.id, ids);
          this.onEventChanged(ev); // il filtro per tecnico del calendario dipende dai partecipanti
        } catch (err) {
          this.toast(t("detail.participants_not_saved", { message: err.message }));
          throw err; // il selettore torna allo stato precedente
        }
      },
    }));
    head.append(people);
    const check = this.#checkLine(ev, checkDay);
    if (check && checkDay) head.prepend(check);
    else if (check) head.append(check);
    if (ev.notes) head.append(el("p", "event-notes", ev.notes));

    if (withSiblings) {
      const project = this.projectById(ev.project.id);
      if (project && project.events.length > 1) head.append(this.#siblings(project, ev.id));
    }
    card.append(head);
    // Scheduling conflicts (same server on the same day, technician busy elsewhere at the same time)
    const conflicts = conflictBox(ev.conflicts, { onOpen: (o) => this.onPickEvent({ id: o.id, event_date: o.event_date }) });
    if (conflicts) card.append(conflicts);

    // Riepilogo e tabella server
    if (this.bottomMode) {
      // Anteprima in basso: tabella completa e modificabile (come a tutto schermo)
      const container = el("div", "embedded-sheet");
      const sheet = new Sheet(container, {
        embedded: true,
        toast: this.toast,
        onChange: () => this.onRowsChanged(ev),
      });
      sheet.pendingEvent = ev; // montata in #afterRender, quando è nel documento
      this.embedded.push(sheet);
      card.append(container);
    } else {
      card.append(this.#summary(ev));
      card.append(this.#table(ev));
    }
    return card;
  }

  #checkLine(ev, checkDay) {
    const box = checkLineOf(ev, { highlight: checkDay });
    if (!box) return null;
    if (checkDay) {
      // on the check day: which intervention it belongs to, with a link to it
      const go = el("button", "link-btn", t("detail.check_go_event", { date: formatMediumDate(ev.event_date) }));
      go.type = "button";
      go.addEventListener("click", () => this.onPickEvent({ id: ev.id, event_date: ev.event_date }));
      box.append(go);
    } else if (ev.check_date !== ev.event_date) {
      const go = el("button", "link-btn", t("detail.check_go_day"));
      go.type = "button";
      go.title = t("detail.check_go_day_title", { date: formatMediumDate(ev.check_date) });
      go.addEventListener("click", () => this.onPickCheckDay?.(ev.check_date, ev.id));
      box.append(go);
    }
    return box;
  }

  #siblings(project, currentId) {
    const nav = el("nav", "event-dates");
    nav.setAttribute("aria-label", t("detail.project_dates_label"));
    nav.append(el("span", "muted", t("detail.project_dates")));
    for (const pe of project.events) {
      const b = el("button", "date-pill", formatShortDate(pe.event_date));
      b.type = "button";
      b.title = pe.title ?? "";
      if (pe.id === currentId) {
        b.classList.add("current");
        b.setAttribute("aria-current", "true");
      } else {
        b.addEventListener("click", () => this.onPickEvent(pe));
      }
      nav.append(b);
    }
    return nav;
  }

  #summary(ev) {
    const servers = ev.servers;
    const n = servers.length;
    const count = (key, value) => servers.filter((s) => s[key] === value).length;
    const parts = [t("detail.servers_count", { n })];
    if (n && isConfigEvent(ev)) {
      parts.push(t("detail.summary_stage", { stage: stageDone(ev), done: count("migration_status", "completata"), n }));
    } else if (n) {
      parts.push(t("detail.summary_check_ok", { done: count("check_status", "ok"), n }));
      const warn = count("check_status", "warning");
      if (warn) parts.push(t("detail.summary_check_warning", { n: warn }));
      const ko = count("check_status", "ko");
      if (ko) parts.push(t("detail.summary_check_ko", { ko }));
      parts.push(t("detail.summary_stage", { stage: stageDone(ev), done: count("migration_status", "completata"), n }));
    }
    return el("p", "server-summary", parts.join(" · "));
  }

  /** Da chiamare dopo l'inserimento nel DOM: le colonne si possono misurare solo lì. */
  #afterRender() {
    for (const table of this.bodyEl.querySelectorAll(".server-table")) {
      makeResizable(table, { key: table.classList.contains("config-table") ? "compact-config" : "compact" });
    }
    const mounts = [];
    for (const sheet of this.embedded) {
      if (sheet.pendingEvent) {
        const ev = sheet.pendingEvent;
        sheet.pendingEvent = null;
        mounts.push(sheet.mount(ev).catch((err) => this.toast(t("detail.table_unavailable", { message: err.message }))));
      }
    }
    return Promise.all(mounts);
  }

  #highlightRow(rowId) {
    const tr = this.bodyEl.querySelector(`.server-table tr[data-row-id="${rowId}"], .edit-table tr[data-row-id="${rowId}"]`);
    if (!tr) return;
    tr.classList.add("hit-row");
    tr.scrollIntoView({ block: "center" });
    setTimeout(() => tr.classList.remove("hit-row"), 4000);
  }

  #table(ev) {
    const servers = ev.servers;
    if (!servers.length) return el("p", "muted", t("detail.no_servers"));
    const config = isConfigEvent(ev);
    const columns = config ? CONFIG_COLUMNS : COLUMNS;
    const wrap = el("div", "table-wrap");
    const table = el("table", `server-table${config ? " config-table" : ""}`);
    const thead = el("thead");
    const hr = el("tr");
    for (const [label] of columns) {
      // "Migrazione" è la chiave stabile della colonna (larghezze salvate); il testo segue il tipo
      const th = el("th", null, label === "Migrazione" ? stageLabel(ev) : COLUMN_LABELS[label]);
      th.dataset.col = label;
      if (label === "SO · kernel") th.title = t("detail.os_kernel_title");
      const field = COMPACT_SORT[label];
      if (field) {
        sortableHeader(th, field, async (f) => {
          try {
            await saveSort(ev, nextSort(ev.server_sort, f), () => fetchEvent(ev.id));
            await this.reload();
          } catch (err) { this.toast(err.message); }
        });
        markHeader(th, ev.server_sort, field);
      }
      hr.append(th);
    }
    thead.append(hr);
    const tbody = el("tbody");
    for (const s of servers) {
      const tr = el("tr");
      tr.dataset.rowId = s.id;
      for (const [, render] of columns) {
        const td = el("td");
        const v = render(s);
        if (v instanceof Node) td.append(v);
        else td.textContent = v;
        tr.append(td);
      }
      tbody.append(tr);
      if (config) {
        // Note di configurazione a tutta larghezza, con gli a capo
        tr.classList.add("has-notes");
        const nr = el("tr", "notes-row");
        nr.dataset.notesFor = s.id;
        const td = el("td", "notes-cell");
        td.colSpan = columns.length;
        td.append(s.notes ? markNote(el("div", "config-notes", s.notes), s.notes) : el("span", "muted", t("detail.no_notes")));
        nr.append(td);
        tbody.append(nr);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }
}
