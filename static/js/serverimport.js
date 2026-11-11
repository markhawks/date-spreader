// Import of a server list into the server table of an intervention: a CSV/TSV/.xlsx file, or rows
// copied from a spreadsheet and pasted. The server reads the list, recognises the columns (which
// can be changed here) and returns a preview of what would happen to every line; "Import" runs the
// same thing for real. See app/server_import.py.

import { importServers } from "./api.js";
import { t } from "./i18n.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const FIELDS = ["hostname", "ip_address", "operating_system", "environment", "current_kernel",
  "target_operating_system", "target_kernel", "assigned_user", "notes"];
const TONE = { added_new: "ok", added_existing: "info", updated: "info", skipped: "neutral", errors: "bad" };

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const xlsx = /\.xlsx$/i.test(file.name);
    reader.onload = () => {
      if (!xlsx) return resolve({ kind: "text", content: reader.result });
      const bytes = new Uint8Array(reader.result);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      resolve({ kind: "xlsx", content: btoa(bin) });
    };
    reader.onerror = () => reject(new Error(t("serverimport.read_error")));
    if (xlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  });
}

/**
 * @param {{ event: object, toast?: (msg: string) => void }} opts
 * @returns {Promise<boolean>} true if servers were imported
 */
export function showServerImport({ event, toast = () => {} }) {
  return new Promise((resolve) => {
    let imported = false;
    let source = null;      // { kind, content, name }
    let mapping = null;     // field per column (null = detected by the server)
    let hasHeader = null;
    let report = null;
    let request = 0;

    const dialog = el("dialog", "pf-dialog serverimport-dialog");
    dialog.setAttribute("aria-labelledby", "si-title");
    const form = el("form", "pf");
    form.noValidate = true;
    const head = el("header", "pf-head");
    const h = el("h2", null, t("serverimport.title"));
    h.id = "si-title";
    const x = el("button", "icon-btn");
    x.type = "button";
    x.setAttribute("aria-label", t("serverimport.close"));
    x.innerHTML = CLOSE_SVG;
    x.addEventListener("click", () => dialog.close());
    head.append(h, x);

    const body = el("div", "pf-body");
    body.append(el("p", "muted pf-note", t("serverimport.intro")));

    // --- source: file or pasted rows ---
    const src = el("div", "si-source");
    const drop = el("label", "si-drop");
    const file = Object.assign(el("input"), { type: "file", accept: ".csv,.tsv,.txt,.xlsx,text/csv,text/plain" });
    const dropText = el("span", null, t("serverimport.drop"));
    drop.append(file, dropText);
    const paste = Object.assign(el("textarea", "si-paste"), { rows: 5, placeholder: t("serverimport.paste_placeholder") });
    paste.setAttribute("aria-label", t("serverimport.paste_label"));
    src.append(drop, el("span", "muted si-or", t("serverimport.or")), paste);
    body.append(src);

    const preview = el("div", "si-preview");
    body.append(preview);
    const error = el("p", "pf-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    body.append(error);

    const foot = el("footer", "pf-foot");
    const cancel = el("button", "btn", t("serverimport.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const go = el("button", "btn btn-primary", t("serverimport.import_none"));
    go.type = "submit";
    go.disabled = true;
    foot.append(cancel, go);
    form.append(head, body, foot);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); resolve(imported); });

    const showError = (msg) => { error.textContent = msg; error.hidden = !msg; };

    async function run(dryRun) {
      if (!source) return null;
      const req = ++request;
      showError("");
      try {
        const res = await importServers(event.id, {
          kind: source.kind, content: source.content, mapping, has_header: hasHeader,
          update_existing: updateBox.checked, dry_run: dryRun,
        });
        if (req !== request) return null;
        return res;
      } catch (err) {
        if (req === request) showError(err.message);
        return null;
      }
    }

    async function refresh() {
      const res = await run(true);
      if (!res) {
        report = null;
        renderPreview();
        return;
      }
      report = res;
      mapping = res.columns.map((c) => c.field);
      hasHeader = res.has_header;
      renderPreview();
    }

    const updateBox = Object.assign(el("input"), { type: "checkbox" });
    updateBox.addEventListener("change", refresh);

    function renderPreview() {
      if (!report) {
        preview.replaceChildren();
        go.disabled = true;
        go.textContent = t("serverimport.import_none");
        return;
      }
      const opts = el("div", "si-options");
      const headerLbl = el("label", "si-check");
      const headerBox = Object.assign(el("input"), { type: "checkbox", checked: report.has_header });
      headerBox.addEventListener("change", () => { hasHeader = headerBox.checked; refresh(); });
      headerLbl.append(headerBox, " ", t("serverimport.has_header"));
      const updLbl = el("label", "si-check");
      updLbl.append(updateBox, " ", t("serverimport.update_existing"));
      updLbl.title = t("serverimport.update_existing_hint");
      opts.append(headerLbl, updLbl);

      // column mapping
      const cols = el("div", "si-columns");
      cols.append(el("h3", null, t("serverimport.columns")));
      const grid = el("div", "si-col-grid");
      report.columns.forEach((c, i) => {
        const box = el("label", `si-col${c.field ? "" : " ignored"}`);
        box.append(el("span", "si-col-head", c.header || t("serverimport.column_n", { n: i + 1 })));
        const sel = el("select");
        sel.append(new Option(t("serverimport.ignore"), ""));
        for (const f of FIELDS) sel.append(new Option(t(`serverimport.field.${f}`), f));
        sel.value = c.field ?? "";
        sel.addEventListener("change", () => {
          mapping = report.columns.map((col, j) => (j === i ? sel.value || null : col.field));
          // a field can be on one column only
          if (sel.value) mapping = mapping.map((f, j) => (j !== i && f === sel.value ? null : f));
          refresh();
        });
        box.append(sel);
        if (c.sample) box.append(el("span", "muted small si-sample", c.sample));
        grid.append(box);
      });
      cols.append(grid);

      // totals and rows
      const tot = report.totals;
      const totals = el("p", "si-totals");
      const parts = [
        tot.added_new && t("serverimport.total_new", { n: tot.added_new }),
        tot.added_existing && t("serverimport.total_existing", { n: tot.added_existing }),
        tot.updated && t("serverimport.total_updated", { n: tot.updated }),
        tot.skipped && t("serverimport.total_skipped", { n: tot.skipped }),
        tot.errors && t("serverimport.total_errors", { n: tot.errors }),
      ].filter(Boolean);
      totals.textContent = parts.length ? parts.join(" · ") : t("serverimport.nothing");
      const notes = el("div", "si-notes");
      if (report.unknown_os.length) notes.append(el("p", "muted small", t("serverimport.unknown_os", { list: report.unknown_os.join(", ") })));
      if (report.unknown_users.length) notes.append(el("p", "muted small", t("serverimport.unknown_users", { list: report.unknown_users.join(", ") })));

      const table = el("table", "si-rows");
      const thead = el("thead");
      const hr = el("tr");
      for (const key of ["line", "hostname", "result", "details"]) hr.append(el("th", null, t(`serverimport.th.${key}`)));
      thead.append(hr);
      const tbody = el("tbody");
      for (const r of report.rows) {
        const tr = el("tr", `si-${r.status}`);
        tr.append(el("td", "muted", String(r.line)), el("td", "mono", r.hostname || "—"));
        const st = el("td");
        st.append(el("span", `badge tone-${TONE[r.status] ?? "neutral"}`, t(`serverimport.status.${r.status}`)));
        tr.append(st);
        const det = el("td", "small");
        for (const m of r.messages) det.append(el("div", null, m));
        for (const d of r.differences) {
          det.append(el("div", "si-diff", t("serverimport.diff", {
            field: t(`serverimport.field.${d.field}`), current: d.current ?? "—", file: d.file,
          })));
        }
        tr.append(det);
        tbody.append(tr);
      }
      table.append(thead, tbody);
      const wrap = el("div", "si-rows-wrap");
      wrap.append(table);
      preview.replaceChildren(opts, cols, totals, notes, wrap);

      const n = tot.added_new + tot.added_existing + tot.updated;
      go.disabled = n === 0;
      go.textContent = n ? t("serverimport.import_n", { n }) : t("serverimport.import_none");
    }

    async function setSource(next) {
      source = next;
      mapping = null;
      hasHeader = null;
      await refresh();
    }

    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const read = await readFile(f);
        dropText.textContent = f.name;
        paste.value = "";
        await setSource({ ...read, name: f.name });
      } catch (err) {
        showError(err.message);
      }
    });
    ["dragover", "dragenter"].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((type) => drop.addEventListener(type, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) {
        file.files = e.dataTransfer.files;
        file.dispatchEvent(new Event("change"));
      }
    });
    let pasteTimer;
    paste.addEventListener("input", () => {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => {
        file.value = "";
        dropText.textContent = t("serverimport.drop");
        if (paste.value.trim()) setSource({ kind: "text", content: paste.value, name: null });
        else { source = null; report = null; renderPreview(); }
      }, 400);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = true;
      const res = await run(false);
      if (!res) { go.disabled = false; return; }
      const tot = res.totals;
      imported = tot.added_new + tot.added_existing + tot.updated > 0;
      toast(t("serverimport.done", { n: tot.added_new + tot.added_existing + tot.updated }));
      dialog.close();
    });

    dialog.showModal();
    paste.focus();
  });
}
