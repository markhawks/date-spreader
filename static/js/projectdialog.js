// Scheda progetto (nome, descrizione, stato, elenco interventi) e modulo intervento (nuovo / modifica).

import {
  addEvent, deleteEvent, deleteProject, exportCustomer, exportProject, fetchEvent, patchEvent, patchProject,
} from "./api.js";
import { confirmDanger } from "./confirm.js";
import { session } from "./session.js";
import { colorFor } from "./colors.js";
import { formatMediumDate, todayIso } from "./dates.js";
import { EVENT_STATUS, EVENT_TYPE, PROJECT_STATUS, badge } from "./labels.js";
import { customerSelect, customers } from "./customers.js";
import { participantPicker, people } from "./people.js";
import { linkTimes, timeSelect } from "./timepick.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Struttura comune delle finestre: intestazione, corpo, piede. */
function makeDialog(title, accent) {
  const dialog = el("dialog", "pf-dialog");
  if (accent) dialog.style.borderTopColor = accent;
  const form = el("form", "pf");
  form.noValidate = true;
  const head = el("header", "pf-head");
  const h = el("h2", null, title);
  h.id = `dlg-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute("aria-labelledby", h.id);
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", "Chiudi");
  x.innerHTML = CLOSE_SVG;
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);
  const body = el("div", "pf-body");
  const error = el("p", "pf-error");
  error.hidden = true;
  error.setAttribute("role", "alert");
  const foot = el("footer", "pf-foot");
  form.append(head, body, foot);
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  const showError = (message, field) => {
    form.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));
    error.hidden = !message;
    error.textContent = message ?? "";
    if (field) { field.classList.add("invalid"); field.focus(); }
  };
  return { dialog, form, body, foot, error, showError, title: h };
}

function labeled(label, control, { wide = false, required = false } = {}) {
  const wrap = el("label", `pf-field${wide ? " pf-wide" : ""}`);
  const span = el("span", null, label);
  if (required) span.append(" ", el("em", null, "*"));
  wrap.append(span, control);
  return wrap;
}

function select(options, value) {
  const s = el("select");
  for (const [v, l] of Object.entries(options)) s.append(new Option(l, v));
  s.value = value;
  return s;
}

function button(text, cls = "btn", type = "button") {
  const b = el("button", cls, text);
  b.type = type;
  return b;
}

// ---------------------------------------------------------------------------
// Eliminazione con conferma
// ---------------------------------------------------------------------------
/**
 * Chiede conferma ed elimina l'intervento (rilegge i dati aggiornati dal server).
 * @returns {Promise<object|null>} l'intervento eliminato, o null se annullato / non riuscito
 */
export async function deleteEventFlow(eventId, { toast = (m) => alert(m) } = {}) {
  let ev;
  try {
    ev = await fetchEvent(eventId);
  } catch (err) {
    toast(err.message);
    return null;
  }
  const n = ev.servers.length;
  if (n && !session.canDeleteAll) {
    toast("L'intervento contiene dei server: solo coordinatori e amministratori possono eliminarlo.");
    return null;
  }
  const ok = await confirmDanger({
    title: "Eliminare l'intervento?",
    intro: `${ev.project.name} · ${formatMediumDate(ev.event_date)}${ev.title ? ` · ${ev.title}` : ""}`,
    items: [
      "l'intervento, con stato, orari e note",
      ...(n ? [`le ${n === 1 ? "riga" : `${n} righe`} della tabella server (check, migrazione, kernel target, tecnico, note di questo intervento)`] : []),
      ...(ev.participants.length ? [`i partecipanti assegnati (${ev.participants.map((p) => p.display_name).join(", ")})`] : []),
    ],
    keep: [
      ...(n ? [`i ${n === 1 ? "server" : `${n} server`} in anagrafica, con i loro dati e gli altri interventi`] : []),
      "il progetto e gli altri suoi interventi",
      "la registrazione dell'eliminazione nella cronologia",
    ],
    confirmLabel: "Elimina intervento",
  });
  if (!ok) return null;
  try {
    await deleteEvent(ev.id, ev.version);
    return ev;
  } catch (err) {
    toast(err.isConflict ? "L'intervento è stato modificato da un altro utente nel frattempo: riaprilo e riprova." : err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Modulo intervento
// ---------------------------------------------------------------------------
/**
 * @param {{ project: {id, name}, event?: object }} args  con `event` (EventDetail) = modifica
 * @returns {Promise<{saved?: object, deleted?: object} | null>}
 */
export function openEventForm({ project, event = null, date: initialDate = null }) {
  return new Promise(async (resolve) => {
    await people.load();
    const editing = Boolean(event);
    const d = makeDialog(editing ? "Modifica intervento" : `Nuovo intervento · ${project.name}`, colorFor(project.id));
    let result = null;
    d.dialog.addEventListener("close", () => resolve(result));

    const date = Object.assign(el("input"), { type: "date", required: true, value: event?.event_date ?? initialDate ?? todayIso() });
    const type = select(EVENT_TYPE, event?.event_type ?? "migrazione");
    const title = Object.assign(el("input"), { maxLength: 200, autocomplete: "off", value: event?.title ?? "", placeholder: "Es. seconda finestra" });
    const start = timeSelect(event?.start_time ?? "", { label: "Ora inizio" });
    const end = timeSelect(event?.end_time ?? "", { label: "Ora fine" });
    // Nuovo intervento: 9:00–13:00, o 14:00–18:00 se la data è già occupata (finché non si tocca l'orario)
    const times = linkTimes(date, start, end, { suggest: !editing });
    const notes = Object.assign(el("textarea"), { rows: 2, maxLength: 4000, value: event?.notes ?? "", placeholder: "Facoltative" });
    const grid = el("div", "pf-grid");
    grid.append(labeled("Data", date, { required: true }), labeled("Tipo", type), labeled("Titolo", title, { wide: true }),
      labeled("Ora inizio", start), labeled("Ora fine", end));
    times.hint.classList.add("pf-wide");
    grid.append(times.hint, labeled("Note", notes, { wide: true }));
    let picker = null;
    if (!editing) {
      picker = participantPicker([], { label: "Tecnici" });
      const p = el("div", "pf-field pf-wide");
      p.append(el("span", null, "Tecnici"), picker);
      grid.append(p);
    }
    d.body.append(grid);
    if (editing) {
      d.body.append(el("p", "muted small",
        "Stato, partecipanti e server si modificano dalla scheda dell'intervento. Spostando la data, le righe server con la stessa data prevista la seguono."));
    }
    d.body.append(d.error);

    // Eliminazione (con conferma). Con server dentro: solo coordinatori e amministratori.
    if (editing) {
      const del = button("Elimina intervento", "btn btn-danger-outline");
      if (event.servers.length && !session.canDeleteAll) {
        del.disabled = true;
        del.title = "Contiene dei server: solo coordinatori e amministratori possono eliminarlo. In alternativa segnalo come «annullato».";
      }
      del.addEventListener("click", async () => {
        const deleted = await deleteEventFlow(event.id, { toast: (m) => d.showError(m) });
        if (deleted) {
          result = { deleted };
          d.dialog.close();
        }
      });
      d.foot.append(del, el("span", "spacer"));
    }
    const cancel = button("Annulla");
    cancel.addEventListener("click", () => d.dialog.close());
    const save = button(editing ? "Salva" : "Crea intervento", "btn btn-primary", "submit");
    d.foot.append(cancel, save);

    d.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!date.value) return d.showError("Indica la data dell'intervento.", date);
      if (start.value && end.value && end.value <= start.value) {
        return d.showError("L'ora di fine deve essere successiva all'ora di inizio.", end);
      }
      const values = {
        event_date: date.value, event_type: type.value, title: title.value,
        start_time: start.value, end_time: end.value, notes: notes.value,
      };
      save.disabled = true;
      try {
        let saved;
        if (editing) {
          // Solo i campi cambiati, con la versione letta.
          const norm = (v) => (v ?? "").toString();
          const before = {
            event_date: event.event_date, event_type: event.event_type, title: event.title ?? "",
            start_time: event.start_time?.slice(0, 5) ?? "", end_time: event.end_time?.slice(0, 5) ?? "", notes: event.notes ?? "",
          };
          const changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => norm(v) !== norm(before[k])));
          if (!Object.keys(changes).length) { d.dialog.close(); return; }
          saved = await patchEvent(event.id, { version: event.version, ...changes });
        } else {
          saved = await addEvent(project.id, { ...values, participant_ids: picker.getIds() });
        }
        result = { saved, previousDate: event?.event_date ?? null };
        d.dialog.close();
      } catch (err) {
        if (err.isConflict && err.current) {
          d.showError(`${err.message} Chiudi e riapri per vedere i valori aggiornati.`);
        } else {
          d.showError(err.message);
        }
      } finally {
        save.disabled = false;
      }
    });

    d.dialog.showModal();
    date.focus();
  });
}

// ---------------------------------------------------------------------------
// Scheda progetto
// ---------------------------------------------------------------------------
export class ProjectDialog {
  /**
   * @param {{ onSaved: (project) => void, onOpenEvent: (projectEvent) => void,
   *           onEventCreated: (event) => void }} opts
   */
  constructor(opts) {
    this.opts = opts;
  }

  async open(project) {
    await customers.load(true);
    const d = makeDialog("Progetto", colorFor(project.id));
    d.dialog.classList.add("project-dialog");
    let current = { ...project };

    const name = Object.assign(el("input"), { maxLength: 200, autocomplete: "off", value: project.name, required: true });
    const description = Object.assign(el("textarea"), { rows: 2, maxLength: 2000, value: project.description ?? "", placeholder: "Facoltativa" });
    const status = select(PROJECT_STATUS, project.status);
    const customer = customerSelect(project.customer_id ?? null);
    const grid = el("div", "pf-grid");
    grid.append(labeled("Nome del progetto", name, { wide: true, required: true }),
      labeled("Descrizione", description, { wide: true }), labeled("Cliente", customer), labeled("Stato del progetto", status));
    if (project.is_demo) grid.append(el("p", "muted small pf-wide", "Progetto di esempio: si toglie con «python -m app.cli demo remove»."));

    // Interventi del progetto
    const evHead = el("div", "pd-events-head");
    evHead.append(el("h3", null, `Interventi (${project.events.length})`));
    const add = button("+ Nuovo intervento", "btn btn-small");
    evHead.append(add);
    const list = el("ul", "pd-events");
    const today = todayIso();
    for (const pe of project.events) {
      const li = el("li", pe.event_date < today ? "past" : null);
      const info = el("div", "pd-ev-info");
      info.append(el("span", "pd-ev-date", formatMediumDate(pe.event_date)), el("span", "pd-ev-title", pe.title ?? EVENT_TYPE[pe.event_type] ?? ""));
      const meta = el("div", "pd-ev-meta");
      meta.append(badge(pe.status, EVENT_STATUS), el("span", "muted small", `${pe.server_count} server`));
      const open = button("Apri", "btn btn-small");
      open.addEventListener("click", () => { d.dialog.close(); this.opts.onOpenEvent(pe); });
      const del = button("", "btn btn-small icon-only btn-danger-outline");
      del.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M5 4l.6 9h4.8l.6-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      del.title = "Elimina questo intervento";
      del.setAttribute("aria-label", `Elimina l'intervento del ${formatMediumDate(pe.event_date)}`);
      if (pe.server_count && !session.canDeleteAll) {
        del.disabled = true;
        del.title = "Contiene dei server: solo coordinatori e amministratori possono eliminarlo";
      }
      del.addEventListener("click", async () => {
        const deleted = await deleteEventFlow(pe.id, { toast: this.opts.toast });
        if (deleted) {
          d.dialog.close();
          this.opts.onEventDeleted(deleted);
        }
      });
      li.append(info, meta, open, del);
      list.append(li);
    }
    if (!project.events.length) list.append(el("li", "muted pd-empty", "Nessun intervento: aggiungine uno perché il progetto compaia nel calendario."));

    d.body.append(grid, evHead, list);
    // Export (coordinatori e amministratori): file da importare in un'altra installazione di Date Spreader
    if (session.canExport) {
      const box = el("div", "pd-export");
      box.append(el("span", "muted small", "Esporta per un'altra installazione di Date Spreader:"));
      const download = async (btn, fn) => {
        btn.disabled = true;
        try { this.opts.toast?.(`Scaricato ${await fn()}.`); } catch (err) { d.showError(err.message); } finally { btn.disabled = false; }
      };
      const expProject = button("Questo progetto", "btn btn-small");
      expProject.title = "Scarica un file con il progetto, i suoi interventi e le tabelle server";
      expProject.addEventListener("click", () => download(expProject, () => exportProject(project.id)));
      box.append(expProject);
      if (project.customer_id) {
        const expCustomer = button(`Tutto il cliente «${project.customer_name}»`, "btn btn-small");
        expCustomer.title = "Scarica un file con tutti i progetti di questo cliente";
        expCustomer.addEventListener("click", () => download(expCustomer, () => exportCustomer(project.customer_id)));
        box.append(expCustomer);
      }
      d.body.append(box);
    }
    d.body.append(d.error);
    add.addEventListener("click", async () => {
      d.dialog.close();
      const res = await openEventForm({ project: current });
      if (res?.saved) this.opts.onEventCreated(res.saved);
    });

    if (session.canDeleteAll) {
      const delProject = button("Elimina progetto", "btn btn-danger-outline");
      delProject.addEventListener("click", async () => {
        const events = current.events ?? project.events;
        const rows = events.reduce((n, e) => n + (e.server_count ?? 0), 0);
        const dates = events.slice(0, 5).map((e) => formatMediumDate(e.event_date)).join(", ") + (events.length > 5 ? "…" : "");
        const ok = await confirmDanger({
          title: "Eliminare il progetto?",
          intro: current.name,
          items: [
            "il progetto, con descrizione e stato",
            ...(events.length ? [`${events.length === 1 ? "l'intervento" : `i ${events.length} interventi`} (${dates})`] : []),
            ...(rows ? [`le ${rows} righe server di quegli interventi`] : []),
          ],
          keep: [
            ...(current.customer_name ? [`il cliente «${current.customer_name}»`] : []),
            ...(rows ? ["i server in anagrafica, con i loro dati e gli altri interventi"] : []),
            "la registrazione dell'eliminazione nella cronologia",
          ],
          confirmLabel: "Elimina progetto",
          requireText: events.length ? current.name : null, // con interventi: va scritto il nome
        });
        if (!ok) return;
        try {
          await deleteProject(project.id, current.version);
          d.dialog.close();
          this.opts.onProjectDeleted({ ...current, events });
        } catch (err) {
          d.showError(err.isConflict ? "Il progetto è stato modificato da un altro utente nel frattempo: chiudi e riapri." : err.message);
        }
      });
      d.foot.append(delProject, el("span", "spacer"));
    }
    const cancel = button("Chiudi");
    cancel.addEventListener("click", () => d.dialog.close());
    const save = button("Salva progetto", "btn btn-primary", "submit");
    d.foot.append(cancel, save);

    d.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = { name: name.value.trim().replace(/\s+/g, " "), description: description.value.trim(), status: status.value };
      if (!values.name) return d.showError("Il nome del progetto è obbligatorio.", name);
      const changes = {};
      if (values.name !== current.name) changes.name = values.name;
      if (values.description !== (current.description ?? "")) changes.description = values.description;
      if (values.status !== current.status) changes.status = values.status;
      try {
        const cid = await customer.getValue(); // crea il cliente nuovo, se scritto
        if (cid !== (current.customer_id ?? null)) changes.customer_id = cid;
      } catch (err) {
        return d.showError(`Cliente: ${err.message}`);
      }
      if (!Object.keys(changes).length) { d.dialog.close(); return; }
      save.disabled = true;
      try {
        current = await patchProject(project.id, { version: current.version, ...changes });
        this.opts.onSaved(current);
        d.dialog.close();
      } catch (err) {
        if (err.isConflict && err.current) {
          current = err.current;
          name.value = current.name;
          description.value = current.description ?? "";
          status.value = current.status;
          d.showError(err.message);
        } else {
          d.showError(err.message, /nome/i.test(err.message) ? name : null);
        }
      } finally {
        save.disabled = false;
      }
    });

    d.dialog.showModal();
    name.focus();
  }
}

