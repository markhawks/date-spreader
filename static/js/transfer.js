// Import di progetti da un file esportato da un'altra installazione di Date Spreader (amministratori).
//
// 1. si sceglie (o si trascina) il file .json;
// 2. il server esegue l'import e lo annulla: l'anteprima mostra esattamente cosa succederà;
// 3. «Importa» lo esegue davvero, tutto in una volta (o niente, se qualcosa va storto).

import { importPreview, importRun } from "./api.js";
import { formatMediumDate } from "./dates.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const FIELD_LABEL = {
  ip_address: "IP", operating_system: "SO", environment: "ambiente", current_kernel: "kernel", notes: "note",
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Elenco breve: i primi nomi e «… e altri N». */
function names(list, max = 8) {
  if (!list.length) return "";
  const head = list.slice(0, max).join(", ");
  return list.length > max ? `${head} e altri ${list.length - max}` : head;
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
        <h2 id="imp-title">Importa progetti</h2>
        <button type="button" class="icon-btn" data-close aria-label="Chiudi">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="pf-body">
        <p class="muted pf-note">Importa un file esportato da un'altra installazione di Date Spreader (scheda progetto o
          Impostazioni → Clienti → «Esporta»). Clienti, server e tecnici già presenti vengono <strong>riconosciuti e
          riusati</strong> (per nome, hostname, email): i loro dati qui <strong>non vengono modificati</strong>.
          Prima di importare vedi l'anteprima.</p>
        <label class="imp-drop">
          <input type="file" accept=".json,application/json" hidden>
          <span class="imp-drop-text"><strong>Scegli il file</strong> oppure trascinalo qui</span>
          <span class="imp-file muted small"></span>
        </label>
        <fieldset class="imp-conflict" disabled>
          <legend>Progetti con lo stesso nome già presenti qui</legend>
          <label><input type="radio" name="on_conflict" value="skip" checked> Saltali (non importarli)</label>
          <label><input type="radio" name="on_conflict" value="copy"> Importali come copia, con il nome «… (importato)»</label>
        </fieldset>
        <div class="imp-preview" aria-live="polite"></div>
        <p class="pf-error" role="alert" hidden></p>
      </div>
      <footer class="pf-foot">
        <button type="button" class="btn" data-cancel>Annulla</button>
        <button type="submit" class="btn btn-primary" disabled>Importa</button>
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
      showError("Il file non è un JSON valido.");
      return;
    }
    if (data?.format !== "datespreader-export") {
      showError("Questo file non è un export di Date Spreader.");
      data = null;
      return;
    }
    conflict.disabled = false;
    await preview();
  }

  async function preview() {
    if (!data) return;
    submit.disabled = true;
    previewEl.replaceChildren(el("p", "muted", "Preparazione dell'anteprima…"));
    try {
      report = await importPreview(data, onConflict());
      renderPreview(report);
      submit.disabled = report.totals.projects === 0;
      showError(null);
    } catch (ex) {
      previewEl.replaceChildren();
      showError(`File non importabile: ${ex.message}`);
    }
  }

  function renderPreview(r) {
    const out = [];
    const src = data.scope?.name ? `${data.scope.type === "customer" ? "Cliente" : "Progetto"} «${data.scope.name}»` : "Export";
    const when = data.exported_at ? `, esportato il ${formatMediumDate(data.exported_at.slice(0, 10))}` : "";
    out.push(el("p", "imp-source", `${src}${when}${data.app_version ? ` (Date Spreader ${data.app_version})` : ""}.`));

    const table = el("table", "imp-projects");
    table.innerHTML = "<thead><tr><th>Progetto</th><th>Interventi</th><th>Righe server</th><th>Esito</th></tr></thead>";
    const tb = el("tbody");
    for (const p of r.projects) {
      const tr = el("tr", `imp-${p.action}`);
      const outcome = p.action === "creato" ? "Nuovo" : p.action === "copia" ? `Copia: «${p.imported_as}»` : "Già presente: saltato";
      tr.append(el("td", null, p.name), el("td", null, String(p.events)), el("td", null, String(p.rows)), el("td", null, outcome));
      tb.append(tr);
    }
    table.append(tb);
    out.push(table);

    const facts = el("ul", "imp-facts");
    const fact = (label, created, existing) => {
      if (!created.length && !existing.length) return;
      const li = el("li");
      li.append(el("strong", null, `${label}: `));
      const parts = [];
      if (created.length) parts.push(`${created.length} nuovi (${names(created)})`);
      if (existing.length) parts.push(`${existing.length} già presenti, riusati`);
      li.append(parts.join(" · "));
      facts.append(li);
    };
    fact("Clienti", r.customers.created, r.customers.existing);
    fact("Server", r.servers.created, r.servers.existing);
    fact("Tecnici", r.technicians.created, r.technicians.existing);
    if (r.operating_systems.created.length) {
      const li = el("li");
      li.append(el("strong", null, "Sistemi operativi: "), `aggiunte all'elenco ${names(r.operating_systems.created)}`);
      facts.append(li);
    }
    if (facts.children.length) out.push(facts);
    if (r.technicians.created.length) {
      out.push(el("p", "muted small", "I tecnici nuovi vengono creati con ruolo tecnico e senza accesso al portale."));
    }

    if (r.servers.different.length) {
      const box = el("details", "imp-diff");
      box.append(el("summary", null, `${plural(r.servers.different.length, "server già presente ha", "server già presenti hanno")} dati diversi nel file: qui restano quelli attuali`));
      const ul = el("ul");
      for (const d of r.servers.different.slice(0, 50)) {
        const li = el("li");
        li.append(el("span", "mono", d.hostname), ": ",
          d.fields.map((f) => `${FIELD_LABEL[f.field] ?? f.field} ${f.here ?? "—"} (file: ${f.file})`).join(", "));
        ul.append(li);
      }
      box.append(ul);
      out.push(box);
    }
    if (r.operating_systems.not_active.length) {
      out.push(el("p", "muted small", `Versioni disattivate qui (restano disattivate): ${names(r.operating_systems.not_active)}.`));
    }
    if (r.warnings.length) {
      const box = el("details", "imp-warn");
      box.append(el("summary", null, plural(r.warnings.length, "avviso", "avvisi")));
      const ul = el("ul");
      r.warnings.slice(0, 50).forEach((w) => ul.append(el("li", null, w)));
      box.append(ul);
      out.push(box);
    }
    out.push(el("p", "imp-total", r.totals.projects
      ? `Verranno importati ${plural(r.totals.projects, "progetto", "progetti")}, ${plural(r.totals.events, "intervento", "interventi")} e ${plural(r.totals.rows, "riga server", "righe server")}.`
      : "Non c'è niente da importare con questa scelta."));
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
    submit.textContent = "Importazione…";
    try {
      const done = await importRun(data, onConflict());
      close();
      toast(`Importati ${plural(done.totals.projects, "progetto", "progetti")} e ${plural(done.totals.events, "intervento", "interventi")}.`);
      onImported(done);
    } catch (ex) {
      showError(`Import non riuscito, nessun dato è stato modificato: ${ex.message}`);
      submit.textContent = "Importa";
      submit.disabled = false;
    }
  });

  dialog.showModal();
}
