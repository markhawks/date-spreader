// Import di progetti da un file esportato da un'altra installazione di Date Spreader (amministratori).
//
// 1. si sceglie (o si trascina) il file .json;
// 2. il server esegue l'import e lo annulla: l'anteprima mostra esattamente cosa succederà;
// 3. «Importa» lo esegue davvero, tutto in una volta (o niente, se qualcosa va storto).

import { importPreview, importRun } from "./api.js";
import { formatMediumDate } from "./dates.js";
import { t } from "./i18n.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const FIELD_LABEL = {
  ip_address: t("transfer.field.ip_address"), operating_system: t("transfer.field.operating_system"),
  environment: t("transfer.field.environment"), current_kernel: t("transfer.field.current_kernel"), notes: t("transfer.field.notes"),
};

/** Elenco breve: i primi nomi e «… e altri N». */
function names(list, max = 8) {
  if (!list.length) return "";
  const head = list.slice(0, max).join(", ");
  return list.length > max ? t("transfer.names_more", { names: head, n: list.length - max }) : head;
}

/**
 * @param {{ toast?: (m: string) => void, onImported?: (report: object) => void }} opts
 */
export function showImportDialog({ toast = () => {}, onImported = () => {} } = {}) {
  const dialog = el("dialog", "pf-dialog import-dialog");
  dialog.setAttribute("aria-labelledby", "imp-title");
  dialog.innerHTML = `
    <form class="pf" novalidate>
      <header class="pf-head">
        <h2 id="imp-title">${t("transfer.title")}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${t("transfer.close")}">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="pf-body">
        <p class="muted pf-note">${t("transfer.note_html")}</p>
        <label class="imp-drop">
          <input type="file" accept=".json,application/json" hidden>
          <span class="imp-drop-text">${t("transfer.drop_html")}</span>
          <span class="imp-file muted small"></span>
        </label>
        <fieldset class="imp-conflict" disabled>
          <legend>${t("transfer.conflict_legend")}</legend>
          <label><input type="radio" name="on_conflict" value="skip" checked> ${t("transfer.conflict_skip")}</label>
          <label><input type="radio" name="on_conflict" value="copy"> ${t("transfer.conflict_copy")}</label>
        </fieldset>
        <div class="imp-preview" aria-live="polite"></div>
        <p class="pf-error" role="alert" hidden></p>
      </div>
      <footer class="pf-foot">
        <button type="button" class="btn" data-cancel>${t("transfer.cancel")}</button>
        <button type="submit" class="btn btn-primary" disabled>${t("transfer.import")}</button>
      </footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const fileInput = dialog.querySelector("input[type=file]");
  const drop = dialog.querySelector(".imp-drop");
  const fileInfo = dialog.querySelector(".imp-file");
  const conflict = dialog.querySelector(".imp-conflict");
  const previewEl = dialog.querySelector(".imp-preview");
  const err = dialog.querySelector(".pf-error");
  const submit = dialog.querySelector("[type=submit]");
  let data = null;
  let report = null;

  const close = () => dialog.close();
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.querySelector("[data-cancel]").addEventListener("click", close);
  dialog.addEventListener("close", () => dialog.remove());

  const showError = (message) => {
    err.hidden = !message;
    err.textContent = message ?? "";
  };
  const onConflict = () => form.elements.on_conflict.value;

  async function load(file) {
    showError(null);
    previewEl.replaceChildren();
    submit.disabled = true;
    data = null;
    if (!file) return;
    fileInfo.textContent = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showError(t("transfer.invalid_json"));
      return;
    }
    if (data?.format !== "datespreader-export") {
      showError(t("transfer.not_export"));
      data = null;
      return;
    }
    conflict.disabled = false;
    await preview();
  }

  async function preview() {
    if (!data) return;
    submit.disabled = true;
    previewEl.replaceChildren(el("p", "muted", t("transfer.preparing")));
    try {
      report = await importPreview(data, onConflict());
      renderPreview(report);
      submit.disabled = report.totals.projects === 0;
      showError(null);
    } catch (ex) {
      previewEl.replaceChildren();
      showError(t("transfer.not_importable", { message: ex.message }));
    }
  }

  function renderPreview(r) {
    const out = [];
    const src = data.scope?.name
      ? t(data.scope.type === "customer" ? "transfer.source_customer" : "transfer.source_project", { name: data.scope.name })
      : t("transfer.source_export");
    const when = data.exported_at ? t("transfer.exported_on", { date: formatMediumDate(data.exported_at.slice(0, 10)) }) : "";
    const version = data.app_version ? t("transfer.app_version", { version: data.app_version }) : "";
    out.push(el("p", "imp-source", t("transfer.source", { source: src, when, version })));

    const table = el("table", "imp-projects");
    table.innerHTML = `<thead><tr><th>${t("transfer.col_project")}</th><th>${t("transfer.col_events")}</th><th>${t("transfer.col_rows")}</th><th>${t("transfer.col_outcome")}</th></tr></thead>`;
    const tb = el("tbody");
    for (const p of r.projects) {
      const tr = el("tr", `imp-${p.action}`);
      const outcome = p.action === "creato" ? t("transfer.outcome_new") : p.action === "copia" ? t("transfer.outcome_copy", { name: p.imported_as }) : t("transfer.outcome_skipped");
      tr.append(el("td", null, p.name), el("td", null, String(p.events)), el("td", null, String(p.rows)), el("td", null, outcome));
      tb.append(tr);
    }
    table.append(tb);
    out.push(table);

    const facts = el("ul", "imp-facts");
    const fact = (label, created, existing) => {
      if (!created.length && !existing.length) return;
      const li = el("li");
      li.append(el("strong", null, t("transfer.fact_label", { label })));
      const parts = [];
      if (created.length) parts.push(t("transfer.fact_new", { n: created.length, names: names(created) }));
      if (existing.length) parts.push(t("transfer.fact_existing", { n: existing.length }));
      li.append(parts.join(" · "));
      facts.append(li);
    };
    fact(t("transfer.customers"), r.customers.created, r.customers.existing);
    fact(t("transfer.servers"), r.servers.created, r.servers.existing);
    fact(t("transfer.technicians"), r.technicians.created, r.technicians.existing);
    if (r.operating_systems.created.length) {
      const li = el("li");
      li.append(el("strong", null, t("transfer.fact_label", { label: t("transfer.operating_systems") })), t("transfer.os_added", { names: names(r.operating_systems.created) }));
      facts.append(li);
    }
    if (facts.children.length) out.push(facts);
    if (r.technicians.created.length) {
      out.push(el("p", "muted small", t("transfer.new_technicians")));
    }

    if (r.servers.different.length) {
      const box = el("details", "imp-diff");
      box.append(el("summary", null, t("transfer.servers_different", { n: r.servers.different.length })));
      const ul = el("ul");
      for (const d of r.servers.different.slice(0, 50)) {
        const li = el("li");
        li.append(el("span", "mono", d.hostname), ": ",
          d.fields.map((f) => t("transfer.field_diff", { field: FIELD_LABEL[f.field] ?? f.field, here: f.here ?? "—", file: f.file })).join(", "));
        ul.append(li);
      }
      box.append(ul);
      out.push(box);
    }
    if (r.operating_systems.not_active.length) {
      out.push(el("p", "muted small", t("transfer.os_not_active", { names: names(r.operating_systems.not_active) })));
    }
    if (r.warnings.length) {
      const box = el("details", "imp-warn");
      box.append(el("summary", null, t("transfer.warnings", { n: r.warnings.length })));
      const ul = el("ul");
      r.warnings.slice(0, 50).forEach((w) => ul.append(el("li", null, w)));
      box.append(ul);
      out.push(box);
    }
    out.push(el("p", "imp-total", r.totals.projects
      ? t("transfer.total", { projects: t("transfer.n_projects", { n: r.totals.projects }), events: t("transfer.n_events", { n: r.totals.events }), rows: t("transfer.n_rows", { n: r.totals.rows }) })
      : t("transfer.nothing")));
    previewEl.replaceChildren(...out);
  }

  fileInput.addEventListener("change", () => load(fileInput.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    load(e.dataTransfer.files[0]);
  });
  conflict.addEventListener("change", preview);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!data || submit.disabled) return;
    submit.disabled = true;
    submit.textContent = t("transfer.importing");
    try {
      const done = await importRun(data, onConflict());
      close();
      toast(t("transfer.done", { projects: t("transfer.n_projects", { n: done.totals.projects }), events: t("transfer.n_events", { n: done.totals.events }) }));
      onImported(done);
    } catch (ex) {
      showError(t("transfer.failed", { message: ex.message }));
      submit.textContent = t("transfer.import");
      submit.disabled = false;
    }
  });

  dialog.showModal();
}
