// Anagrafica server: tutti i server nel database, ricerca e storico degli interventi.

import { deleteServer, fetchOperatingSystems, fetchOptions, fetchServer, listServers, patchServer } from "./api.js";
import { confirmDanger } from "./confirm.js";
import { customers } from "./customers.js";
import { prefs } from "./prefs.js";
import { loadBaselines, markOutdated } from "./osbaseline.js";
import { homeButton } from "./homebutton.js";
import { colorFor } from "./colors.js";
import { locale, t } from "./i18n.js";
import { formatMediumDate, formatShortDate, todayIso } from "./dates.js";
import { CHECK_STATUS, EVENT_STATUS, MIGRATION_STATUS, badge } from "./labels.js";
import { makeResizable } from "./resize.js";

const SEARCH_DELAY_MS = 200;

const FIELD_LABEL = {
  hostname: t("inventory.field.hostname"), ip_address: t("inventory.field.ip_address"), operating_system: t("inventory.field.operating_system"),
  environment: t("inventory.field.environment"), location: t("inventory.field.location"), current_kernel: t("inventory.field.current_kernel"), notes: t("inventory.field.notes"),
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const shortOs = (os) => (os ?? "").replace(/^Red Hat Enterprise Linux/i, "RHEL");
const shortKernel = (k) => (k ?? "").replace(/\.(x86_64|aarch64|ppc64le|s390x)$/, "");
const withTitle = (node, title) => { node.title = title ?? ""; return node; };

const COLUMNS = [
  ["hostname", t("inventory.col.hostname"), (s) => el("span", "mono strong", s.hostname)],
  ["ip", t("inventory.col.ip"), (s) => el("span", "mono", s.ip_address ?? "")],
  ["os", t("inventory.col.os"), (s) => markOutdated(withTitle(el("span", null, shortOs(s.operating_system)), s.operating_system), s.operating_system)],
  ["env", t("inventory.col.env"), (s) => (s.environment ? el("span", `env env-${s.environment.toLowerCase()}`, s.environment) : "")],
  ["location", t("inventory.col.location"), (s) => el("span", "small", s.location ?? "")],
  ["kernel", t("inventory.col.kernel"), (s) => withTitle(el("span", "mono small", shortKernel(s.current_kernel)), s.current_kernel)],
  ["count", t("inventory.col.count"), (s) => el("span", s.event_count ? "num" : "num muted", String(s.event_count))],
  ["last", t("inventory.col.last"), (s) => (s.last_event_date
    ? stackInline(formatShortDate(s.last_event_date), s.last_migration_status && badge(s.last_migration_status, MIGRATION_STATUS))
    : el("span", "muted", "—"))],
  ["next", t("inventory.col.next"), (s) => (s.next_event_date ? el("span", "next-date", formatShortDate(s.next_event_date)) : el("span", "muted", "—"))],
];

// Sorting by clicking a column header (hostname, IP, OS, environment, location, kernel and the counters).
// Empty values always go last; texts with numbers in a natural order (RHEL 9.8 before RHEL 10.2).
const SORT_KEY = "datespreader.inventory.sort";
const ipKey = (ip) => {
  if (!ip) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split(".").map((n) => n.padStart(3, "0")).join(".");
  return `~${ip}`; // IPv6 after IPv4
};
const SORT_VALUE = {
  hostname: (s) => s.hostname,
  ip: (s) => ipKey(s.ip_address),
  os: (s) => s.operating_system,
  env: (s) => s.environment,
  location: (s) => s.location,
  kernel: (s) => s.current_kernel,
  count: (s) => s.event_count,
  last: (s) => s.last_event_date,
  next: (s) => s.next_event_date,
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortServers(servers, { col, dir }) {
  const value = SORT_VALUE[col] ?? SORT_VALUE.hostname;
  const sign = dir === "desc" ? -1 : 1;
  return [...servers].sort((a, b) => {
    const va = value(a), vb = value(b);
    const ea = va == null || va === "", eb = vb == null || vb === "";
    if (ea || eb) return ea === eb ? collator.compare(a.hostname, b.hostname) : ea ? 1 : -1;
    const c = typeof va === "number" ? va - vb : collator.compare(String(va), String(vb));
    return c ? sign * c : collator.compare(a.hostname, b.hostname);
  });
}

// Customer menu: "" = all, "group" = divided by customer, "0" = of no customer, otherwise a customer id
const CUSTOMER_KEY = "datespreader.inventory.customer";
const GROUP = "group";
function loadCustomerView() {
  try { return localStorage.getItem(CUSTOMER_KEY) ?? ""; } catch { return ""; }
}

/** Count of the operating systems of the servers: [[name, n]], most used first ("" = not set). */
function osCounts(servers) {
  const counts = new Map();
  for (const s of servers) counts.set(s.operating_system ?? "", (counts.get(s.operating_system ?? "") ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] === "" ? 1 : b[0] === "" ? -1 : collator.compare(a[0], b[0])));
}

function loadSort() {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY));
    if (v && SORT_VALUE[v.col] && (v.dir === "asc" || v.dir === "desc")) return v;
  } catch { /* not available */ }
  return { col: "hostname", dir: "asc" };
}

