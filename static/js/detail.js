// Pannello di dettaglio: interventi di un giorno (o un singolo intervento) con la tabella server.
// In sola lettura: la modifica in tabella arriva al punto 5.

import { fetchDay, fetchEvent, setParticipants } from "./api.js";
import { paint } from "./colors.js";
import { eventStatusControl } from "./eventstatus.js";
import { participantPicker } from "./people.js";
import { makeResizable } from "./resize.js";
import { Sheet } from "./sheet.js";
import { formatLongDate, formatShortDate, formatTime } from "./dates.js";
import {
  CHECK_STATUS, EVENT_TYPE, MIGRATION_STATUS, badge, isConfigEvent, stageDone, stageLabel,
} from "./labels.js";

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

// Vista compatta in sola lettura: le informazioni secondarie stanno sotto quelle principali.
const COLUMNS = [
  ["Server", (s) => stack(el("span", "mono strong", s.hostname), el("span", "mono sub", s.ip_address ?? ""))],
  ["Amb.", (s) => (s.environment ? el("span", `env env-${s.environment.toLowerCase()}`, s.environment) : "")],
  ["SO · kernel", (s) => {
    const os = el("span", null, shortOs(s.operating_system) || "—");
    const wrap = stack(os, el("span", "mono sub", shortKernel(s.current_kernel) || "—"));
    const target = [shortOs(s.target_operating_system), shortKernel(s.target_kernel)].filter(Boolean).join(" · ");
    wrap.append(el("span", "mono sub target", `→ ${target || "—"}`));
    wrap.title = [
      `SO attuale: ${s.operating_system ?? "-"}`, `Kernel attuale: ${s.current_kernel ?? "-"}`,
      `SO target: ${s.target_operating_system ?? "-"}`, `Kernel target: ${s.target_kernel ?? "-"}`,
    ].join("\n");
    return wrap;
  }],
  ["Check", (s) => badge(s.check_status, CHECK_STATUS)],
  ["Migrazione", (s) => stack(
    badge(s.migration_status, MIGRATION_STATUS),
    s.executed_date ? `eseguita ${formatShortDate(s.executed_date)}` : null,
  )],
  ["Tecnico", (s) => s.assigned_user?.display_name ?? el("span", "muted", "—")],
  ["Note", (s) => s.notes ?? ""],
];

