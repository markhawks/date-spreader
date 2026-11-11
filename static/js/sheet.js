// Tabella server a tutto schermo, con le 11 colonne modificabili in linea.
//
// Ogni cella si salva da sola quando cambia (uscita dalla cella, Invio o scelta da menu).
// I salvataggi della stessa riga vanno in coda, così ognuno usa la `version` aggiornata.
// Se un altro utente ha salvato nel frattempo, il server risponde 409 con i valori attuali:
// la riga li mostra e la cella viene segnalata, senza sovrascrivere nulla.

import {
  addServerRow, deleteServerRow, fetchEvent, fetchOperatingSystems, fetchOptions, listServers, patchServerRow,
} from "./api.js";
import { colorFor } from "./colors.js";
import { eventStatusControl } from "./eventstatus.js";
import { promptNewOsVersions } from "./osdialog.js";
import { people } from "./people.js";
import { session } from "./session.js";
import { makeResizable } from "./resize.js";
import { formatLongDate, formatTime } from "./dates.js";
import {
  CHECK_STATUS, EVENT_TYPE, MIGRATION_STATUS, isConfigEvent, shortOs, toneOf,
} from "./labels.js";

/** Minuscolo e senza accenti, per il filtro delle righe. */
const normalize = (v) => String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const ADD_OS = "__add_os__";
const OS_FIELDS = new Set(["operating_system", "target_operating_system"]);

const SERVER_HINT = "Attributo del server: vale per tutti gli interventi in cui compare.";

/** Colonne: scope "server" = anagrafica condivisa, "row" = specifico di questo intervento. */
const COLUMNS = [
  { field: "hostname", label: "Hostname", kind: "text", scope: "server", mono: true, width: "12rem", required: true },
  { field: "ip_address", label: "IP", kind: "text", scope: "server", mono: true, width: "7.5rem" },
  { field: "operating_system", label: "SO", title: "Sistema operativo", kind: "select", scope: "server", width: "7rem", options: "os" },
  { field: "environment", label: "Ambiente", kind: "select", scope: "server", width: "5.5rem", options: "environments" },
  { field: "current_kernel", label: "Kernel attuale", kind: "text", scope: "server", mono: true, width: "12rem" },
  { field: "target_operating_system", label: "SO target", title: "Sistema operativo target (di destinazione) in questo intervento", kind: "select", scope: "row", width: "7rem", options: "os" },
  { field: "target_kernel", label: "Kernel target", kind: "text", scope: "row", mono: true, width: "12rem" },
  { field: "check_status", label: "Check", kind: "select", scope: "row", width: "6.5rem", options: "check" },
  { field: "migration_status", label: "Migrazione", kind: "select", scope: "row", width: "7.5rem", options: "migration" },
  { field: "executed_date", label: "Eseguito il", kind: "date", scope: "row", width: "8rem" },
  { field: "assigned_user_id", label: "Tecnico", kind: "select", scope: "row", width: "8rem", options: "users" },
  // Note: nessuna larghezza fissa, prende lo spazio che resta
  { field: "notes", label: "Note", kind: "text", scope: "row" },
];

// Interventi di «Configurazione»: solo queste colonne; le note vanno in una riga a tutta larghezza
// sotto ogni server (alta due righe, cresce con il testo). L'ultima colonna resta elastica.
const CONFIG_FIELDS = ["hostname", "ip_address", "operating_system", "environment", "executed_date", "assigned_user_id"];
const CONFIG_COLUMNS = CONFIG_FIELDS.map((f, i, all) => {
  const c = COLUMNS.find((x) => x.field === f);
  return i === all.length - 1 ? { ...c, width: undefined } : c;
});
const NOTES_COLUMN = COLUMNS.find((c) => c.field === "notes");

/** Altezza della nota: segue il testo, almeno due righe. */
function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

/** Valore del campo come stringa per il controllo HTML. */
function controlValue(row, field) {
  if (field === "assigned_user_id") return row.assigned_user ? String(row.assigned_user.id) : "";
  return row[field] ?? "";
}

/** Valore da inviare all'API: stringa vuota → null, tecnico → numero. */
function payloadValue(col, value) {
  if (value === "") return null;
  if (col.field === "assigned_user_id") return Number(value);
  return value;
}