function stackInline(text, node) {
  const wrap = el("span", "inline-pair");
  wrap.append(el("span", null, text));
  if (node) wrap.append(node);
  return wrap;
}

export class Inventory {
  /**
   * @param {HTMLElement} root contenitore vuoto (hidden)
   * @param {{ onOpenEvent: (item) => void }} opts  item: voce dello storico (event_id, event_date, row_id…)
   */
  constructor(root, { onOpenEvent }) {
    this.root = root;
    this.onOpenEvent = onOpenEvent;
    this.selectedId = null;
    this.query = "";
    this.token = 0;
    this.sort = loadSort();
    this.customerView = loadCustomerView();
    this.servers = [];
    prefs.onChange((p, changes) => { if ("inventory_os_stats" in changes && this.isOpen) this.#showStats(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen && !e.defaultPrevented && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen() { return !this.root.hidden; }

  async open() {
    this.returnFocus = document.activeElement;
    this.root.hidden = false;
    document.body.classList.add("sheet-open");
    this.#build();
    await loadBaselines(true); // up-to-date OS versions (yellow = outdated), fresh: an admin may have changed them
    await this.refresh();
    this.searchEl.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.root.replaceChildren();
    document.body.classList.remove("sheet-open");
    this.returnFocus?.focus?.();
  }

  /** Ricarica elenco e storico (anche per modifiche di altri utenti). */
  async refresh() {
    if (!this.isOpen) return;
    await this.#loadList();
    if (this.selectedId) await this.#loadDetail(this.selectedId, { keepScroll: true });
  }

  // ---------------------------------------------------------------------------

  #build() {
    const head = el("header", "sheet-header");
    const info = el("div", "sheet-info");
    const h = el("h2", "sheet-title", t("inventory.title"));
    h.id = "inventory-title";
    info.append(h, el("p", "sheet-facts muted", t("inventory.facts")));
    this.countEl = el("span", "sheet-count");
    const close = el("button", "btn", t("inventory.close"));
    close.type = "button";
    close.title = t("inventory.close_title");
    close.addEventListener("click", () => this.close());
    const side = el("div", "sheet-side");
    side.append(this.countEl, close);
    head.append(info, homeButton(head, () => this.close()), side);

    const bar = el("div", "sheet-toolbar");
    this.searchEl = el("input", "sheet-filter");
    this.searchEl.type = "search";
    this.searchEl.placeholder = t("inventory.search_placeholder");
    this.searchEl.setAttribute("aria-label", t("inventory.search_label"));
    this.searchEl.value = this.query;
    this.searchEl.addEventListener("input", () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.query = this.searchEl.value.trim(); this.#loadList(); }, SEARCH_DELAY_MS);
    });
    this.searchEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); this.tbody.querySelector("tr[data-id]")?.focus(); }
    });
    this.customerEl = el("select", "inv-customer");
    this.customerEl.setAttribute("aria-label", t("inventory.customer_label"));
    this.customerEl.title = t("inventory.customer_title");
    this.customerEl.addEventListener("change", () => {
      this.customerView = this.customerEl.value;
      try { localStorage.setItem(CUSTOMER_KEY, this.customerView); } catch { /* optional */ }
      this.#loadList();
    });
    this.statsBtn = el("button", "btn btn-small inv-stats-toggle", t("inventory.stats_button"));
    this.statsBtn.type = "button";
    this.statsBtn.title = t("inventory.stats_button_title");
    this.statsBtn.addEventListener("click", () => this.#setStats(!prefs.get().inventory_os_stats));
    bar.append(this.searchEl, this.customerEl, this.statsBtn);

    const panes = el("div", "inv-panes");
    const listWrap = el("div", "sheet-table-wrap inv-list");
    const table = el("table", "server-table inv-table");
    const thead = el("thead");
    const hr = el("tr");
    for (const [key, label] of COLUMNS) {
      const th = el("th");
      th.dataset.col = key;
      const btn = el("button", "th-sort");
      btn.type = "button";
      btn.append(el("span", null, label), el("span", "th-sort-mark"));
      btn.title = key === "os" ? `${t("inventory.os_title")} · ${t("inventory.sort_hint")}` : t("inventory.sort_hint");
      btn.addEventListener("click", () => this.#sortBy(key));
      th.append(btn);
      hr.append(th);
    }
    thead.append(hr);
    this.tbody = el("tbody");
    table.append(thead, this.tbody);
    listWrap.append(table);
    this.table = table;
    this.#showSort();
    this.#fillCustomers();
    this.#showStats();
    this.tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr) this.#select(Number(tr.dataset.id));
    });
    this.tbody.addEventListener("keydown", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.#select(Number(tr.dataset.id)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); this.#rowAfter(tr, 1)?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (this.#rowAfter(tr, -1) ?? this.searchEl).focus(); }
    });

    this.detailEl = el("section", "inv-detail");
    this.detailEl.setAttribute("aria-live", "polite");
    this.detailEl.append(el("p", "muted inv-empty", t("inventory.select_hint")));

    this.statsEl = el("section", "inv-stats");
    this.statsEl.setAttribute("aria-label", t("inventory.stats_title"));
    const right = el("div", "inv-right");
    right.append(this.detailEl, this.statsEl);
    panes.append(listWrap, right);
    this.root.replaceChildren(head, bar, panes);
    this.resizer = makeResizable(table, { key: "inventory" });
  }

  async #loadList() {
    const token = ++this.token;
    let res;
    try {
      const v = this.customerView;
      res = await listServers(this.query, 500, v === "" || v === GROUP ? null : Number(v));
    } catch (err) {
      if (token === this.token) this.tbody.replaceChildren(this.#messageRow(t("inventory.load_error", { message: err.message })));
      return;
    }
    if (token !== this.token) return; // nel frattempo è partita un'altra ricerca
    this.countEl.textContent = res.total === res.servers.length
      ? t("inventory.count", { n: res.total })
      : t("inventory.count_filtered", { shown: res.servers.length, n: res.total });
    this.servers = res.servers;
    this.#renderStats();
    if (!res.servers.length) {
      this.tbody.replaceChildren(this.#messageRow(this.query ? t("inventory.no_match") : t("inventory.empty")));
      return;
    }
    this.#renderRows();
  }

  #sortBy(col) {
    this.sort = { col, dir: this.sort.col === col && this.sort.dir === "asc" ? "desc" : "asc" };
    try { localStorage.setItem(SORT_KEY, JSON.stringify(this.sort)); } catch { /* optional */ }
    this.#showSort();
    if (this.servers.length) this.#renderRows();
  }

  /** aria-sort and the arrow on the header of the sorted column. */
  #showSort() {
    for (const th of this.table.tHead.rows[0].cells) {
      const on = th.dataset.col === this.sort.col;
      if (on) th.setAttribute("aria-sort", this.sort.dir === "asc" ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
      th.querySelector(".th-sort-mark").textContent = on ? (this.sort.dir === "asc" ? "▲" : "▼") : "";
    }
  }

  /** Customer menu: all, divided by customer, of no customer, then each customer. */
  async #fillCustomers() {
    const list = await customers.load().catch(() => []);
    const sel = this.customerEl;
    if (!sel) return;
    sel.replaceChildren(
      new Option(t("inventory.customer_all"), ""),
      new Option(t("inventory.customer_group"), GROUP),
      new Option(t("inventory.customer_none"), "0"),
    );
    const og = el("optgroup");
    og.label = t("inventory.customer_one");
    for (const c of list) og.append(new Option(c.name, String(c.id)));
    if (list.length) sel.append(og);
    const known = ["", GROUP, "0", ...list.map((c) => String(c.id))];
    if (!known.includes(this.customerView)) { this.customerView = ""; this.#loadList(); }
    sel.value = this.customerView;
    sel.classList.toggle("active", this.customerView !== "");
  }

  #renderRows() {
    this.customerEl?.classList.toggle("active", this.customerView !== "");
    const sorted = sortServers(this.servers, this.sort);
    if (this.customerView !== GROUP) {
      this.tbody.replaceChildren(...sorted.map((s) => this.#row(s)));
      return;
    }
    // Divided by customer: a heading row per customer (by name), servers of no customer at the end.
    // A server of more customers is in each of their groups.
    const groups = new Map();
    for (const s of sorted) {
      const keys = s.customers.length ? s.customers : [{ id: 0, name: t("inventory.customer_none") }];
      for (const c of keys) {
        if (!groups.has(c.id)) groups.set(c.id, { name: c.name, servers: [] });
        groups.get(c.id).servers.push(s);
      }
    }
    const ordered = [...groups].sort(([a, ga], [b, gb]) => (a === 0) - (b === 0) || collator.compare(ga.name, gb.name));
    const rows = [];
    for (const [, g] of ordered) {
      const tr = el("tr", "inv-group");
      const td = el("td");
      td.colSpan = COLUMNS.length;
      td.append(el("span", "inv-group-name", g.name), el("span", "muted", t("inventory.count", { n: g.servers.length })));
      tr.append(td);
      rows.push(tr, ...g.servers.map((s) => this.#row(s)));
    }
    this.tbody.replaceChildren(...rows);
  }

  // --- OS statistics (small box at the bottom right) ---

  #setStats(on) {
    prefs.set({ inventory_os_stats: on }).catch(() => {});
    this.#showStats();
  }

  #showStats() {
    if (!this.statsEl) return;
    const on = prefs.get().inventory_os_stats;
    this.statsEl.hidden = !on;
    this.statsBtn.setAttribute("aria-pressed", String(on));
    if (on) this.#renderStats();
  }

  /** Versions of the operating systems of the servers in the list (with the search and customer chosen). */
  #renderStats() {
    if (!this.statsEl || this.statsEl.hidden) return;
    const servers = this.servers;
    const head = el("header", "inv-stats-head");
    head.append(el("h4", null, t("inventory.stats_title")), el("span", "muted", t("inventory.count", { n: servers.length })));
    const close = el("button", "cf-clear");
    close.type = "button";
    close.title = t("inventory.stats_hide");
    close.setAttribute("aria-label", t("inventory.stats_hide"));
    close.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    close.addEventListener("click", () => this.#setStats(false));
    head.append(close);
    const list = el("ul", "inv-stats-list");
    const max = Math.max(1, ...osCounts(servers).map(([, n]) => n));
    for (const [name, n] of osCounts(servers)) {
      const li = el("li");
      li.title = `${name || t("inventory.stats_unset")}: ${n} (${Math.round((n / servers.length) * 100)}%)`;
      const label = el("span", name ? "inv-stats-name" : "inv-stats-name muted", name ? shortOs(name) : t("inventory.stats_unset"));
      if (name) markOutdated(label, name);
      const bar = el("span", "inv-stats-bar");
      bar.style.setProperty("--w", `${(n / max) * 100}%`);
      li.append(label, bar, el("span", "inv-stats-n", String(n)));
      list.append(li);
    }
    if (!servers.length) list.append(el("li", "muted", t("inventory.stats_empty")));
    this.statsEl.replaceChildren(head, list);
  }

  #row(s) {
    const tr = el("tr");
    tr.dataset.id = s.id;
    tr.tabIndex = 0;
    tr.title = t("inventory.show_history");
    if (s.id === this.selectedId) tr.classList.add("selected");
    for (const [, , render] of COLUMNS) {
      const td = el("td");
      const v = render(s);
      if (v instanceof Node) td.append(v); else td.textContent = v;
      tr.append(td);
    }
    return tr;
  }

  /** Next (dir 1) or previous (-1) server row, skipping the customer headings. */
  #rowAfter(tr, dir) {
    let n = dir > 0 ? tr.nextElementSibling : tr.previousElementSibling;
    while (n && !n.dataset.id) n = dir > 0 ? n.nextElementSibling : n.previousElementSibling;
    return n;
  }

  #messageRow(text) {
    const tr = el("tr");
    const td = el("td", "muted inv-message", text);
    td.colSpan = COLUMNS.length;
    tr.append(td);
    return tr;
  }

  async #select(id) {
    this.selectedId = id;
    for (const tr of this.tbody.querySelectorAll("tr[data-id]")) tr.classList.toggle("selected", Number(tr.dataset.id) === id);
    await this.#loadDetail(id);
  }

  async #loadDetail(id, { keepScroll = false } = {}) {
    const scroll = this.detailEl.scrollTop;
    let data;
    try {
      data = await fetchServer(id);
    } catch (err) {
      this.detailEl.replaceChildren(el("p", "error", err.status === 404 ? t("inventory.gone") : t("inventory.error", { message: err.message })));
      return;
    }
    if (id !== this.selectedId) return;
    this.detailEl.replaceChildren(this.#detail(data));
    this.detailEl.scrollTop = keepScroll ? scroll : 0;
  }

  /** «Edit» and «Delete» for the selected server. Delete only when it is in no intervention. */
  #actions(s) {
    const bar = el("div", "inv-actions");
    const edit = el("button", "btn btn-small", t("inventory.edit"));
    edit.type = "button";
    edit.title = t("inventory.edit_title_hint");
    edit.addEventListener("click", async () => {
      let saved;
      try {
        saved = await editServerDialog(s);
      } catch (err) {
        this.detailEl.prepend(el("p", "error", t("inventory.error", { message: err.message })));
        return;
      }
      if (saved) await this.refresh();
    });
    const del = el("button", "btn btn-small btn-danger-outline", t("inventory.delete"));
    del.type = "button";
    if (s.event_count) {
      del.disabled = true;
      del.title = t("inventory.delete_in_use", { n: s.event_count });
    } else {
      del.title = t("inventory.delete_hint");
    }
    del.addEventListener("click", async () => {
      const ok = await confirmDanger({
        title: t("inventory.delete_title", { hostname: s.hostname }),
        intro: t("inventory.delete_intro"),
        items: [t("inventory.delete_item", { hostname: s.hostname })],
        keep: [t("inventory.delete_keep")],
      });
      if (!ok) return;
      try {
        await deleteServer(s.id, s.version);
      } catch (err) {
        this.detailEl.prepend(el("p", "error", err.message));
        return;
      }
      this.selectedId = null;
      this.detailEl.replaceChildren(el("p", "muted inv-empty", t("inventory.deleted", { hostname: s.hostname })));
      await this.#loadList();
    });
    bar.append(edit, del);
    if (s.event_count) bar.append(el("span", "muted", t("inventory.delete_in_use", { n: s.event_count })));
    return bar;
  }

  #detail({ server: s, history, changes }) {
    const wrap = el("div", "inv-card");
    const head = el("header", "inv-head");
    head.append(el("h3", "mono", s.hostname));
    const facts = el("dl", "inv-facts");
    const fact = (label, value, cls) => {
      if (!value) return;
      facts.append(el("dt", null, label), el("dd", cls, value));
    };
    fact(t("inventory.field.ip_address"), s.ip_address, "mono");
    fact(t("inventory.field.operating_system"), s.operating_system);
    if (s.operating_system) markOutdated(facts.lastElementChild, s.operating_system);
    fact(t("inventory.field.environment"), s.environment);
    fact(t("inventory.field.location"), s.location);
    fact(t("inventory.field.current_kernel"), s.current_kernel, "mono");
    fact(t("inventory.field.notes"), s.notes);
    head.append(facts);
    head.append(this.#actions(s));
    wrap.append(head);

    const today = todayIso();
    const title = el("h4", "inv-section", t("inventory.history", { n: history.length }));
    wrap.append(title);
    if (!history.length) {
      wrap.append(el("p", "muted", t("inventory.no_history")));
    }
    const list = el("ol", "timeline");
    for (const h of history) {
      const li = el("li", h.event_date > today ? "future" : null);
      li.style.setProperty("--c", colorFor(h.project_id));
      const top = el("div", "tl-top");
      top.append(
        el("span", "tl-date", formatMediumDate(h.event_date)),
        el("span", "tl-project", h.project_name),
      );
      if (h.event_date > today) top.append(el("span", "tag-future", t("inventory.scheduled")));
      const badges = el("div", "tl-badges");
      badges.append(
        badge(h.event_status, EVENT_STATUS),
        labeled(t("inventory.check"), badge(h.check_status, CHECK_STATUS)),
        labeled(t("inventory.migration"), badge(h.migration_status, MIGRATION_STATUS)),
      );
      const details = [
        h.event_title,
        h.target_operating_system && t("inventory.target_os", { os: shortOs(h.target_operating_system) }),
        h.target_kernel && t("inventory.target_kernel", { kernel: h.target_kernel }),
        h.executed_date && t("inventory.executed", { date: formatShortDate(h.executed_date) }),
        h.assigned_user && t("inventory.technician", { name: h.assigned_user }),
      ].filter(Boolean);
      li.append(top, badges);
      if (details.length) li.append(el("p", "tl-details", details.join(" · ")));
      if (h.notes) li.append(el("p", "tl-notes", h.notes));
      const open = el("button", "btn btn-small", t("inventory.open_event"));
      open.type = "button";
      open.addEventListener("click", () => {
        this.close();
        this.onOpenEvent(h);
      });
      li.append(open);
      list.append(li);
    }
    wrap.append(list);

    if (changes.length) {
      const box = el("details", "inv-changes");
      box.append(el("summary", null, t("inventory.changes", { n: changes.length })));
      const ul = el("ul");
      for (const c of changes) {
        const when = new Date(c.at.endsWith("Z") ? c.at : `${c.at}Z`).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });
        const text = c.action === "create"
          ? t("inventory.created")
          : t("inventory.change", { field: FIELD_LABEL[c.field] ?? c.field, old: c.old_value ?? "—", new: c.new_value ?? "—" });
        const li = el("li");
        li.append(el("span", "muted", when), " ", el("span", null, text));
        ul.append(li);
      }
      box.append(ul);
      wrap.append(box);
    }
    return wrap;
  }
}