// Interventi di «Configurazione»: niente kernel, check e migrazione; le note stanno in una riga sotto il server.
const CONFIG_COLUMNS = [
  COLUMNS[0],
  COLUMNS[1],
  ["SO", (s) => {
    const os = el("span", null, shortOs(s.operating_system) || "—");
    os.title = s.operating_system ?? "";
    return os;
  }],
  ["Eseguito il", (s) => (s.executed_date ? formatShortDate(s.executed_date) : el("span", "muted", "—"))],
  ["Tecnico", (s) => s.assigned_user?.display_name ?? el("span", "muted", "—")],
];

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
    this.projectById = opts.projectById ?? (() => undefined);
    this.onExpand = opts.onExpand ?? (() => {});
    this.onEventChanged = opts.onEventChanged ?? (() => {});
    this.onEditEvent = opts.onEditEvent ?? null;
    this.onEditProject = opts.onEditProject ?? null;
    this.onShare = opts.onShare ?? null;
    this.onDuplicate = opts.onDuplicate ?? null;
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
          && !document.body.classList.contains("sheet-open")) this.close();
    });
  }

  get isOpen() {
    return !this.root.hidden;
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
    this.currentDate = iso; // giorno mostrato: serve al pulsante «+ Intervento» della barra
    this.#show(formatLongDate(iso), "");
    const req = ++this.request;
    try {
      const events = await fetchDay(iso);
      if (req !== this.request) return;
      this.subEl.textContent = !events.length ? "Nessun intervento" : events.length === 1 ? "1 intervento" : `${events.length} interventi`;
      this.bodyEl.replaceChildren(
        ...(events.length ? events.map((ev) => this.#eventCard(ev, false)) : [this.#emptyDay(iso)]),
      );
      this.#afterRender();
      this.#focusEvent(focusEventId);
    } catch (err) {
      if (req === this.request) this.#error(err);
    }
  }

  /** Un singolo intervento, con i collegamenti alle altre date dello stesso progetto. */
  async openEvent(eventId, { highlightRowId = null } = {}) {
    this.last = () => this.openEvent(eventId);
    this.#show("Caricamento…", "");
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
    this.bodyEl.replaceChildren(el("p", "muted", "Caricamento…"));
    this.root.querySelector("[data-close]").focus({ preventScroll: true });
  }

  #error(err) {
    this.bodyEl.replaceChildren(el("p", "error", `Impossibile caricare il dettaglio: ${err.message}`));
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
    box.append(el("p", "empty-day-title", "Nessun intervento in questa data."));
    const actions = el("div", "empty-day-actions");
    if (this.onNewEvent) {
      const b = el("button", "btn btn-primary btn-small", "+ Intervento in un progetto esistente");
      b.type = "button";
      b.addEventListener("click", () => this.onNewEvent(iso));
      actions.append(b);
    }
    if (this.onNewProject) {
      const b = el("button", "btn btn-small", "Nuovo progetto in questa data");
      b.type = "button";
      b.addEventListener("click", () => this.onNewProject(iso));
      actions.append(b);
    }
    if (actions.childElementCount) box.append(actions);
    box.append(el("p", "muted small", "Puoi anche usare il tasto destro su un giorno del calendario."));
    return box;
  }

  #eventCard(ev, withSiblings) {
    const card = el("article", "event-card");
    card.dataset.eventId = ev.id;
    card.dataset.version = ev.version;
    paint(card, ev.project.id);

    // Intestazione
    const head = el("header", "event-head");
    const titleRow = el("div", "event-title-row");
    const expand = el("button", "btn btn-small expand-btn");
    expand.type = "button";
    expand.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Tutto schermo · modifica</span>';
    expand.title = "Apri la tabella completa (11 colonne) per modificarla";
    expand.addEventListener("click", () => this.onExpand(ev.id));
    const status = eventStatusControl(ev, {
      onSaved: (updated) => this.onEventChanged(updated),
      onConflict: (current, message) => {
        this.toast(message);
        this.onEventChanged(current);
      },
      onError: (message) => this.toast(`Stato non salvato: ${message}`),
    });
    const tools = el("div", "event-tools");
    if (this.onShare) {
      const b = el("button", "btn btn-small share-btn");
      b.type = "button";
      b.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.5 4.5h11v8h-11z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.8 4.8 8 9l5.2-4.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><span>Condividi</span>';
      b.title = "Condividi l'intervento via email (Gmail), con la tabella server";
      b.addEventListener("click", () => this.onShare(ev.id));
      tools.append(b);
    }
    if (this.onDuplicate) {
      const b = el("button", "btn btn-small duplicate-btn");
      b.type = "button";
      b.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="5.2" y="5.2" width="8.6" height="8.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.8 5.2V3.6c0-.8-.6-1.4-1.4-1.4H3.6c-.8 0-1.4.6-1.4 1.4v5.8c0 .8.6 1.4 1.4 1.4h1.6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><span>Duplica</span>';
      b.title = "Copia l'intervento in un'altra data (es. da rieseguire), con la tabella server";
      b.addEventListener("click", () => this.onDuplicate(ev));
      tools.append(b);
    }
    if (this.onEditEvent) {
      const b = el("button", "btn btn-small", "Modifica");
      b.type = "button";
      b.title = "Data, tipo, titolo, orari e note dell'intervento";
      b.addEventListener("click", () => this.onEditEvent(ev));
      tools.append(b);
    }
    if (this.onEditProject) {
      const b = el("button", "btn btn-small", "Progetto");
      b.type = "button";
      b.title = "Dati del progetto e suoi interventi (anche nuovi)";
      b.addEventListener("click", () => this.onEditProject(ev.project.id));
      tools.append(b);
    }
    tools.append(expand);
    const projTitle = el("h3", "event-project", ev.project.name);
    if (ev.project.customer_name) {
      projTitle.prepend(el("span", "event-customer", ev.project.customer_name));
    }
    titleRow.append(projTitle, status, tools);
    head.append(titleRow);

    const facts = [
      ev.title,
      EVENT_TYPE[ev.event_type] ?? ev.event_type,
      ev.start_time && `ore ${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`,
    ].filter(Boolean);
    head.append(el("p", "event-facts", facts.join(" · ")));

    const people = el("div", "event-people");
    people.append(el("span", "muted", "Partecipanti:"));
    people.append(participantPicker(ev.participants.map((p) => p.id), {
      onChange: async (ids) => {
        try {
          ev.participants = await setParticipants(ev.id, ids);
          this.onEventChanged(ev); // il filtro per tecnico del calendario dipende dai partecipanti
        } catch (err) {
          this.toast(`Partecipanti non salvati: ${err.message}`);
          throw err; // il selettore torna allo stato precedente
        }
      },
    }));
    head.append(people);
    if (ev.notes) head.append(el("p", "event-notes", ev.notes));

    if (withSiblings) {
      const project = this.projectById(ev.project.id);
      if (project && project.events.length > 1) head.append(this.#siblings(project, ev.id));
    }
    card.append(head);

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

  #siblings(project, currentId) {
    const nav = el("nav", "event-dates");
    nav.setAttribute("aria-label", "Altre date del progetto");
    nav.append(el("span", "muted", "Date del progetto:"));
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
    const parts = [`${n} server`];
    if (n && isConfigEvent(ev)) {
      parts.push(`eseguiti ${servers.filter((s) => s.executed_date).length}/${n}`);
    } else if (n) {
      parts.push(`check OK ${count("check_status", "ok")}/${n}`);
      const ko = count("check_status", "ko");
      if (ko) parts.push(`check KO ${ko}`);
      parts.push(`${stageDone(ev)} ${count("migration_status", "completata")}/${n}`);
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
        mounts.push(sheet.mount(ev).catch((err) => this.toast(`Tabella non disponibile: ${err.message}`)));
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
    if (!servers.length) return el("p", "muted", "Nessun server associato.");
    const config = isConfigEvent(ev);
    const columns = config ? CONFIG_COLUMNS : COLUMNS;
    const wrap = el("div", "table-wrap");
    const table = el("table", `server-table${config ? " config-table" : ""}`);
    const thead = el("thead");
    const hr = el("tr");
    for (const [label] of columns) {
      // "Migrazione" è la chiave stabile della colonna (larghezze salvate); il testo segue il tipo
      const th = el("th", null, label === "Migrazione" ? stageLabel(ev) : label);
      th.dataset.col = label;
      if (label === "SO · kernel") th.title = "Sistema operativo e kernel: attuali e, dopo la freccia, target";
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
        td.append(s.notes ? el("div", "config-notes", s.notes) : el("span", "muted", "Nessuna nota."));
        nr.append(td);
        tbody.append(nr);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }
}
