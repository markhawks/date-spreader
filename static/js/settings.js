// Impostazioni: personali (Aspetto) e, per gli amministratori, Amministrazione.
// Per aggiungere un'impostazione: un controllo in una sezione + il campo in app/schemas/preferences.py.

import { prefs } from "./prefs.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Gruppo di scelte a "pulsanti" (radio accessibili). */
function choice(name, value, options, onPick) {
  const group = el("div", "seg");
  group.setAttribute("role", "radiogroup");
  for (const [v, label, hint] of options) {
    const opt = el("label", "seg-opt");
    const input = el("input");
    Object.assign(input, { type: "radio", name, value: v, checked: v === value });
    input.addEventListener("change", () => onPick(v));
    const text = el("span", "seg-text");
    text.append(el("strong", null, label));
    if (hint) text.append(el("span", "muted small", hint));
    opt.append(input, text);
    group.append(opt);
  }
  return group;
}

/**
 * @param {{ me, toast, adminActions?: Array<[string, string, () => void]> }} opts
 *   adminActions: [titolo, descrizione, apri]
 */
export function showSettings({ me, toast, adminActions = [] }) {
  const dialog = el("dialog", "pf-dialog settings-dialog");
  dialog.setAttribute("aria-labelledby", "settings-title");
  const head = el("header", "pf-head");
  const h = el("h2", null, "Impostazioni");
  h.id = "settings-title";
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", "Chiudi");
  x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);

  const nav = el("nav", "settings-nav");
  nav.setAttribute("aria-label", "Sezioni delle impostazioni");
  const content = el("div", "settings-content");
  const sections = [["aspetto", "Aspetto", renderAppearance]];
  if (me.is_admin) sections.push(["admin", "Amministrazione", renderAdmin]);

  function select(key) {
    nav.querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.key === key)));
    const [, title, render] = sections.find(([k]) => k === key);
    const sec = el("section", "settings-section");
    sec.append(el("h3", null, title), ...render());
    content.replaceChildren(sec);
  }
  for (const [key, title] of sections) {
    const b = el("button", "settings-tab", title);
    b.type = "button";
    b.dataset.key = key;
    b.addEventListener("click", () => select(key));
    nav.append(b);
  }

  async function update(changes, message) {
    try {
      await prefs.set(changes);
      toast(message);
    } catch (err) {
      toast(`Impostazione non salvata: ${err.message}`);
      select("aspetto");
    }
  }

  function renderAppearance() {
    const p = prefs.get();
    const posField = el("div", "settings-field");
    posField.append(
      el("h4", null, "Anteprima dell'intervento"),
      el("p", "muted small", "Dove compare il dettaglio quando apri un giorno o un progetto. La colonna dei progetti resta sempre a sinistra."),
      choice("detail_position", p.detail_position, [
        ["right", "A destra", "Compatta, in sola lettura; la modifica si apre a tutto schermo."],
        ["bottom", "In basso, sotto il calendario", "A tutta larghezza, con la tabella server completa e modificabile. L'altezza si regola trascinando il bordo."],
      ], (v) => update({ detail_position: v }, v === "bottom" ? "Anteprima in basso." : "Anteprima a destra.")),
    );
    const themeField = el("div", "settings-field");
    themeField.append(
      el("h4", null, "Tema"),
      choice("theme", p.theme, [
        ["system", "Come il sistema", "Segue l'impostazione chiaro/scuro del computer."],
        ["light", "Chiaro", null],
        ["dark", "Scuro", null],
      ], (v) => update({ theme: v }, "Tema aggiornato.")),
    );
    const sideField = el("div", "settings-field");
    const width = el("div", "settings-inline");
    const reset = el("button", "btn btn-small", "Larghezza predefinita");
    reset.type = "button";
    reset.addEventListener("click", () => update({ sidebar_width: 280 }, "Larghezza della colonna ripristinata."));
    width.append(el("span", "muted small", `Larghezza attuale: ${p.sidebar_width} px — si regola trascinando il bordo destro della colonna.`), reset);
    sideField.append(
      el("h4", null, "Colonna progetti"),
      choice("project_view", p.project_view, [
        ["grid", "Quadrati", "Riquadri affiancati; allargando la colonna se ne vedono di più per riga."],
        ["list", "Rettangoli", "Un progetto per riga, con nome per intero."],
      ], (v) => update({ project_view: v }, "Vista dei progetti aggiornata.")),
      el("p", "muted small settings-sub", "Raggruppamento"),
      choice("project_group", p.project_group, [
        ["none", "Nessuno", null],
        ["customer", "Per cliente", "Un'intestazione per ogni cliente; i progetti senza cliente in fondo."],
      ], (v) => update({ project_group: v }, "Raggruppamento aggiornato.")),
      el("p", "muted small settings-sub", "Ordinamento"),
      choice("project_sort", p.project_sort, [
        ["name", "Alfabetico", null],
        ["date", "Per data", "Prima il prossimo intervento più vicino, poi i progetti con soli interventi passati, infine quelli senza interventi."],
      ], (v) => update({ project_sort: v }, "Ordinamento aggiornato.")),
      width,
    );
    const timeField = el("div", "settings-field");
    timeField.append(
      el("h4", null, "Formato degli orari"),
      choice("time_format", p.time_format, [
        ["24h", "24 ore", "Europeo: 09:00, 14:30, 18:00."],
        ["12h", "12 ore (AM/PM)", "9:00 AM, 2:30 PM, 6:00 PM."],
      ], (v) => update({ time_format: v }, "Formato degli orari aggiornato.")),
    );
    const clockField = el("div", "settings-field");
    clockField.append(
      el("h4", null, "Data e ora nella barra in alto"),
      el("p", "muted small", "Accanto al nome del portale. L'ora segue il formato degli orari scelto sopra."),
      choice("topbar_clock", p.topbar_clock, [
        ["date_time", "Data e ora", "Mer 11 novembre 2026 · 14:32"],
        ["date_time_seconds", "Data e ora con i secondi", "Mer 11 novembre 2026 · 14:32:07"],
        ["date", "Solo la data", null],
        ["time", "Solo l'ora", null],
        ["off", "Nascondi", null],
      ], (v) => update({ topbar_clock: v }, v === "off" ? "Data e ora nascoste." : "Data e ora aggiornate.")),
    );
    const mailField = el("div", "settings-field");
    const accForm = el("form", "settings-inline settings-mail");
    accForm.noValidate = true;
    const acc = el("input");
    Object.assign(acc, { type: "email", name: "gmail_account", value: p.gmail_account, placeholder: me.email || "nome@azienda.it", autocomplete: "email" });
    acc.setAttribute("aria-label", "Account Gmail");
    const accSave = el("button", "btn btn-small", "Salva");
    accSave.type = "submit";
    accForm.append(acc, accSave);
    accForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = acc.value.trim();
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { acc.classList.add("invalid"); acc.focus(); toast("Scrivi un indirizzo email valido (oppure lascia vuoto)."); return; }
      acc.classList.remove("invalid");
      update({ gmail_account: v === me.email ? "" : v }, v ? `Gmail si aprirà con ${v}.` : "Gmail si aprirà con l'email del tuo profilo.");
    });
    const chooseLbl = el("label", "share-choose");
    const chooseCb = el("input");
    Object.assign(chooseCb, { type: "checkbox", checked: p.gmail_choose_account });
    chooseCb.addEventListener("change", () => update({ gmail_choose_account: chooseCb.checked },
      chooseCb.checked ? "A ogni invio sceglierai l'account Google." : "Gmail si aprirà direttamente."));
    chooseLbl.append(chooseCb, " Fammi scegliere l'account Google a ogni invio");
    mailField.append(
      el("h4", null, "Condivisione via email"),
      el("p", "muted small", `Account Google con cui aprire Gmail quando condividi un intervento. Vuoto = email del tuo profilo${me.email ? ` (${me.email})` : ""}. L'account deve essere collegato nel browser (anche insieme a quello personale); se non lo è, attiva la scelta dell'account: Google ti farà selezionarlo o accedervi.`),
      accForm, chooseLbl,
    );
    const note = el("p", "muted small settings-note", "Le impostazioni sono personali e ti seguono su qualsiasi computer da cui accedi.");
    return [posField, sideField, timeField, clockField, themeField, mailField, note];
  }

  function renderAdmin() {
    return adminActions.map(([title, description, open]) => {
      const row = el("div", "settings-field settings-link");
      const text = el("div");
      text.append(el("h4", null, title), el("p", "muted small", description));
      const b = el("button", "btn", "Apri");
      b.type = "button";
      b.addEventListener("click", () => { dialog.close(); open(); });
      row.append(text, b);
      return row;
    });
  }

  const body = el("div", "settings-body");
  body.append(nav, content);
  dialog.append(head, body);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.showModal();
  select("aspetto");
}
