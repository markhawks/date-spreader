// Impostazioni: personali (Aspetto) e, per gli amministratori, Amministrazione.
// Per aggiungere un'impostazione: un controllo in una sezione + il campo in app/schemas/preferences.py.

import { prefs } from "./prefs.js";
import { adoptLanguagePreference, t } from "./i18n.js";

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
  const h = el("h2", null, t("settings.title"));
  h.id = "settings-title";
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", t("settings.close"));
  x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);

  const nav = el("nav", "settings-nav");
  nav.setAttribute("aria-label", t("settings.sections"));
  const content = el("div", "settings-content");
  const sections = [["aspetto", t("settings.appearance"), renderAppearance]];
  if (me.is_admin) sections.push(["admin", t("settings.admin"), renderAdmin]);

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
      return true;
    } catch (err) {
      toast(t("settings.not_saved", { message: err.message }));
      select("aspetto");
      return false;
    }
  }

  function renderAppearance() {
    const p = prefs.get();
    const posField = el("div", "settings-field");
    posField.append(
      el("h4", null, t("settings.preview_title")),
      el("p", "muted small", t("settings.preview_hint")),
      choice("detail_position", p.detail_position, [
        ["right", t("settings.preview_right"), t("settings.preview_right_hint")],
        ["bottom", t("settings.preview_bottom"), t("settings.preview_bottom_hint")],
      ], (v) => update({ detail_position: v }, v === "bottom" ? t("settings.preview_bottom_done") : t("settings.preview_right_done"))),
    );
    const themeField = el("div", "settings-field");
    themeField.append(
      el("h4", null, t("settings.theme")),
      choice("theme", p.theme, [
        ["system", t("settings.theme_system"), t("settings.theme_system_hint")],
        ["light", t("settings.theme_light"), null],
        ["dark", t("settings.theme_dark"), null],
      ], (v) => update({ theme: v }, t("settings.theme_done"))),
    );
    const sideField = el("div", "settings-field");
    const width = el("div", "settings-inline");
    const reset = el("button", "btn btn-small", t("settings.sidebar_reset"));
    reset.type = "button";
    reset.addEventListener("click", () => update({ sidebar_width: 280 }, t("settings.sidebar_reset_done")));
    width.append(el("span", "muted small", t("settings.sidebar_width", { px: p.sidebar_width })), reset);
    sideField.append(
      el("h4", null, t("settings.sidebar_title")),
      choice("project_view", p.project_view, [
        ["grid", t("settings.view_grid"), t("settings.view_grid_hint")],
        ["list", t("settings.view_list"), t("settings.view_list_hint")],
      ], (v) => update({ project_view: v }, t("settings.view_done"))),
      el("p", "muted small settings-sub", t("settings.group_title")),
      choice("project_group", p.project_group, [
        ["none", t("settings.group_none"), null],
        ["customer", t("settings.group_customer"), t("settings.group_customer_hint")],
      ], (v) => update({ project_group: v }, t("settings.group_done"))),
      el("p", "muted small settings-sub", t("settings.sort_title")),
      choice("project_sort", p.project_sort, [
        ["name", t("settings.sort_name"), null],
        ["date", t("settings.sort_date"), t("settings.sort_date_hint")],
      ], (v) => update({ project_sort: v }, t("settings.sort_done"))),
      width,
    );
    const timeField = el("div", "settings-field");
    timeField.append(
      el("h4", null, t("settings.time_title")),
      choice("time_format", p.time_format, [
        ["24h", t("settings.time_24"), t("settings.time_24_hint")],
        ["12h", t("settings.time_12"), "9:00 AM, 2:30 PM, 6:00 PM."],
      ], (v) => update({ time_format: v }, t("settings.time_done"))),
    );
    const daysField = el("div", "settings-field");
    daysField.append(
      el("h4", null, t("settings.days_title")),
      choice("calendar_days", p.calendar_days, [
        ["all", t("settings.days_all"), null],
        ["workweek", t("settings.days_workweek"), t("settings.days_workweek_hint")],
      ], (v) => update({ calendar_days: v }, t("settings.days_done"))),
    );
    const clockField = el("div", "settings-field");
    clockField.append(
      el("h4", null, t("settings.clock_title")),
      el("p", "muted small", t("settings.clock_hint")),
      choice("topbar_clock", p.topbar_clock, [
        ["date_time", t("settings.clock_date_time"), t("settings.clock_date_time_example")],
        ["date_time_seconds", t("settings.clock_seconds"), t("settings.clock_seconds_example")],
        ["date", t("settings.clock_date"), null],
        ["time", t("settings.clock_time"), null],
        ["off", t("settings.clock_off"), null],
      ], (v) => update({ topbar_clock: v }, v === "off" ? t("settings.clock_off_done") : t("settings.clock_done"))),
    );
    const mailField = el("div", "settings-field");
    const accForm = el("form", "settings-inline settings-mail");
    accForm.noValidate = true;
    const acc = el("input");
    Object.assign(acc, { type: "email", name: "gmail_account", value: p.gmail_account, placeholder: me.email || t("settings.gmail_placeholder"), autocomplete: "email" });
    acc.setAttribute("aria-label", t("settings.gmail_account"));
    const accSave = el("button", "btn btn-small", t("settings.save"));
    accSave.type = "submit";
    accForm.append(acc, accSave);
    accForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = acc.value.trim();
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { acc.classList.add("invalid"); acc.focus(); toast(t("settings.gmail_invalid")); return; }
      acc.classList.remove("invalid");
      update({ gmail_account: v === me.email ? "" : v }, v ? t("settings.gmail_with", { email: v }) : t("settings.gmail_profile"));
    });
    const chooseLbl = el("label", "share-choose");
    const chooseCb = el("input");
    Object.assign(chooseCb, { type: "checkbox", checked: p.gmail_choose_account });
    chooseCb.addEventListener("change", () => update({ gmail_choose_account: chooseCb.checked },
      chooseCb.checked ? t("settings.gmail_choose_done") : t("settings.gmail_direct")));
    chooseLbl.append(chooseCb, " ", t("settings.gmail_choose"));
    mailField.append(
      el("h4", null, t("settings.mail_title")),
      el("p", "muted small", t("settings.mail_hint", { profile: me.email ? ` (${me.email})` : "" })),
      accForm, chooseLbl,
    );
    const langField = el("div", "settings-field");
    langField.append(
      el("h4", null, t("settings.language_title")),
      choice("language", p.language, [
        ["auto", t("settings.language_auto"), t("settings.language_auto_hint")],
        ["en", "English", null],
        ["it", "Italiano", null],
      ], (v) => update({ language: v }, t("settings.language_done")).then((ok) => ok && adoptLanguagePreference(v))),
    );
    const note = el("p", "muted small settings-note", t("settings.note"));
    return [langField, posField, sideField, daysField, timeField, clockField, themeField, mailField, note];
  }

  function renderAdmin() {
    return adminActions.map(([title, description, open]) => {
      const row = el("div", "settings-field settings-link");
      const text = el("div");
      text.append(el("h4", null, title), el("p", "muted small", description));
      const b = el("button", "btn", t("settings.open"));
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
