// Utilità per le date. Si lavora sempre con date "locali" e stringhe ISO YYYY-MM-DD,
// senza fusi orari, perché gli interventi sono date di calendario.

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

const fmtMonth = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
// Sempre con l'anno: "15 nov 2026" (evita ambiguità tra interventi di anni diversi)
const fmtShort = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const fmtWeekday = new Intl.DateTimeFormat("it-IT", { weekday: "short" });

export const formatMonth = ({ year, month }) => fmtMonth.format(new Date(year, month - 1, 1));
export const formatShortDate = (iso) => fmtShort.format(parseIso(iso));

/** Nomi brevi dei giorni a partire da lunedì. 2024-01-01 è un lunedì. */
export const WEEKDAYS = Array.from({ length: 7 }, (_, i) => fmtWeekday.format(new Date(2024, 0, 1 + i)));

// Formato degli orari (preferenza dell'utente): "24h" europeo (default) o "12h" con AM/PM.
let timeFormat = "24h";
export const setTimeFormat = (fmt) => { timeFormat = fmt === "12h" ? "12h" : "24h"; };

/** "21:00:00" → "21:00" (24h) oppure "9:00 PM" (12h). */
export function formatTime(t) {
  if (!t) return "";
  const hhmm = t.slice(0, 5);
  if (timeFormat !== "12h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const fmtLong = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtMedium = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "2026-11-15" → "domenica 15 novembre 2026" */
export const formatLongDate = (iso) => fmtLong.format(parseIso(iso));
/** "2026-11-15" → "dom 15 nov 2026" */
export const formatMediumDate = (iso) => fmtMedium.format(parseIso(iso));
