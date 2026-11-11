// Preferenze personali: caricate dal server, applicate all'interfaccia, notificate a chi le usa.

import { fetchPreferences, savePreferences } from "./api.js";
import { setTimeFormat } from "./dates.js";

const THEME_KEY = "datespreader.theme"; // copia locale per applicare il tema prima del login
const DEFAULTS = {
  detail_position: "right", bottom_panel_height: 45, theme: "system",
  sidebar_width: 280, project_view: "grid", project_sort: "name", project_group: "none",
  time_format: "24h", gmail_account: "", gmail_choose_account: false, calendar_zoom: 1, calendar_view: "month", topbar_clock: "date_time",
};

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
let current = { ...DEFAULTS };
const listeners = new Set();

function applyTheme(theme) {
  const resolved = theme === "system" ? (darkQuery.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* facoltativo */ }
}
darkQuery.addEventListener("change", () => { if (current.theme === "system") applyTheme("system"); });

function applyAll() {
  applyTheme(current.theme);
  setTimeFormat(current.time_format);
  document.body.classList.toggle("detail-bottom", current.detail_position === "bottom");
  document.documentElement.style.setProperty("--bottom-h", `${current.bottom_panel_height}%`);
  document.documentElement.style.setProperty("--sidebar-w", `${current.sidebar_width}px`);
}

export const prefs = {
  get: () => ({ ...current }),

  /** Carica dal server (dopo il login) e applica. */
  async load() {
    try {
      current = { ...DEFAULTS, ...(await fetchPreferences()) };
    } catch {
      current = { ...DEFAULTS };
    }
    applyAll();
    return prefs.get();
  },

  /** Salva e applica subito; in caso di errore torna ai valori precedenti. */
  async set(changes) {
    const before = current;
    current = { ...current, ...changes };
    applyAll();
    listeners.forEach((fn) => fn(prefs.get(), changes));
    try {
      current = { ...DEFAULTS, ...(await savePreferences(changes)) };
    } catch (err) {
      current = before;
      applyAll();
      listeners.forEach((fn) => fn(prefs.get(), changes));
      throw err;
    }
    return prefs.get();
  },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
