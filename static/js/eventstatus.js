// Menu per cambiare lo stato di un intervento, con controllo della versione.

import { patchEvent } from "./api.js";
import { EVENT_STATUS, toneOf } from "./labels.js";

/**
 * @param {{id:number, version:number, status:string}} ev intervento (viene aggiornato in place)
 * @param {{ onSaved?: (updated) => void, onConflict?: (current, message) => void,
 *           onError?: (message) => void }} opts
 */
export function eventStatusControl(ev, { onSaved = () => {}, onConflict = () => {}, onError = () => {} } = {}) {
  const select = document.createElement("select");
  select.className = "status-select";
  select.setAttribute("aria-label", "Stato dell'intervento");
  select.title = "Stato dell'intervento";
  for (const [value, label] of Object.entries(EVENT_STATUS)) select.append(new Option(label, value));

  const show = () => {
    select.value = ev.status;
    select.dataset.tone = toneOf(ev.status);
  };
  show();

  select.addEventListener("change", async () => {
    const wanted = select.value;
    select.disabled = true;
    try {
      const updated = await patchEvent(ev.id, { version: ev.version, status: wanted });
      Object.assign(ev, { version: updated.version, status: updated.status });
      show();
      onSaved(updated);
    } catch (err) {
      if (err.isConflict && err.current) {
        Object.assign(ev, { version: err.current.version, status: err.current.status });
        show();
        onConflict(err.current, err.message);
      } else {
        show();
        onError(err.message);
      }
    } finally {
      select.disabled = false;
    }
  });

  /** Aggiorna il menu con valori arrivati da fuori (es. modifiche di altri utenti). */
  select.sync = (fresh) => {
    if (fresh.version !== ev.version && document.activeElement !== select) {
      Object.assign(ev, { version: fresh.version, status: fresh.status });
      show();
    }
  };
  return select;
}
