// Utilità per le date. Si lavora sempre con date "locali" e stringhe ISO YYYY-MM-DD,
// senza fusi orari, perché gli interventi sono date di calendario.

import { locale } from "./i18n.js";

const pad = (n) => String(n).padStart(2, "0");

/** {year, month} con month 1-12 */
export const ymOf = (d) => ({ year: d.getFullYear(), month: d.getMonth() + 1 });

export const ymKey = ({ year, month }) => `${year}-${pad(month)}`;

export function addMonths({ year, month }, n) {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export const daysInMonth = ({ year, month }) => new Date(year, month, 0).getDate();

export const isoDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

export const todayIso = () => {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

export function monthRange(ym) {
  return {
    start: isoDate(ym.year, ym.month, 1),
    end: isoDate(ym.year, ym.month, daysInMonth(ym)),
  };
}

/** Colonna (0 = lunedì … 6 = domenica) del primo giorno del mese. */
export const firstWeekdayMonday = ({ year, month }) => (new Date(year, month - 1, 1).getDay() + 6) % 7;

/** "2026-11-15" → Date locale (mezzanotte). */
export function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const fmtMonth = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
// Sempre con l'anno: "15 nov 2026" / "15 Nov 2026" (evita ambiguità tra interventi di anni diversi)
const fmtShort = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" });
const fmtWeekday = new Intl.DateTimeFormat(locale(), { weekday: "short" });

export const formatMonth = ({ year, month }) => fmtMonth.format(new Date(year, month - 1, 1));
export const formatShortDate = (iso) => fmtShort.format(parseIso(iso));

/** Nomi brevi dei giorni a partire da lunedì. 2024-01-01 è un lunedì. */
export const WEEKDAYS = Array.from({ length: 7 }, (_, i) => fmtWeekday.format(new Date(2024, 0, 1 + i)));

// Formato degli orari (preferenza dell'utente): "24h" europeo (default) o "12h" con AM/PM.
let timeFormat = "24h";
export const setTimeFormat = (fmt) => { timeFormat = fmt === "12h" ? "12h" : "24h"; };
export const getTimeFormat = () => timeFormat;

/** "21:00:00" → "21:00" (24h) oppure "9:00 PM" (12h). */
export function formatTime(t) {
  if (!t) return "";
  const hhmm = t.slice(0, 5);
  if (timeFormat !== "12h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Giorni aggiunti a una data ISO: addDays("2026-11-30", 1) → "2026-12-01". */
export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Lunedì della settimana che contiene `iso`. */
export const mondayOf = (iso) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));

/** Numero della settimana ISO 8601 (la settimana 1 contiene il primo giovedì dell'anno). */
export function isoWeek(iso) {
  const thursday = parseIso(addDays(mondayOf(iso), 3));
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const days = Math.round((thursday - jan1) / 86400000); // round: i giorni col cambio d'ora durano 23 o 25 ore
  return Math.floor(days / 7) + 1;
}

const fmtDayMonth = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" });
const fmtDayMonthYear = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" });

/** Settimana che inizia il lunedì `monday`: "9 – 15 novembre 2026", "30 novembre – 6 dicembre 2026". */
export function formatWeek(monday) {
  const a = parseIso(monday);
  const b = parseIso(addDays(monday, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${fmtDayMonthYear.format(b)}`;
  if (a.getFullYear() === b.getFullYear()) return `${fmtDayMonth.format(a)} – ${fmtDayMonthYear.format(b)}`;
  return `${fmtDayMonthYear.format(a)} – ${fmtDayMonthYear.format(b)}`;
}

const fmtLong = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtMedium = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "2026-11-15" → "domenica 15 novembre 2026" */
export const formatLongDate = (iso) => fmtLong.format(parseIso(iso));
/** "2026-11-15" → "dom 15 nov 2026" */
export const formatMediumDate = (iso) => fmtMedium.format(parseIso(iso));
