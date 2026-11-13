// Scelta degli orari a menu a tendina, a passi di 30 minuti, nel formato preferito (24h o AM/PM).
// Orario suggerito per un nuovo intervento: 9:00–13:00, oppure 14:00–18:00 se in quella data
// c'è già un intervento.

import { fetchDay } from "./api.js";
import { formatTime } from "./dates.js";
import { t } from "./i18n.js";

export const STEP_MINUTES = 30;
export const MORNING = { start: "09:00", end: "13:00" };
export const AFTERNOON = { start: "14:00", end: "18:00" };

const pad = (n) => String(n).padStart(2, "0");
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fromMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** "09:00" + 240 minuti → "13:00" (al massimo 23:30). */
export const addMinutes = (hhmm, minutes) => fromMinutes(Math.min(toMinutes(hhmm) + minutes, 23 * 60 + 30));

/**
 * Menu di orari: "—" (nessun orario) e poi 00:00 … 23:30 ogni 30 minuti.
 * Un valore non a passi di 30 minuti (es. dati importati) resta selezionabile.
 * @returns {HTMLSelectElement & { getValue: () => string, setValue: (v: string) => void }}
 */
export function timeSelect(value = "", { label = t("timepick.label"), emptyLabel = "—" } = {}) {
  const select = document.createElement("select");
  select.className = "time-select";
  select.setAttribute("aria-label", label);
  select.append(new Option(emptyLabel, ""));
  for (let min = 0; min < 24 * 60; min += STEP_MINUTES) {
    const hhmm = fromMinutes(min);
    select.append(new Option(formatTime(hhmm), hhmm));
  }
  select.setValue = (v) => {
    const hhmm = (v ?? "").slice(0, 5);
    if (hhmm && ![...select.options].some((o) => o.value === hhmm)) {
      // orario fuori dai passi di 30 minuti: lo inserisce nella posizione giusta
      const opt = new Option(formatTime(hhmm), hhmm);
      const after = [...select.options].find((o) => o.value && o.value > hhmm);
      select.insertBefore(opt, after ?? null);
    }
    select.value = hhmm;
    select.dispatchEvent(new Event("timeset")); // set by code (e.g. suggested times): no "change"
  };
  select.getValue = () => select.value;
  select.setValue(value);
  return select;
}

/** Orario suggerito per un nuovo intervento in quella data (pomeriggio se la data è già occupata). */
export async function suggestTimes(isoDate, { excludeEventId = null } = {}) {
  if (!isoDate) return MORNING;
  try {
    const events = (await fetchDay(isoDate)).filter((e) => e.id !== excludeEventId);
    return events.length ? AFTERNOON : MORNING;
  } catch {
    return MORNING;
  }
}

/**
 * Collega data, inizio e fine di un modulo:
 * - all'apertura e a ogni cambio di data propone l'orario suggerito, finché l'utente non tocca gli orari;
 * - se l'inizio supera la fine, sposta la fine (+4 ore, come la mattina tipo).
 * @returns {{ touched: () => boolean, hint: HTMLElement }}
 */
export function linkTimes(dateInput, start, end, { suggest = true, signal } = {}) {
  let touched = !suggest;
  let token = 0;
  const hint = document.createElement("p");
  hint.className = "muted small time-hint";
  const apply = async () => {
    if (touched) return;
    const tok = ++token;
    const s = await suggestTimes(dateInput.value);
    if (touched || tok !== token) return;
    start.setValue(s.start);
    end.setValue(s.end);
    hint.textContent = s === AFTERNOON
      ? t("timepick.hint_afternoon")
      : t("timepick.hint_morning");
  };
  const opts = signal ? { signal } : undefined;
  start.addEventListener("change", () => {
    touched = true;
    hint.textContent = "";
    if (start.value && end.value && end.value <= start.value) end.setValue(addMinutes(start.value, 240));
  }, opts);
  end.addEventListener("change", () => { touched = true; hint.textContent = ""; }, opts);
  dateInput.addEventListener("change", apply, opts);
  apply();
  return { touched: () => touched, hint };
}
