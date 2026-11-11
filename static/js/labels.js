// Etichette leggibili e classi colore per stati e tipi.
// The stored values (e.g. "pianificato") never change; only their labels are translated.

import { t } from "./i18n.js";

const labelsFor = (prefix, values) => Object.fromEntries(values.map((v) => [v, t(`${prefix}.${v}`)]));

export const EVENT_STATUS = labelsFor("labels.event_status", ["pianificato", "confermato", "in_corso", "completato", "rinviato", "annullato"]);

/** Tipo di intervento con tabella ridotta e note estese sotto ogni server. */
export const CONFIG_TYPE = "configurazione";
export const isConfigEvent = (ev) => ev?.event_type === CONFIG_TYPE;

export const EVENT_TYPE = labelsFor("labels.event_type", ["migrazione", "upgrade", "patching", "configurazione", "altro"]);

/**
 * Colonna dello stato di lavorazione di ogni server: prende il nome dal tipo di intervento
 * (il dato è sempre `migration_status`). Con `done` la parola del riepilogo («migrati 2/4»).
 */
const STAGED = ["migrazione", "upgrade", "patching", "configurazione"];
const stageKey = (ev) => (STAGED.includes(ev?.event_type) ? ev.event_type : "other");
export const stageLabel = (ev) => t(`labels.stage.${stageKey(ev)}`);
export const stageDone = (ev) => t(`labels.stage_done.${stageKey(ev)}`);

export const CHECK_STATUS = labelsFor("labels.check_status", ["da_fare", "in_corso", "ok", "ko", "non_applicabile"]);

export const MIGRATION_STATUS = labelsFor("labels.migration_status", ["pianificata", "in_corso", "completata", "fallita", "rinviata", "annullata"]);

// Tono del badge: ok (verde), warn (ambra), bad (rosso), info (blu), neutral (grigio).
const TONE = {
  ok: "ok", completato: "ok", completata: "ok",
  in_corso: "warn", confermato: "info", rinviato: "warn", rinviata: "warn",
  ko: "bad", fallita: "bad",
  pianificato: "info", pianificata: "info",
  da_fare: "neutral", non_applicabile: "neutral", annullato: "neutral", annullata: "neutral",
};

export const toneOf = (status) => TONE[status] ?? "neutral";

/** Crea un <span class="badge tone-…">. */
export function badge(status, labels) {
  const el = document.createElement("span");
  el.className = `badge tone-${toneOf(status)}`;
  el.textContent = labels[status] ?? status;
  return el;
}

export const PROJECT_STATUS = labelsFor("labels.project_status", ["attivo", "sospeso", "chiuso"]);

/** "Red Hat Enterprise Linux 9.8" → "RHEL 9.8" (il nome completo resta nel valore/tooltip). */
export const shortOs = (os) => (os ?? "").replace(/^Red Hat Enterprise Linux/i, "RHEL");
