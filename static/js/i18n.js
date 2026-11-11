// Internationalisation: English (primary language) and Italian.
//
// Usage:  t("detail.empty")  ·  t("calendar.week_title", { n: 46, range: "9 – 15 November 2026" })
//
// Every UI string lives in a dictionary file static/js/i18n/<module>.js, one per JS module
// (index = static/index.html, common = words shared by several modules), with this exact shape
// (it must stay valid JSON after "export default", because tests/test_i18n.py parses it):
//
//   export default {
//     "en": { "detail.empty": "No interventions on this date." },
//     "it": { "detail.empty": "Nessun intervento in questa data." }
//   };
//
// - Keys are "<module>.<name>"; English and Italian must have the same keys.
// - Placeholders: {name}. Plurals: { "one": "1 server", "other": "{n} servers" } with t(key, { n }).
// - The language is decided once, when this module loads (before any other module evaluates its
//   constants), from localStorage (copy of the user's preference) or the browser. Changing the
//   language saves the preference and reloads the page: so t() can be used in module-level constants.

import common from "./i18n/common.js";
import api from "./i18n/api.js";
import auth from "./i18n/auth.js";
import backups from "./i18n/backups.js";
import calendar from "./i18n/calendar.js";
import chooser from "./i18n/chooser.js";
import clock from "./i18n/clock.js";
import colors from "./i18n/colors.js";
import confirm from "./i18n/confirm.js";
import contextmenu from "./i18n/contextmenu.js";
import customers from "./i18n/customers.js";
import dates from "./i18n/dates.js";
import detail from "./i18n/detail.js";
import eventstatus from "./i18n/eventstatus.js";
import filters from "./i18n/filters.js";
import index from "./i18n/index.js";
import inventory from "./i18n/inventory.js";
import labels from "./i18n/labels.js";
import main from "./i18n/main.js";
import osdialog from "./i18n/osdialog.js";
import people from "./i18n/people.js";
import prefs from "./i18n/prefs.js";
import projectdialog from "./i18n/projectdialog.js";
import projectform from "./i18n/projectform.js";
import resize from "./i18n/resize.js";
import session from "./i18n/session.js";
import settings from "./i18n/settings.js";
import share from "./i18n/share.js";
import sheet from "./i18n/sheet.js";
import sidebar from "./i18n/sidebar.js";
import timepick from "./i18n/timepick.js";
import transfer from "./i18n/transfer.js";

const DICTS = [common, api, auth, backups, calendar, chooser, clock, colors, confirm, contextmenu, customers, dates, detail, eventstatus, filters, index, inventory, labels, main, osdialog, people, prefs, projectdialog, projectform, resize, session, settings, share, sheet, sidebar, timepick, transfer];
const CATALOG = { en: {}, it: {} };
for (const d of DICTS) {
  Object.assign(CATALOG.en, d.en);
  Object.assign(CATALOG.it, d.it);
}

export const LANGUAGES = ["en", "it"];
const LANG_KEY = "datespreader.lang"; // copy of the "language" preference, read before login

/** Language of the browser: Italian if the browser prefers it, otherwise English. */
export function browserLanguage() {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const tag of list) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (LANGUAGES.includes(base)) return base;
  }
  return "en";
}

/** Preference value ("auto", "en", "it") → actual language. */
export const resolveLanguage = (pref) => (LANGUAGES.includes(pref) ? pref : browserLanguage());

function storedPreference() {
  try { return localStorage.getItem(LANG_KEY) || "auto"; } catch { return "auto"; }
}

let lang = resolveLanguage(storedPreference());
document.documentElement.lang = lang;

export const getLanguage = () => lang;
/** Locale for Intl formatters (dates, numbers). en-GB: day before month, 24h-friendly. */
export const locale = () => (lang === "it" ? "it-IT" : "en-GB");

/**
 * Applies the user's preference after login. If it means a different language from the one
 * the page was built with, it is saved locally and the page reloads (returns true).
 */
export function adoptLanguagePreference(pref) {
  try { localStorage.setItem(LANG_KEY, pref || "auto"); } catch { /* optional */ }
  if (resolveLanguage(pref) === lang) return false;
  location.reload();
  return true;
}

const pluralRules = {};
/** Translated text for `key`, with {placeholders} replaced by `vars`. Falls back to English, then to the key. */
export function t(key, vars = {}) {
  let text = CATALOG[lang][key] ?? CATALOG.en[key];
  if (text == null) {
    console.warn(`i18n: missing key ${key}`);
    return key;
  }
  if (typeof text === "object") {
    pluralRules[lang] ??= new Intl.PluralRules(lang);
    text = text[pluralRules[lang].select(Number(vars.n))] ?? text.other;
  }
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** True if the key exists (for optional texts). */
export const hasText = (key) => key in CATALOG.en;

/**
 * Translates static HTML: data-i18n (text), data-i18n-title, data-i18n-aria-label,
 * data-i18n-placeholder (attribute values are keys).
 */
export function translateStatic(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const attr of ["title", "aria-label", "placeholder"]) {
    for (const node of root.querySelectorAll(`[data-i18n-${attr}]`)) {
      node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`)));
    }
  }
}
