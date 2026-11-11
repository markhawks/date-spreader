// Finestra "Sistemi operativi" (amministratori): aggiungere versioni, disattivarle, eliminare quelle mai usate.

import {
  createOperatingSystem, deleteOperatingSystem, fetchOperatingSystems, setOperatingSystemActive,
} from "./api.js";
import { t } from "./i18n.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const DEFAULT_FAMILY = "Red Hat Enterprise Linux";

export async function showOsDialog({ toast = () => {} } = {}) {
  const dialog = el("dialog", "pf-dialog os-dialog");
  dialog.setAttribute("aria-labelledby", "os-title");
  dialog.innerHTML = `
    <div class="pf">
      <header class="pf-head">
        <h2 id="os-title">${t("osdialog.title")}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${t("osdialog.close")}">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="pf-body">
        <p class="muted pf-note">${t("osdialog.note_html")}</p>
        <div class="os-list"></div>
        <form class="people-add os-add" novalidate>
          <h3>${t("osdialog.add_title")}</h3>
          <div class="os-add-grid">
            <label class="pf-field"><span>${t("osdialog.family")}</span><input name="family" list="os-families" maxlength="100" autocomplete="off"></label>
            <label class="pf-field"><span>${t("osdialog.versions")} <em>*</em></span><input name="versions" autocomplete="off" placeholder="${t("osdialog.versions_placeholder")}"></label>
            <button type="submit" class="btn btn-primary">${t("osdialog.add")}</button>
          </div>
          <datalist id="os-families"></datalist>
          <p class="pf-error" role="alert" hidden></p>
        </form>
      </div>
    </div>`;
  document.body.append(dialog);
  const listEl = dialog.querySelector(".os-list");
  const form = dialog.querySelector("form");
  const err = form.querySelector(".pf-error");
  const families = dialog.querySelector("#os-families");
  form.elements.family.value = DEFAULT_FAMILY;

  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());

  const showError = (message, field) => {
    form.querySelectorAll(".invalid").forEach((x) => x.classList.remove("invalid"));
    err.hidden = !message;
    err.textContent = message ?? "";
    if (field) { form.elements[field].classList.add("invalid"); form.elements[field].focus(); }
  };

  async function render() {
    let items;
    try {
      items = await fetchOperatingSystems(true);
    } catch (ex) {
      listEl.replaceChildren(el("p", "error", ex.message));
      return;
    }
    families.replaceChildren(...[...new Set([DEFAULT_FAMILY, ...items.map((o) => o.family)])].map((f) => new Option(f)));
    // Raggruppa per famiglia e major (es. "Red Hat Enterprise Linux 9")
    const groups = new Map();
    for (const o of items) {
      const key = `${o.family} ${o.major}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    const blocks = [];
    for (const [key, list] of groups) {
      const block = el("section", "os-group");
      block.append(el("h4", null, key));
      for (const o of list) {
        const row = el("div", `os-row${o.is_active ? "" : " inactive"}`);
        row.append(el("span", "os-name", o.name), el("span", "muted small", t("osdialog.server_count", { n: o.server_count })));
        const active = el("label", "os-active");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = o.is_active;
        cb.addEventListener("change", async () => {
          cb.disabled = true;
          try {
            await setOperatingSystemActive(o.id, cb.checked);
            await render();
          } catch (ex) {
            toast(ex.message);
            cb.checked = !cb.checked;
            cb.disabled = false;
          }
        });
        active.append(cb, ` ${t("osdialog.active")}`);
        row.append(active);
        const del = el("button", "btn btn-small btn-danger-outline", t("osdialog.delete"));
        del.type = "button";
        del.disabled = o.server_count > 0;
        del.title = o.server_count > 0 ? t("osdialog.delete_blocked") : t("osdialog.delete_unused");
        del.addEventListener("click", async () => {
          if (!del.classList.contains("confirm")) {
            del.classList.add("confirm");
            del.textContent = t("osdialog.confirm");
            return;
          }
          try {
            await deleteOperatingSystem(o.id);
            await render();
          } catch (ex) {
            toast(ex.message);
          }
        });
        row.append(del);
        block.append(row);
      }
      blocks.push(block);
    }
    listEl.replaceChildren(...(blocks.length ? blocks : [el("p", "muted", t("osdialog.empty"))]));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    if (!f.family.value.trim()) return showError(t("osdialog.family_missing"), "family");
    const parsed = parseVersions(f.versions.value);
    if (parsed.error) return showError(parsed.error, "versions");
    showError(null);
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    const { created, failed } = await createVersions(f.family.value, parsed.versions);
    btn.disabled = false;
    await render();
    if (created.length) toast(t("osdialog.added", { n: created.length, names: created.map((o) => o.name).join(", ") }));
    if (failed.length) showError(failed.join(" "), "versions");
    else { f.versions.value = ""; f.versions.focus(); }
  });

  dialog.showModal();
  await render();
  form.elements.versions.focus();
}

/** "9.5, 9.6; 10" → [{major: 9, minor: 5}, …] oppure { error } */
export function parseVersions(text) {
  const tokens = (text ?? "").split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return { error: t("osdialog.versions_missing") };
  const versions = [];
  for (const token of tokens) {
    const m = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(token);
    if (!m) return { error: t("osdialog.version_invalid", { version: token }) };
    versions.push({ major: Number(m[1]), minor: m[2] === undefined ? null : Number(m[2]) });
  }
  return { versions };
}

/** Crea più versioni; quelle già presenti vengono segnalate senza fermare le altre. */
export async function createVersions(family, versions) {
  const created = [];
  const failed = [];
  for (const v of versions) {
    try {
      created.push(await createOperatingSystem({ family, major: v.major, minor: v.minor }));
    } catch (ex) {
      failed.push(ex.message);
    }
  }
  return { created, failed };
}

/**
 * Finestra rapida «Aggiungi versione» (dal menu SO della tabella).
 * @returns {Promise<object[]>} le versioni create
 */
export function promptNewOsVersions({ family = DEFAULT_FAMILY } = {}) {
  return new Promise((resolve) => {
    const dialog = el("dialog", "pf-dialog os-quick");
    dialog.setAttribute("aria-label", t("osdialog.quick_label"));
    dialog.innerHTML = `
      <form class="pf" novalidate>
        <header class="pf-head"><h2>${t("osdialog.add_title")}</h2></header>
        <div class="pf-body">
          <label class="pf-field"><span>${t("osdialog.family")}</span><input name="family" maxlength="100" autocomplete="off"></label>
          <label class="pf-field"><span>${t("osdialog.versions")}</span><input name="versions" autocomplete="off" placeholder="${t("osdialog.versions_placeholder_short")}"></label>
          <p class="pf-error" role="alert" hidden></p>
        </div>
        <footer class="pf-foot"><button type="button" class="btn" data-cancel>${t("osdialog.cancel")}</button><button type="submit" class="btn btn-primary">${t("osdialog.add")}</button></footer>
      </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    const err = form.querySelector(".pf-error");
    form.elements.family.value = family;
    let result = [];
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const parsed = parseVersions(form.elements.versions.value);
      if (parsed.error) { err.textContent = parsed.error; err.hidden = false; return; }
      const { created, failed } = await createVersions(form.elements.family.value.trim() || DEFAULT_FAMILY, parsed.versions);
      result = created;
      if (failed.length) { err.textContent = failed.join(" "); err.hidden = false; if (!created.length) return; }
      dialog.close();
    });
    dialog.showModal();
    form.elements.versions.focus();
  });
}
