// Anagrafica server: tutti i server nel database, ricerca e storico degli interventi.

import { deleteServer, fetchOperatingSystems, fetchOptions, fetchServer, listServers, patchServer } from "./api.js";
import { confirmDanger } from "./confirm.js";
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
  ["os", t("inventory.col.os"), (s) => withTitle(el("span", null, shortOs(s.operating_system)), s.operating_system)],
  ["env", t("inventory.col.env"), (s) => (s.environment ? el("span", `env env-${s.environment.toLowerCase()}`, s.environment) : "")],
  ["location", t("inventory.col.location"), (s) => el("span", "small", s.location ?? "")],
  ["kernel", t("inventory.col.kernel"), (s) => withTitle(el("span", "mono small", shortKernel(s.current_kernel)), s.current_kernel)],
  ["count", t("inventory.col.count"), (s) => el("span", s.event_count ? "num" : "num muted", String(s.event_count))],
  ["last", t("inventory.col.last"), (s) => (s.last_event_date
    ? stackInline(formatShortDate(s.last_event_date), s.last_migration_status && badge(s.last_migration_status, MIGRATION_STATUS))
    : el("span", "muted", "—"))],
  ["next", t("inventory.col.next"), (s) => (s.next_event_date ? el("span", "next-date", formatShortDate(s.next_event_date)) : el("span", "muted", "—"))],
];

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
      if (e.key === "ArrowDown") { e.preventDefault(); this.tbody.querySelector("tr")?.focus(); }
    });
    bar.append(this.searchEl);

    const panes = el("div", "inv-panes");
    const listWrap = el("div", "sheet-table-wrap inv-list");
    const table = el("table", "server-table inv-table");
    const thead = el("thead");
    const hr = el("tr");
    for (const [key, label] of COLUMNS) {
      const th = el("th", null, label);
      th.dataset.col = key;
      if (key === "os") th.title = t("inventory.os_title");
      hr.append(th);
    }
    thead.append(hr);
    this.tbody = el("tbody");
    table.append(thead, this.tbody);
    listWrap.append(table);
    this.table = table;
    this.tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr) this.#select(Number(tr.dataset.id));
    });
    this.tbody.addEventListener("keydown", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.#select(Number(tr.dataset.id)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); tr.nextElementSibling?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (tr.previousElementSibling ?? this.searchEl).focus(); }
    });

    this.detailEl = el("section", "inv-detail");
    this.detailEl.setAttribute("aria-live", "polite");
    this.detailEl.append(el("p", "muted inv-empty", t("inventory.select_hint")));

    panes.append(listWrap, this.detailEl);
    this.root.replaceChildren(head, bar, panes);
    this.resizer = makeResizable(table, { key: "inventory" });
  }

  async #loadList() {
    const token = ++this.token;
    let res;
    try {
      res = await listServers(this.query);
    } catch (err) {
      if (token === this.token) this.tbody.replaceChildren(this.#messageRow(t("inventory.load_error", { message: err.message })));
      return;
    }
    if (token !== this.token) return; // nel frattempo è partita un'altra ricerca
    this.countEl.textContent = res.total === res.servers.length
      ? t("inventory.count", { n: res.total })
      : t("inventory.count_filtered", { shown: res.servers.length, n: res.total });
    if (!res.servers.length) {
      this.tbody.replaceChildren(this.#messageRow(this.query ? t("inventory.no_match") : t("inventory.empty")));
      return;
    }
    this.tbody.replaceChildren(...res.servers.map((s) => {
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
    }));
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