/** Apre il modulo di modifica dell'intervento con i dati aggiornati dal server. */
export async function editEvent(eventId) {
  const event = await fetchEvent(eventId);
  return openEventForm({ project: event.project, event });
}


/**
 * Sceglie un progetto esistente e apre il modulo «Nuovo intervento» nella data indicata.
 * @returns {Promise<object|null>} l'intervento creato
 */
export function newEventOnDate(projects, isoDate) {
  return new Promise((resolve) => {
    const d = makeDialog(`Nuovo intervento · ${formatMediumDate(isoDate)}`);
    const sel = el("select");
    sel.setAttribute("aria-label", "Progetto");
    sel.append(new Option("Scegli il progetto…", ""));
    const byCustomer = new Map();
    for (const p of [...projects].sort((a, b) => a.name.localeCompare(b.name, "it"))) {
      const key = p.customer_name ?? "Senza cliente";
      if (!byCustomer.has(key)) byCustomer.set(key, []);
      byCustomer.get(key).push(p);
    }
    const keys = [...byCustomer.keys()].sort((a, b) => (a === "Senza cliente") - (b === "Senza cliente") || a.localeCompare(b, "it"));
    for (const k of keys) {
      const group = document.createElement("optgroup");
      group.label = k;
      byCustomer.get(k).forEach((p) => group.append(new Option(p.name, String(p.id))));
      sel.append(group);
    }
    d.body.append(labeled("Progetto", sel, { required: true }), d.error);
    const cancel = button("Annulla");
    cancel.addEventListener("click", () => d.dialog.close());
    const next = button("Continua", "btn btn-primary", "submit");
    d.foot.append(cancel, next);
    let chosen = null;
    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!sel.value) return d.showError("Scegli il progetto.", sel);
      chosen = projects.find((p) => p.id === Number(sel.value));
      d.dialog.close();
    });
    d.dialog.addEventListener("close", async () => {
      if (!chosen) return resolve(null);
      const res = await openEventForm({ project: chosen, date: isoDate });
      resolve(res?.saved ?? null);
    });
    d.dialog.showModal();
    sel.focus();
  });
}