const nowHm = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export class Sheet {
  /**
   * @param {HTMLElement} root contenitore vuoto (hidden) del foglio
   * @param {{ onClose?: (changed: boolean) => void, toast?: (msg: string) => void,
   *           embedded?: boolean, onChange?: () => void }} opts
   *   embedded: tabella dentro un altro contenitore (anteprima in basso), senza intestazione né Esc.
   *   onChange: chiamata dopo ogni modifica salvata (o ricevuta da altri utenti).
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.embedded = Boolean(opts.embedded);
    this.onChange = opts.onChange ?? (() => {});
    this.onShare = opts.onShare ?? null;
    this.onClose = opts.onClose ?? (() => {});
    this.toast = opts.toast ?? (() => {});
    this.rows = new Map();   // id riga → { data, tr, chain }
    this.event = null;
    this.changed = false;
    this.pending = 0;
    this.lookups = null;     // opzioni e tecnici, caricati una volta
    this.rowFilter = { text: "", check: "", migration: "" };
    this.pinned = new Set(); // righe appena aggiunte: visibili anche se non passano il filtro

    if (!this.embedded) {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen && !e.defaultPrevented && !document.querySelector("dialog[open]")) {
          e.preventDefault();
          this.close();
        }
      });
    }
  }

  get isOpen() {
    return this.embedded ? this.root.isConnected : !this.root.hidden;
  }

  get changed() { return this._changed; }
  set changed(value) {
    this._changed = value;
    if (value) this.onChange();
  }

  /** Modalità incorporata: mostra la tabella dell'intervento `event` (EventDetail già caricato). */
  async mount(event) {
    this.rows.clear();
    this.pinned.clear();
    this.event = event;
    this.lookups = await this.#loadLookups();
    this.#render();
  }

  /** Salva l'eventuale cella in modifica e attende i salvataggi in corso. */
  async flush() {
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    await Promise.all([...this.rows.values()].map((r) => r.chain));
  }

  async open(eventId) {
    this.returnFocus = document.activeElement;
    this.changed = false;
    this.rows.clear();
    this.pinned.clear();
    this.rowFilter = { text: "", check: "", migration: "" };
    this.root.hidden = false;
    document.body.classList.add("sheet-open");
    this.root.replaceChildren(el("p", "sheet-loading muted", "Caricamento…"));
    try {
      const [event, lookups] = await Promise.all([fetchEvent(eventId), this.#loadLookups()]);
      this.event = event;
      this.lookups = lookups;
      this.#render();
    } catch (err) {
      this.root.replaceChildren(this.#header(null), el("p", "error sheet-msg", `Impossibile aprire la tabella: ${err.message}`));
    }
  }

  /** Chiude dopo aver salvato l'eventuale cella in modifica. */
  async close() {
    if (!this.isOpen) return;
    document.activeElement?.blur?.(); // fa partire il "change" della cella in modifica
    await Promise.all([...this.rows.values()].map((r) => r.chain));
    this.root.hidden = true;
    this.root.replaceChildren();
    document.body.classList.remove("sheet-open");
    this.returnFocus?.focus?.();
    this.onClose(this.changed);
  }

  // --- struttura ---------------------------------------------------------------

  /** Valori dei menu. Le opzioni fisse si caricano una volta; tecnici e sistemi operativi a ogni apertura. */
  async #loadLookups() {
    this.options ??= await fetchOptions();
    const [osList] = await Promise.all([fetchOperatingSystems(), people.load()]);
    const options = this.options;
    const users = people.active();
    return {
      os: [["", "—"], ...osList.map((o) => [o.name, shortOs(o.name)])],
      environments: [["", "—"], ...options.environments.map((v) => [v, v])],
      check: options.check_statuses.map((v) => [v, CHECK_STATUS[v] ?? v]),
      migration: options.migration_statuses.map((v) => [v, MIGRATION_STATUS[v] ?? v]),
      users: [["", "— nessuno —"], ...users.map((u) => [String(u.id), u.display_name])],
    };
  }

  #render() {
    const ev = this.event;
    this.root.style.setProperty("--c", colorFor(ev.project.id));
    this.config = isConfigEvent(ev);
    this.columns = this.config ? CONFIG_COLUMNS : COLUMNS;

    const table = el("table", `edit-table${this.config ? " config-table" : ""}`);
    const colgroup = el("colgroup");
    for (const c of this.columns) {
      const col = el("col");
      if (c.width) col.style.width = c.width;
      colgroup.append(col);
    }
    colgroup.append(Object.assign(el("col"), { style: "width: 3rem" }));

    const thead = el("thead");
    const hr = el("tr");
    for (const c of this.columns) {
      const th = el("th", c.scope === "server" ? "scope-server" : null, c.label);
      th.dataset.col = c.field;
      th.title = [c.title, c.scope === "server" ? SERVER_HINT : null].filter(Boolean).join(". ");
      hr.append(th);
    }
    hr.append(el("th", "col-actions"));
    thead.append(hr);

    this.tbody = el("tbody");
    for (const row of ev.servers) this.#appendRow(row);

    table.append(colgroup, thead, this.tbody, this.#addRowFoot());
    const wrap = el("div", "sheet-table-wrap");
    wrap.append(table);

    const hint = el("p", "sheet-hint muted");
    hint.innerHTML =
      "Le modifiche si salvano da sole. <kbd>Invio</kbd> salva e passa alla riga sotto · " +
      "<kbd>Esc</kbd> annulla la modifica della cella · " +
      "<span class=\"scope-server-sample\">Colonne sottolineate</span>: dati del server, validi in tutti i suoi interventi.";

    hint.append(" Le colonne si allargano trascinando il bordo dell'intestazione.");
    if (this.config) hint.append(" Intervento di configurazione: sotto ogni server c'è lo spazio per le note (Invio va a capo; si salvano uscendo dal campo).");

    if (this.embedded) {
      wrap.classList.add("embedded");
      this.root.replaceChildren(this.#toolbar(), wrap);
    } else {
      this.root.replaceChildren(this.#header(ev), this.#toolbar(), wrap, hint);
    }
    if (this.suggestBox) this.root.append(this.suggestBox);
    wrap.addEventListener("scroll", () => this.hideSuggest?.(), { passive: true });
    this.resizer = makeResizable(table, { key: this.config ? "sheet-config" : "sheet" });
    for (const ta of this.tbody.querySelectorAll("textarea")) autoGrow(ta);
    this.#applyRowFilter();
    if (!this.embedded) this.tbody.querySelector("input, select")?.focus();
  }

  #header(ev) {
    const head = el("header", "sheet-header");
    const info = el("div", "sheet-info");
    if (ev) {
      const titleRow = el("div", "sheet-title-row");
      const h = el("h2", "sheet-title", ev.project.name);
      h.id = "sheet-title";
      this.statusControl = eventStatusControl(ev, {
        onSaved: () => {
          this.changed = true;
          this.#setStatus(`Stato salvato alle ${nowHm()}`);
        },
        onConflict: (_current, message) => {
          this.changed = true;
          this.toast(message);
        },
        onError: (message) => this.toast(`Stato non salvato: ${message}`),
      });
      titleRow.append(h, this.statusControl);
      const facts = [
        formatLongDate(ev.event_date),
        ev.start_time && `ore ${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`,
        ev.title,
        EVENT_TYPE[ev.event_type] ?? ev.event_type,
      ].filter(Boolean);
      info.append(titleRow, el("p", "sheet-facts muted", facts.join(" · ")));
    }
    this.statusEl = el("span", "sheet-status muted", "");
    this.statusEl.setAttribute("aria-live", "polite");
    this.countEl = el("span", "sheet-count", "");

    const close = el("button", "btn");
    close.type = "button";
    close.textContent = "Chiudi";
    close.title = "Chiudi la tabella (Esc)";
    close.addEventListener("click", () => this.close());

    const side = el("div", "sheet-side");
    side.append(this.countEl, this.statusEl);
    if (this.onShare && ev) {
      const share = el("button", "btn share-btn");
      share.type = "button";
      share.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.5 4.5h11v8h-11z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.8 4.8 8 9l5.2-4.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><span>Condividi</span>';
      share.title = "Condividi l'intervento via email (Gmail), con la tabella server";
      share.addEventListener("click", async () => {
        document.activeElement?.blur?.(); // salva prima la cella in modifica
        await Promise.all([...this.rows.values()].map((r) => r.chain));
        this.onShare(ev.id);
      });
      side.append(share);
    }
    side.append(close);
    head.append(info, side);
    return head;
  }

  #toolbar() {
    const bar = el("div", "sheet-toolbar");
    const text = el("input", "sheet-filter");
    text.type = "search";
    text.placeholder = this.config ? "Filtra righe: hostname, IP, note…" : "Filtra righe: hostname, IP, kernel, note…";
    text.setAttribute("aria-label", "Filtra le righe della tabella");
    text.addEventListener("input", () => { this.rowFilter.text = text.value; this.pinned.clear(); this.#applyRowFilter(); });

    const mk = (label, key, options) => {
      const sel = el("select", "filter-select");
      sel.setAttribute("aria-label", label);
      sel.append(new Option(`${label}: tutti`, ""));
      for (const [v, l] of options) sel.append(new Option(`${label}: ${l}`, v));
      sel.addEventListener("change", () => { this.rowFilter[key] = sel.value; this.pinned.clear(); this.#applyRowFilter(); });
      return sel;
    };
    this.visibleEl = el("span", "sheet-visible muted");
    const reset = el("button", "btn btn-small", "Larghezze predefinite");
    reset.type = "button";
    reset.title = "Riporta tutte le colonne alla larghezza iniziale";
    reset.addEventListener("click", () => this.resizer?.reset());
    bar.append(text);
    if (!this.config) bar.append(mk("Check", "check", this.lookups.check), mk("Migrazione", "migration", this.lookups.migration));
    bar.append(this.visibleEl);
    if (this.embedded) {
      // Nell'anteprima non c'è l'intestazione: conteggio e stato del salvataggio stanno qui.
      this.countEl = el("span", "sheet-count");
      this.statusEl = el("span", "sheet-status muted");
      this.statusEl.setAttribute("aria-live", "polite");
      bar.append(this.countEl, this.statusEl);
    }
    bar.append(reset);
    return bar;
  }

  #matches(data) {
    const f = this.rowFilter;
    if (f.check && data.check_status !== f.check) return false;
    if (f.migration && data.migration_status !== f.migration) return false;
    const q = normalize(f.text.trim());
    if (!q) return true;
    const haystack = [
      data.hostname, data.ip_address, data.operating_system, data.environment, data.current_kernel,
      data.target_kernel, data.notes, data.assigned_user?.display_name,
    ].map(normalize).join(" ");
    return haystack.includes(q);
  }

  #applyRowFilter() {
    let visible = 0;
    for (const state of this.rows.values()) {
      const show = this.pinned.has(state.data.id) || this.#matches(state.data);
      state.tr.hidden = !show;
      if (state.notesTr) state.notesTr.hidden = !show;
      if (show) visible++;
    }
    this.#updateCount();
    if (this.visibleEl) {
      const filtered = visible < this.rows.size;
      this.visibleEl.textContent = filtered ? `${visible} di ${this.rows.size} righe visibili` : "";
    }
  }

  /**
   * Allinea la tabella ai dati sul server (modifiche di altri utenti).
   * Non tocca le celle in modifica né le righe con un salvataggio in corso.
   * @returns {Promise<boolean>} true se qualcosa è cambiato
   */
  async syncFromServer() {
    if (!this.isOpen || !this.event || this.pending > 0) return false;
    let fresh;
    try {
      fresh = await fetchEvent(this.event.id);
    } catch {
      return false; // riproverà al prossimo giro
    }
    if (!this.isOpen || this.pending > 0 || fresh.id !== this.event.id) return false;
    if (isConfigEvent(fresh) !== this.config) {
      // Tipo cambiato (es. in «Configurazione»): le colonne sono diverse, si ridisegna tutto
      if (this.root.contains(document.activeElement)) return false; // non interrompere chi scrive
      this.event = fresh;
      this.rows.clear();
      this.#render();
      this.changed = true;
      return true;
    }
    let touched = false;
    const seen = new Set();
    for (const data of fresh.servers) {
      seen.add(data.id);
      const state = this.rows.get(data.id);
      if (!state) {
        this.#appendRow(data);
        this.#flash(this.rows.get(data.id).tr, "remote", 2500);
        touched = true;
      } else if (data.version !== state.data.version || data.server_version !== state.data.server_version) {
        state.data = data;
        this.#refreshRow(state, null);
        this.#flash(state.tr, "remote", 2500);
        touched = true;
      }
    }
    for (const state of [...this.rows.values()]) {
      if (!seen.has(state.data.id)) {
        this.#removeRow(state);
        touched = true;
      }
    }
    if (fresh.version !== this.event.version) {
      this.statusControl?.sync(fresh);
      touched = true;
    }
    if (touched) {
      this.changed = true;
      this.#applyRowFilter();
      this.#setStatus(`Aggiornato con modifiche di altri utenti (${nowHm()})`);
    }
    return touched;
  }

  /** Aggiunge in fondo la riga del server (e, per la configurazione, la sua riga di note). */
  #appendRow(data) {
    const tr = this.#rowEl(data);
    const { notesTr } = this.rows.get(data.id);
    this.tbody.append(...[tr, notesTr].filter(Boolean));
    if (notesTr) autoGrow(notesTr.querySelector("textarea"));
    return tr;
  }

  /** Riga a tutta larghezza con le note del server (interventi di configurazione). */
  #notesRowEl(state) {
    const tr = el("tr", "notes-row");
    tr.dataset.notesFor = state.data.id;
    const td = el("td", "notes-cell");
    td.colSpan = this.columns.length + 1;
    td.dataset.field = "notes";
    const ta = el("textarea", "cell-input notes-input");
    ta.rows = 2;
    ta.dataset.field = "notes";
    ta.placeholder = "Note di configurazione: passi, parametri, file modificati, verifiche…";
    ta.setAttribute("aria-label", `Note di configurazione di ${state.data.hostname}`);
    ta.spellcheck = true;
    ta.value = controlValue(state.data, "notes");
    ta.addEventListener("input", () => { td.classList.add("dirty"); autoGrow(ta); });
    ta.addEventListener("change", () => this.#commit(state, NOTES_COLUMN, ta));
    ta.addEventListener("keydown", (e) => this.#onKey(e, state, NOTES_COLUMN, ta));
    td.append(ta);
    tr.append(td);
    return tr;
  }

  #rowEl(data) {
    const tr = el("tr");
    tr.dataset.rowId = data.id;
    const state = { data, tr, chain: Promise.resolve() };
    this.rows.set(data.id, state);
    if (this.config) {
      tr.classList.add("has-notes");
      state.notesTr = this.#notesRowEl(state);
    }

    for (const col of this.columns) {
      const td = el("td", col.scope === "server" ? "scope-server" : null);
      td.dataset.field = col.field;
      const control = this.#control(col, state);
      td.append(control);
      tr.append(td);
    }

    const actions = el("td", "col-actions");
    const del = el("button", "row-delete");
    del.type = "button";
    del.title = "Togli questo server dall'intervento";
    del.setAttribute("aria-label", `Togli ${data.hostname} dall'intervento`);
    del.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M5 4l.6 9h4.8l.6-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    del.addEventListener("click", () => this.#onDelete(state, del));
    actions.append(del);
    tr.append(actions);
    this.#tone(tr, data);
    return tr;
  }

  #control(col, state) {
    let control;
    if (col.kind === "select") {
      control = el("select", "cell-input");
      for (const [value, label] of this.lookups[col.options]) {
        control.append(new Option(label, value));
      }
      // Valore attuale non (più) tra le scelte: resta visibile e si può lasciare com'è.
      // Tecnico disattivato, oppure sistema operativo fuori elenco o disattivato.
      const current = controlValue(state.data, col.field);
      if (current && ![...control.options].some((o) => o.value === current)) {
        const label = col.field === "assigned_user_id"
          ? `${state.data.assigned_user.display_name} (disattivato)`
          : `${shortOs(current)} (non in elenco)`;
        control.append(new Option(label, current));
      }
      if (col.options === "os") {
        control.title = current || col.title; // nome completo al passaggio del mouse
        if (session.me?.is_admin) control.append(new Option("+ Aggiungi versione…", ADD_OS));
      }
    } else {
      control = el("input", "cell-input");
      control.type = col.kind === "date" ? "date" : "text";
      control.autocomplete = "off";
      control.spellcheck = false;
    }
    if (col.mono) control.classList.add("mono");
    control.dataset.field = col.field;
    control.setAttribute("aria-label", col.label);
    control.value = controlValue(state.data, col.field);
    if (col.kind === "text") control.title = control.value;

    control.addEventListener("input", () => control.parentElement.classList.add("dirty"));
    control.addEventListener("change", () => this.#commit(state, col, control));
    control.addEventListener("keydown", (e) => this.#onKey(e, state, col, control));
    return control;
  }

  #addRowFoot() {
    const tfoot = el("tfoot");
    const tr = el("tr", "add-row");
    const td = el("td");
    td.colSpan = this.columns.length + 1;
    const form = el("form", "add-form");
    const input = el("input", "cell-input mono");
    input.type = "text";
    input.placeholder = "Hostname del server da aggiungere…";
    input.setAttribute("aria-label", "Hostname del server da aggiungere");
    input.autocomplete = "off";
    input.spellcheck = false;
    const btn = el("button", "btn", "+ Aggiungi server");
    btn.type = "submit";
    this.addMsg = el("span", "add-msg muted");
    form.append(input, btn, this.addMsg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.#onAdd(input, btn);
    });
    this.#attachSuggestions(input, form);
    td.append(form);
    tr.append(td);
    tfoot.append(tr);
    return tfoot;
  }

  /**
   * Suggerimenti dall'anagrafica mentre si scrive l'hostname: i server già inseriti
   * si riusano con i loro dati; quelli già nell'intervento non sono selezionabili.
   */
  #attachSuggestions(input, form) {
    const box = el("ul", "suggest");
    box.id = "add-suggest";
    box.setAttribute("role", "listbox");
    box.hidden = true;
    this.suggestBox = box; // inserito nel foglio da #render, dopo la costruzione
    this.hideSuggest = () => hide();
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-controls", box.id);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    let items = [];
    let active = -1;
    let timer;
    let token = 0;

    const hide = () => {
      box.hidden = true;
      input.setAttribute("aria-expanded", "false");
      active = -1;
    };
    const place = () => {
      const r = input.getBoundingClientRect();
      box.style.left = `${r.left}px`;
      box.style.width = `${Math.max(r.width, 340)}px`;
      const below = innerHeight - r.bottom;
      if (below < 260 && r.top > below) {
        box.style.top = "";
        box.style.bottom = `${innerHeight - r.top + 4}px`;
      } else {
        box.style.bottom = "";
        box.style.top = `${r.bottom + 4}px`;
      }
    };
    const highlight = (i) => {
      active = i;
      [...box.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
      box.children[i]?.scrollIntoView({ block: "nearest" });
    };
    const choose = (item) => {
      input.value = item.hostname;
      hide();
      form.requestSubmit();
    };
    const render = (servers, text) => {
      const present = new Set([...this.rows.values()].map((r) => r.data.hostname));
      items = servers.map((s) => ({ ...s, present: present.has(s.hostname) }));
      const lis = items.map((s, i) => {
        const li = el("li", s.present ? "disabled" : null);
        li.setAttribute("role", "option");
        li.id = `sugg-${i}`;
        li.append(el("span", "sg-host mono", s.hostname));
        const meta = [s.ip_address, s.operating_system, s.environment,
          s.present ? "già nell'intervento" : `${s.event_count} interventi`].filter(Boolean).join(" · ");
        li.append(el("span", "sg-meta", meta));
        if (s.present) li.setAttribute("aria-disabled", "true");
        li.addEventListener("mousedown", (e) => e.preventDefault()); // non togliere il focus all'input
        li.addEventListener("click", () => { if (!s.present) choose(s); });
        return li;
      });
      const exact = servers.some((s) => s.hostname === text.toLowerCase());
      if (!exact) {
        const li = el("li", "sg-new");
        li.textContent = `Nuovo server: «${text.toLowerCase()}» (Invio per crearlo)`;
        li.setAttribute("aria-disabled", "true");
        lis.push(li);
      }
      box.replaceChildren(...lis);
      place();
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      const text = input.value.trim();
      if (text.length < 2) return hide();
      timer = setTimeout(async () => {
        const t = ++token;
        try {
          const res = await listServers(text, 8);
          if (t === token && input.value.trim() === text) render(res.servers, text);
        } catch { hide(); }
      }, 150);
    });
    input.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      const selectable = items.map((s, i) => (s.present ? -1 : i)).filter((i) => i >= 0);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!selectable.length) return;
        const pos = selectable.indexOf(active);
        const next = e.key === "ArrowDown"
          ? selectable[(pos + 1) % selectable.length]
          : selectable[(pos - 1 + selectable.length) % selectable.length];
        highlight(next);
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        choose(items[active]);
      } else if (e.key === "Escape") {
        e.preventDefault(); // chiude i suggerimenti, non la tabella
        hide();
      }
    });
    input.addEventListener("blur", () => setTimeout(hide, 120));
  }

  // --- interazione -------------------------------------------------------------

  #onKey(e, state, col, control) {
    if (e.key === "Escape") {
      const td = control.parentElement;
      if (td.classList.contains("dirty") || td.classList.contains("error")) {
        e.preventDefault(); // non chiude il foglio: annulla solo la cella
        control.value = controlValue(state.data, col.field);
        td.classList.remove("dirty", "error");
        if (control.tagName === "TEXTAREA") autoGrow(control);
        else control.title = col.kind === "text" ? control.value : "";
      }
    } else if (e.key === "Enter" && control.tagName === "INPUT") {
      e.preventDefault();
      // Scende alla stessa colonna della riga sotto; l'uscita dalla cella fa partire il salvataggio.
      let below = state.tr.nextElementSibling;
      while (below?.classList.contains("notes-row")) below = below.nextElementSibling;
      const next = below?.querySelector(`.cell-input[data-field="${col.field}"]`);
      if (next) next.focus();
      else control.blur();
    }
  }

  #commit(state, col, control) {
    if (control.value === ADD_OS) {
      // "+ Aggiungi versione…": torna al valore attuale, apre la finestra, poi seleziona la versione creata
      control.value = controlValue(state.data, col.field);
      this.#addOsVersion(state, col, control);
      return;
    }
    const value = control.value;
    const td = control.parentElement;
    if (value === controlValue(state.data, col.field)) {
      td.classList.remove("dirty", "error");
      return;
    }
    if (col.required && !value.trim()) {
      this.#cellError(td, control, `${col.label}: campo obbligatorio.`);
      return;
    }
    state.chain = state.chain.then(() => this.#save(state, col, control, value));
  }

  /** Crea nuove versioni SO dal menu e aggiorna tutti i menu SO della tabella. */
  async #addOsVersion(state, col, control) {
    const created = await promptNewOsVersions();
    if (!created.length) return;
    this.lookups = await this.#loadLookups();
    for (const sel of this.root.querySelectorAll("select.cell-input")) {
      if (!OS_FIELDS.has(sel.dataset.field)) continue;
      const keep = sel.value;
      const extras = [...sel.options].filter((o) => o.value !== ADD_OS && !this.lookups.os.some(([v]) => v === o.value));
      sel.replaceChildren(...this.lookups.os.map(([v, l]) => new Option(l, v)), ...extras, new Option("+ Aggiungi versione…", ADD_OS));
      sel.value = keep;
    }
    this.toast(`Aggiunt${created.length === 1 ? "a" : "e"}: ${created.map((o) => shortOs(o.name)).join(", ")}.`);
    if (created.length === 1) {
      control.value = created[0].name;   // la versione appena creata va nella cella da cui si è partiti
      control.title = created[0].name;
      this.#commit(state, col, control);
    }
  }

  async #save(state, col, control, value) {
    const td = control.parentElement;
    // Il valore potrebbe essere stato annullato (Esc) mentre la richiesta era in coda.
    if (control.value !== value) return;
    const body = { version: state.data.version, [col.field]: payloadValue(col, value) };
    if (col.scope === "server") body.server_version = state.data.server_version;

    td.classList.remove("error", "conflict", "saved");
    td.classList.add("saving");
    this.#busy(+1);
    try {
      const updated = await patchServerRow(state.data.id, body);
      state.data = updated;
      this.changed = true;
      this.#refreshRow(state, td);
      this.#flash(td, "saved");
      this.#setStatus(`Salvato alle ${nowHm()}`);
      this.pinned.add(state.data.id); // non far sparire la riga che si sta modificando
      this.#applyRowFilter();
    } catch (err) {
      this.#handleRowError(state, td, control, err);
    } finally {
      td.classList.remove("saving");
      this.#busy(-1);
    }
  }

  #handleRowError(state, td, control, err) {
    if (err.isConflict && err.current) {
      state.data = err.current;
      this.changed = true; // altri hanno cambiato dati: al ritorno va aggiornata la vista
      this.#refreshRow(state, null, { force: true });
      this.#flash(td, "conflict", 4000);
      this.#setStatus(`${state.data.hostname}: modificato da un altro utente`, true);
      this.toast(`${err.message} La tua modifica non è stata salvata: ripetila se serve.`);
    } else if (err.status === 404) {
      this.#removeRow(state);
      this.changed = true;
      this.toast(err.message);
    } else {
      this.#cellError(td, control, err.message);
      this.#setStatus("Errore di salvataggio", true);
    }
  }

  async #onDelete(state, btn) {
    if (!btn.classList.contains("confirm")) {
      btn.classList.add("confirm");
      btn.textContent = "Togli?";
      btn.title = "Clic di nuovo per confermare";
      clearTimeout(btn._t);
      btn._t = setTimeout(() => this.#resetDeleteBtn(btn, state), 4000);
      return;
    }
    clearTimeout(btn._t);
    btn.disabled = true;
    state.chain = state.chain.then(async () => {
      this.#busy(+1);
      try {
        await deleteServerRow(state.data.id, state.data.version);
        this.#removeRow(state);
        this.changed = true;
        this.#setStatus(`Tolto ${state.data.hostname} alle ${nowHm()}`);
      } catch (err) {
        btn.disabled = false;
        this.#resetDeleteBtn(btn, state);
        this.#handleRowError(state, state.tr.firstElementChild, state.tr.querySelector(".cell-input"), err);
      } finally {
        this.#busy(-1);
      }
    });
  }

  #resetDeleteBtn(btn, state) {
    if (!btn.isConnected) return;
    btn.classList.remove("confirm");
    btn.title = "Togli questo server dall'intervento";
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M5 4l.6 9h4.8l.6-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.setAttribute("aria-label", `Togli ${state.data.hostname} dall'intervento`);
  }

  async #onAdd(input, btn) {
    const hostname = input.value.trim();
    if (!hostname) {
      input.focus();
      return;
    }
    btn.disabled = true;
    this.addMsg.className = "add-msg muted";
    this.addMsg.textContent = "Aggiunta in corso…";
    this.#busy(+1);
    try {
      const row = await addServerRow(this.event.id, { hostname });
      const tr = this.#appendRow(row);
      this.pinned.add(row.id);
      this.#applyRowFilter();
      this.#flash(tr, "added", 1600);
      this.changed = true;
      input.value = "";
      this.addMsg.textContent = row.server_reused
        ? `${row.hostname} esisteva già: collegato con i suoi dati.`
        : `${row.hostname} aggiunto: completa i dati nella riga.`;
      this.#updateCount();
      this.#setStatus(`Salvato alle ${nowHm()}`);
    } catch (err) {
      this.addMsg.className = "add-msg error-text";
      this.addMsg.textContent = err.message;
    } finally {
      btn.disabled = false;
      this.#busy(-1);
      input.focus();
    }
  }

  // --- aggiornamento vista -------------------------------------------------------

  /** Riporta nei controlli i valori salvati, senza toccare le celle che l'utente sta modificando. */
  #refreshRow(state, savedTd, { force = false } = {}) {
    const controls = [...state.tr.querySelectorAll(".cell-input"), ...(state.notesTr?.querySelectorAll(".cell-input") ?? [])];
    for (const control of controls) {
      const td = control.parentElement;
      const editing = !force && td !== savedTd && td.classList.contains("dirty");
      if (editing) continue;
      const value = controlValue(state.data, control.dataset.field);
      if (control.tagName === "SELECT" && value && ![...control.options].some((o) => o.value === value)) {
        const label = control.dataset.field === "assigned_user_id"
          ? `${state.data.assigned_user?.display_name ?? value} (disattivato)`
          : `${shortOs(value)} (non in elenco)`;
        control.append(new Option(label, value));
      }
      control.value = value;
      td.classList.remove("dirty", "error");
      if (control.tagName === "TEXTAREA") { autoGrow(control); continue; }
      if (control.type === "text" || OS_FIELDS.has(control.dataset.field)) control.title = value;
      else control.removeAttribute("title");
    }
    state.tr.querySelector(".row-delete")?.setAttribute("aria-label", `Togli ${state.data.hostname} dall'intervento`);
    this.#tone(state.tr, state.data);
  }

  /** Colore delle select di stato, come i badge. */
  #tone(tr, data) {
    for (const field of ["check_status", "migration_status"]) {
      const select = tr.querySelector(`select[data-field="${field}"]`);
      if (select) select.dataset.tone = toneOf(data[field]);
    }
  }

  #removeRow(state) {
    state.tr.remove();
    state.notesTr?.remove();
    this.rows.delete(state.data.id);
    this.#updateCount();
  }

  #cellError(td, control, message) {
    td.classList.add("error");
    control.title = message;
    this.toast(message);
  }

  #flash(node, cls, ms = 1200) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms);
  }

  #busy(delta) {
    this.pending += delta;
    if (this.pending > 0) this.#setStatus("Salvataggio…");
  }

  #setStatus(text, warn = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle("warn", warn);
  }

  #updateCount() {
    if (this.countEl) this.countEl.textContent = `${this.rows.size} server`;
  }
}