/**
 * Dialog to change the fields of a server. The server is shared by all its interventions, so the
 * change shows in all of them. Resolves with the saved server, or null if cancelled.
 */
async function editServerDialog(s) {
  const [osList, options] = await Promise.all([fetchOperatingSystems(), fetchOptions()]);
  return new Promise((resolve) => {
    const dialog = el("dialog", "pf-dialog inv-edit-dialog");
    const form = el("form", "pf");
    form.noValidate = true;
    const head = el("header", "pf-head");
    const h = el("h2", null, t("inventory.edit_title", { hostname: s.hostname }));
    h.id = "inv-edit-title";
    dialog.setAttribute("aria-labelledby", h.id);
    head.append(h);
    const body = el("div", "pf-body");
    body.append(el("p", "muted pf-note", s.event_count
      ? t("inventory.edit_note", { n: s.event_count })
      : t("inventory.edit_note_none")));
    const grid = el("div", "pf-grid");
    const field = (label, input, wide = false) => {
      const lab = el("label", wide ? "pf-field pf-wide" : "pf-field");
      lab.append(el("span", null, label), input);
      grid.append(lab);
      return input;
    };
    const text = (name, value, max, cls) => {
      const input = el("input", cls);
      input.name = name;
      input.value = value ?? "";
      input.maxLength = max;
      input.autocomplete = "off";
      return input;
    };
    const select = (name, values, current) => {
      const sel = el("select");
      sel.name = name;
      const list = [...values];
      if (current && !list.some(([v]) => v === current)) list.push([current, current]); // e.g. an OS no longer active
      for (const [v, label] of list) sel.append(new Option(label, v, false, v === (current ?? "")));
      return sel;
    };
    const hostname = field(t("inventory.field.hostname"), text("hostname", s.hostname, 255, "mono"), true);
    hostname.required = true;
    field(t("inventory.field.ip_address"), text("ip_address", s.ip_address, 45, "mono"));
    field(t("inventory.field.environment"), select("environment", [["", "—"], ...options.environments.map((v) => [v, v])], s.environment));
    field(t("inventory.field.operating_system"), select("operating_system", [["", "—"], ...osList.map((o) => [o.name, o.name])], s.operating_system), true);
    const loc = field(t("inventory.field.location"), text("location", s.location, 100));
    const dl = el("datalist");
    dl.id = "inv-edit-locations";
    dl.append(...(options.locations ?? []).map((l) => new Option(l, l)));
    loc.setAttribute("list", dl.id);
    field(t("inventory.field.current_kernel"), text("current_kernel", s.current_kernel, 100, "mono"));
    const err = el("p", "pf-error");
    err.setAttribute("role", "alert");
    err.hidden = true;
    body.append(grid, dl, err);
    const foot = el("footer", "pf-foot");
    const cancel = el("button", "btn", t("inventory.cancel"));
    cancel.type = "button";
    const save = el("button", "btn btn-primary", t("inventory.save"));
    save.type = "submit";
    foot.append(cancel, save);
    form.append(head, body, foot);
    dialog.append(form);
    document.body.append(dialog);

    let result = null;
    let version = s.version;
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const changes = {};
      for (const name of ["hostname", "ip_address", "environment", "operating_system", "location", "current_kernel"]) {
        const v = form.elements[name].value.trim();
        if (v !== (s[name] ?? "")) changes[name] = v || null;
      }
      if (!Object.keys(changes).length) { dialog.close(); return; }
      err.hidden = true;
      save.disabled = true;
      try {
        result = await patchServer(s.id, { version, ...changes });
        dialog.close();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        if (ex.isConflict && ex.current) { s = ex.current; version = s.version; }
      } finally {
        save.disabled = false;
      }
    });
    dialog.showModal();
    hostname.focus();
  });
}

function labeled(label, node) {
  const span = el("span", "labeled");
  span.append(el("span", "muted", t("inventory.labeled", { label })), node);
  return span;
}
