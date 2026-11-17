// Sync of a customer's projects from a file exported by another installation (administrators).
//
// 1. the file (customer export) is chosen or dropped;
// 2. the server compares it with the data here (writes nothing): report of the differences,
//    grouped by project, with what changed field by field;
// 3. the user chooses item by item (the proposals are preselected, conflicts must be decided);
// 4. «Apply»: backup first, then everything in one transaction. See app/sync.py.

import { syncApply, syncPreview } from "./api.js";
import { formatMediumDate } from "./dates.js";
import { t } from "./i18n.js";
import { CHECK_STATUS, EVENT_STATUS, EVENT_TYPE, MIGRATION_STATUS, PROJECT_STATUS } from "./labels.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const STATES = ["conflict", "changed", "new", "changed_here", "deleted_there", "deleted_here", "only_here", "equal"];
const DATE_FIELDS = new Set(["event_date", "planned_date", "executed_date", "check_date", "check_executed_date"]);
const VALUE_LABELS = {
  status: { ...EVENT_STATUS, ...PROJECT_STATUS },
  event_type: EVENT_TYPE,
  check_status: CHECK_STATUS,
  migration_status: MIGRATION_STATUS,
};

function show(field, value) {
  if (value == null || value === "") return "—";
  if (DATE_FIELDS.has(field)) return formatMediumDate(value);
  if (field === "worked_hours") return t("sync.hours", { n: String(value).replace(".", t("sync.decimal")) });
  return VALUE_LABELS[field]?.[value] ?? String(value);
}

const fieldLabel = (f) => t(`sync.field.${f}`);

/** Table «field | here | in the file» of one item. */
function diffTable(item) {
  const table = el("table", "sync-fields");
  table.innerHTML = `<thead><tr><th>${t("sync.col_field")}</th><th>${t("sync.col_here")}</th><th>${t("sync.col_there")}</th></tr></thead>`;
  const tb = el("tbody");
  for (const f of item.fields) {
    const tr = el("tr");
    tr.append(el("td", null, fieldLabel(f.field)), el("td", "sync-here", show(f.field, f.here)), el("td", "sync-there", show(f.field, f.there)));
    tb.append(tr);
  }
  for (const r of item.rows) {
    const tr = el("tr");
    const what = r.change === "added" ? t("sync.row_added") : r.change === "removed" ? t("sync.row_removed")
      : r.fields.map((f) => t("sync.row_field", { field: fieldLabel(f.field), here: show(f.field, f.here), there: show(f.field, f.there) })).join(" · ");
    const host = el("td");
    host.append(el("span", "mono", r.hostname));
    const cell = el("td", null, what);
    cell.colSpan = 2;
    tr.append(host, cell);
    tb.append(tr);
  }
  table.append(tb);
  return table;
}

/**
 * @param {{ toast?: (m: string) => void, onSynced?: (result: object) => void }} opts
 */
