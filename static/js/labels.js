// Etichette leggibili e classi colore per stati e tipi.

export const EVENT_STATUS = {
  pianificato: "Pianificato", confermato: "Confermato", in_corso: "In corso",
  completato: "Completato", rinviato: "Rinviato", annullato: "Annullato",
};

export const EVENT_TYPE = {
  migrazione: "Migrazione", upgrade: "Upgrade", patching: "Patching", altro: "Altro",
};

export const CHECK_STATUS = {
  da_fare: "Da fare", in_corso: "In corso", ok: "OK", ko: "KO", non_applicabile: "N/A",
};

export const MIGRATION_STATUS = {
  pianificata: "Pianificata", in_corso: "In corso", completata: "Completata",
  fallita: "Fallita", rinviata: "Rinviata", annullata: "Annullata",
};

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

export const PROJECT_STATUS = { attivo: "Attivo", sospeso: "Sospeso", chiuso: "Chiuso" };

/** "Red Hat Enterprise Linux 9.8" → "RHEL 9.8" (il nome completo resta nel valore/tooltip). */
export const shortOs = (os) => (os ?? "").replace(/^Red Hat Enterprise Linux/i, "RHEL");