export function showSyncDialog({ toast = () => {}, onSynced = () => {} } = {}) {
  const dialog = el("dialog", "pf-dialog sync-dialog");
  dialog.setAttribute("aria-labelledby", "sync-title");
  dialog.innerHTML = `
    <form class="pf" novalidate>
      <header class="pf-head">
        <h2 id="sync-title">${t("sync.title")}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${t("sync.close")}">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="pf-body">
        <p class="muted pf-note">${t("sync.note_html")}</p>
        <label class="imp-drop">
          <input type="file" accept=".json,application/json" hidden>
          <span class="imp-drop-text">${t("sync.drop_html")}</span>
          <span class="imp-file muted small"></span>
        </label>
        <div class="sync-report" aria-live="polite"></div>
        <p class="pf-error" role="alert" hidden></p>
      </div>
      <footer class="pf-foot">
        <span class="sync-selected muted small"></span>
        <button type="button" class="btn" data-cancel>${t("sync.cancel")}</button>
        <button type="submit" class="btn btn-primary" disabled>${t("sync.apply")}</button>
      </footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const fileInput = dialog.querySelector("input[type=file]");
  const drop = dialog.querySelector(".imp-drop");
  const fileInfo = dialog.querySelector(".imp-file");
  const reportEl = dialog.querySelector(".sync-report");
  const err = dialog.querySelector(".pf-error");
  const submit = dialog.querySelector("[type=submit]");
  const selectedEl = dialog.querySelector(".sync-selected");
  let data = null;
  let diff = null;
  let showEqual = false;
  /** item key → true (take the file's version) / false (keep this one); conflicts start undecided */
  const choice = new Map();

  const close = () => dialog.close();
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.querySelector("[data-cancel]").addEventListener("click", close);
  dialog.addEventListener("close", () => dialog.remove());

  const showError = (message) => {
    err.hidden = !message;
    err.textContent = message ?? "";
  };

  async function load(file) {
    showError(null);
    reportEl.replaceChildren();
    submit.disabled = true;
    selectedEl.textContent = "";
    data = null;
    diff = null;
    if (!file) return;
    fileInfo.textContent = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showError(t("sync.invalid_json"));
      return;
    }
    if (data?.format !== "datespreader-export") {
      showError(t("sync.not_export"));
      data = null;
      return;
    }
    await preview();
  }

  async function preview() {
    reportEl.replaceChildren(el("p", "muted", t("sync.comparing")));
    try {
      diff = await syncPreview(data);
    } catch (ex) {
      reportEl.replaceChildren();
      showError(ex.message);
      return;
    }
    choice.clear();
    for (const i of diff.items) {
      if (i.default != null && !i.follows_parent && !i.blocked) choice.set(i.key, i.default);
    }
    render();
  }

  const selectable = (i) => i.state !== "equal" && !i.follows_parent && !i.blocked;
  const openConflicts = () => diff.items.filter((i) => i.state === "conflict" && selectable(i) && !choice.has(i.key)).length;
  const taken = () => diff.items.filter((i) => selectable(i) && choice.get(i.key) === true).length;

  function updateFooter() {
    const open = openConflicts();
    const n = taken();
    selectedEl.textContent = open
      ? t("sync.conflicts_open", { n: open })
      : n ? t("sync.selected", { n }) : t("sync.none_selected");
    selectedEl.classList.toggle("sync-warn", open > 0);
    // nothing to apply: the button still records that the two installations agree (the baseline),
    // so that the next sync recognizes who changed what
    submit.disabled = open > 0;
    if (!submit.classList.contains("busy")) submit.textContent = n ? t("sync.apply") : t("sync.mark_synced");
  }

  /** Control of one item: checkbox, or the two choices of a conflict. */
  function control(item) {
    const box = el("span", "sync-ctl");
    if (item.state === "equal") return box;
    if (item.blocked || item.follows_parent) {
      const cb = el("input");
      cb.type = "checkbox";
      cb.disabled = true;
      cb.checked = item.follows_parent && choice.get(item.parent) === true;
      cb.title = item.blocked || t("sync.follows_parent");
      box.append(cb);
      return box;
    }
    if (item.state === "conflict") {
      for (const [value, label] of [[false, t("sync.keep_here")], [true, t("sync.take_there")]]) {
        const lab = el("label", "sync-choice");
        const rb = el("input");
        rb.type = "radio";
        rb.name = `c-${item.key}`;
        rb.checked = choice.get(item.key) === value;
        rb.addEventListener("change", () => { choice.set(item.key, value); render(); });
        lab.append(rb, " ", label);
        box.append(lab);
      }
      return box;
    }
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = choice.get(item.key) === true;
    cb.setAttribute("aria-label", t(`sync.action.${item.state}`));
    cb.title = t(`sync.action.${item.state}`);
    cb.addEventListener("change", () => { choice.set(item.key, cb.checked); render(); });
    box.append(cb);
    return box;
  }

  function itemRow(item) {
    const side = item.there ?? item.here;
    const row = el("div", `sync-item sync-${item.state}${item.kind === "project" ? " sync-project" : ""}`);
    const head = el("div", "sync-head");
    head.append(control(item), el("span", `sync-badge sync-b-${item.state}`, t(`sync.state.${item.state}`)));
    const label = el("span", "sync-label");
    if (item.kind === "event") {
      const time = side.start_time ? ` ${side.start_time}${side.end_time ? `–${side.end_time}` : ""}` : "";
      label.append(el("strong", null, `${formatMediumDate(side.event_date)}${time}`));
      if (side.title) label.append(" ", side.title);
      if (side.order_code) label.append(" ", el("span", "sync-tag", side.order_code));
      label.append(" ", el("span", "muted small", show("status", side.status)));
    } else if (item.kind === "project") {
      label.append(el("strong", null, side.name));
    } else {
      label.append(el("span", "mono", item.key.slice(2)));
    }
    head.append(label);
    row.append(head);
    if (item.blocked) row.append(el("p", "sync-blocked small", item.blocked));
    if (item.fields.length || item.rows.length) row.append(diffTable(item));
    return row;
  }

  function render() {
    const out = [];
    const src = diff.source;
    const when = src.exported_at ? formatMediumDate(src.exported_at.slice(0, 10)) : "—";
    out.push(el("p", "imp-source", t("sync.source", { name: src.name ?? "?", customer: diff.customer, date: when })));
    out.push(el("p", "muted small", diff.baseline.at
      ? t("sync.baseline", { name: src.name ?? "?", date: formatMediumDate(diff.baseline.at.slice(0, 10)) })
      : t("sync.no_baseline")));
    if (!diff.whole_customer) out.push(el("p", "muted small", t("sync.single_project")));
    if (!diff.customer_exists) out.push(el("p", "muted small", t("sync.new_customer", { name: diff.customer })));

    // counts per state + «show equal»
    const chips = el("div", "sync-chips");
    for (const s of STATES) {
      const n = diff.counts[s];
      if (n) chips.append(el("span", `sync-badge sync-b-${s}`, `${t(`sync.state.${s}`)}: ${n}`));
    }
    const eq = el("label", "sync-show-equal small");
    const eqBox = el("input");
    eqBox.type = "checkbox";
    eqBox.checked = showEqual;
    eqBox.addEventListener("change", () => { showEqual = eqBox.checked; render(); });
    eq.append(eqBox, " ", t("sync.show_equal"));
    chips.append(eq);
    out.push(chips);

    const conflicts = diff.items.filter((i) => i.state === "conflict" && selectable(i));
    if (conflicts.length) {
      const bar = el("div", "sync-bulk small");
      bar.append(t("sync.all_conflicts"));
      for (const [value, label] of [[false, t("sync.keep_here_all")], [true, t("sync.take_there_all")]]) {
        const b = el("button", "btn btn-small", label);
        b.type = "button";
        b.addEventListener("click", () => { conflicts.forEach((i) => choice.set(i.key, value)); render(); });
        bar.append(b);
      }
      out.push(bar);
    }

    const visible = (i) => showEqual || i.state !== "equal";
    const servers = diff.items.filter((i) => i.kind === "server" && visible(i));
    const projects = diff.items.filter((i) => i.kind === "project");
    const events = diff.items.filter((i) => i.kind === "event");
    const list = el("div", "sync-list");
    for (const p of projects) {
      const children = events.filter((e) => e.parent === p.key)
        .sort((x, y) => (x.there ?? x.here).event_date.localeCompare((y.there ?? y.here).event_date));
      const shown = children.filter(visible);
      if (!visible(p) && !shown.length) continue;
      const group = el("section", "sync-group");
      group.append(itemRow(p));
      const hidden = children.length - shown.length;
      shown.forEach((e) => group.append(itemRow(e)));
      if (hidden) group.append(el("p", "muted small sync-hidden", t("sync.equal_hidden", { n: hidden })));
      list.append(group);
    }
    if (servers.length) {
      const group = el("section", "sync-group");
      group.append(el("h3", "sync-group-title", t("sync.servers")));
      servers.forEach((s) => group.append(itemRow(s)));
      list.append(group);
    }
    if (!list.children.length) list.append(el("p", "sync-same", t("sync.nothing")));
    out.push(list);
    reportEl.replaceChildren(...out);
    updateFooter();
  }

  fileInput.addEventListener("change", () => load(fileInput.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    load(e.dataTransfer.files[0]);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!diff || submit.disabled) return;
    submit.disabled = true;
    submit.classList.add("busy");
    submit.textContent = t("sync.applying");
    const decisions = {};
    for (const i of diff.items) if (selectable(i) && choice.has(i.key)) decisions[i.key] = choice.get(i.key);
    try {
      const done = await syncApply(data, diff.token, decisions);
      close();
      toast(done.created || done.updated || done.deleted
        ? t("sync.done", { created: done.created, updated: done.updated, deleted: done.deleted, backup: done.backup })
        : t("sync.marked", { name: diff.source.name ?? "?" }));
      onSynced(done);
    } catch (ex) {
      showError(ex.message);
      submit.classList.remove("busy");
      updateFooter();
      if (ex.status === 409) await preview();       // data changed here: compare again
    }
  });

  dialog.showModal();
}
