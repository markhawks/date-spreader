// Scheda progetto (nome, descrizione, stato, elenco interventi) e modulo intervento (nuovo / modifica).

import {
  addEvent, deleteEvent, deleteProject, duplicateEvent, exportCustomer, fetchCustomerOrders, exportProject, fetchEvent, patchEvent, patchProject,
} from "./api.js";
import { confirmDanger } from "./confirm.js";
import { session } from "./session.js";
import { colorFor } from "./colors.js";
import { addDays, formatMediumDate, todayIso } from "./dates.js";
import { CHECK_STATUS, EVENT_STATUS, EVENT_TYPE, MIGRATION_STATUS, PROJECT_STATUS, badge, isConfigEvent, stageLabel } from "./labels.js";
import { locale, t } from "./i18n.js";
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
  x.setAttribute("aria-label", t("projectdialog.close"));
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
    toast(t("projectdialog.event_has_servers"));
    return null;
  }
  const ok = await confirmDanger({
    title: t("projectdialog.delete_event_title"),
    intro: `${ev.project.name} · ${formatMediumDate(ev.event_date)}${ev.title ? ` · ${ev.title}` : ""}`,
    items: [
      t("projectdialog.delete_event_item_event"),
      ...(n ? [t("projectdialog.delete_event_item_rows", { n })] : []),
      ...(ev.participants.length ? [t("projectdialog.delete_event_item_participants", { names: ev.participants.map((p) => p.display_name).join(", ") })] : []),
    ],
    keep: [
      ...(n ? [t("projectdialog.delete_event_keep_servers", { n })] : []),
      t("projectdialog.delete_event_keep_project"),
      t("projectdialog.keep_history"),
    ],
    confirmLabel: t("projectdialog.delete_event"),
  });
  if (!ok) return null;
  try {
    await deleteEvent(ev.id, ev.version);
    return ev;
  } catch (err) {
    toast(err.isConflict ? t("projectdialog.event_conflict") : err.message);
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
/**
 * "Commessa" input: the customer's commesse are proposed in a drop-down list (<datalist>); a new code
 * is created on the customer when the intervention is saved. Without a customer the field is disabled.
 */
export function orderField(customerId, value = "") {
  const input = Object.assign(el("input"), { maxLength: 100, autocomplete: "off", value });
  const hint = el("p", "muted small pf-wide order-hint");
  const list = el("datalist");
  list.id = `orders-${Math.random().toString(36).slice(2)}`;
  document.body.append(list); // removed by dispose() when the form closes
  input.setAttribute("list", list.id);

  /** Loads the commesse of a customer (null = none: field disabled; "new" = customer being created). */
  async function setCustomer(id) {
    input.disabled = id == null;
    input.placeholder = id == null ? t("projectdialog.order_no_customer") : t("projectdialog.order_placeholder");
    list.replaceChildren();
    hint.textContent = "";
    if (id == null) return;
    if (id === "new") { // customer being created in the same form: no commesse yet
      hint.textContent = t("projectdialog.order_hint_none");
      return;
    }
    try {
      const orders = await fetchCustomerOrders(id);
      list.replaceChildren(...orders.map((o) => new Option(o.code, o.code)));
      hint.textContent = orders.length ? t("projectdialog.order_hint", { n: orders.length }) : t("projectdialog.order_hint_none");
    } catch { /* the field still works without suggestions */ }
  }
  setCustomer(customerId);
  let current = customerId;
  const set = (id) => { current = id; return setCustomer(id); };
  return { input, hint, setCustomer: set, disabledByCustomer: () => current == null, dispose: () => list.remove() };
}

/** Hours between two "HH:MM" times (an end at 23:59 counts as midnight); null without both. */
export function hoursFromTimes(start, end) {
  if (!start || !end) return null;
  const m = (v) => { const [h, mm] = v.slice(0, 5).split(":").map(Number); return h * 60 + mm; };
  const e = end.slice(0, 5) === "23:59" ? 24 * 60 : m(end);
  return Math.max(e - m(start), 0) / 60;
}

/** 3.5 → "3,5" (in the user's language), at most two decimals. */
export function formatHours(h) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(h);
}

export function openEventForm({ project, event = null, date: initialDate = null }) {
  return new Promise(async (resolve) => {
    await people.load();
    const editing = Boolean(event);
    const d = makeDialog(editing ? t("projectdialog.edit_event") : t("projectdialog.new_event_in", { project: project.name }), colorFor(project.id));
    let result = null;
    d.dialog.addEventListener("close", () => resolve(result));

    const date = Object.assign(el("input"), { type: "date", required: true, value: event?.event_date ?? initialDate ?? todayIso() });
    const type = select(EVENT_TYPE, event?.event_type ?? "migrazione");
    const title = Object.assign(el("input"), { maxLength: 200, autocomplete: "off", value: event?.title ?? "", placeholder: t("projectdialog.title_placeholder") });
    const start = timeSelect(event?.start_time ?? "", { label: t("projectdialog.start_time") });
    const end = timeSelect(event?.end_time ?? "", { label: t("projectdialog.end_time") });
    // Nuovo intervento: 9:00–13:00, o 14:00–18:00 se la data è già occupata (finché non si tocca l'orario)
    const times = linkTimes(date, start, end, { suggest: !editing });
    const notes = Object.assign(el("textarea"), { rows: 2, maxLength: 4000, value: event?.notes ?? "", placeholder: t("projectdialog.optional_plural") });
    // Commessa of the project's customer: drop-down list of the customer's commesse, or a new code
    const customerId = event?.project?.customer_id ?? project.customer_id ?? null;
    const order = orderField(customerId, event?.order_code ?? "");
    d.dialog.addEventListener("close", order.dispose);
    const grid = el("div", "pf-grid");
    grid.append(labeled(t("projectdialog.date"), date, { required: true }), labeled(t("projectdialog.type"), type),
      labeled(t("projectdialog.title"), title, { wide: true }),
      labeled(t("projectdialog.order"), order.input, { wide: true }), order.hint,
      labeled(t("projectdialog.start_time"), start), labeled(t("projectdialog.end_time"), end));
    times.hint.classList.add("pf-wide");
    // Hours actually worked (optional): when empty, the reports use end − start
    const worked = Object.assign(el("input", "pf-hours"), { type: "number", min: "0", max: "1000", step: "0.25", inputMode: "decimal",
      value: event?.worked_hours ?? "" });
    const workedHint = el("span", "muted small pf-hours-hint");
    const syncWorked = () => {
      const h = hoursFromTimes(start.value, end.value);
      worked.placeholder = h == null ? "" : formatHours(h);
      workedHint.textContent = h == null ? t("projectdialog.worked_hours_hint_none") : t("projectdialog.worked_hours_hint", { h: formatHours(h) });
    };
    [start, end].forEach((x) => ["change", "timeset"].forEach((type) => x.addEventListener(type, syncWorked)));
    syncWorked();
    const workedBox = el("span", "pf-hours-box");
    workedBox.append(worked, workedHint);
    grid.append(times.hint, labeled(t("projectdialog.worked_hours"), workedBox, { wide: true }),
      labeled(t("projectdialog.notes"), notes, { wide: true }));
    let picker = null;
    if (!editing) {
      picker = participantPicker([], { label: t("projectdialog.technicians") });
      const p = el("div", "pf-field pf-wide");
      p.append(el("span", null, t("projectdialog.technicians")), picker);
      grid.append(p);
    }
    d.body.append(grid);
    if (editing) {
      d.body.append(el("p", "muted small", t("projectdialog.edit_event_hint")));
    }
    d.body.append(d.error);

    // Eliminazione (con conferma). Con server dentro: solo coordinatori e amministratori.
    if (editing) {
      const del = button(t("projectdialog.delete_event"), "btn btn-danger-outline");
      if (event.servers.length && !session.canDeleteAll) {
        del.disabled = true;
        del.title = t("projectdialog.delete_event_disabled", { cancelled: EVENT_STATUS.annullato.toLowerCase() });
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
    const cancel = button(t("projectdialog.cancel"));
    cancel.addEventListener("click", () => d.dialog.close());
    const save = button(editing ? t("projectdialog.save") : t("projectdialog.create_event"), "btn btn-primary", "submit");
    d.foot.append(cancel, save);

    d.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!date.value) return d.showError(t("projectdialog.date_required"), date);
      if (start.value && end.value && end.value <= start.value) {
        return d.showError(t("projectdialog.end_after_start"), end);
      }
      if (worked.value !== "" && !(Number(worked.value) >= 0 && Number(worked.value) <= 1000)) {
        return d.showError(t("projectdialog.worked_hours_invalid"), worked);
      }
      const values = {
        event_date: date.value, event_type: type.value, title: title.value,
        start_time: start.value, end_time: end.value, notes: notes.value,
        worked_hours: worked.value === "" ? null : Number(worked.value),
        ...(customerId != null && { order_code: order.input.value.trim() }),
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
            order_code: event.order_code ?? "", worked_hours: event.worked_hours ?? "",
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
          d.showError(t("projectdialog.conflict_reopen", { message: err.message }));
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
    const d = makeDialog(t("projectdialog.project"), colorFor(project.id));
    d.dialog.classList.add("project-dialog");
    let current = { ...project };

    const name = Object.assign(el("input"), { maxLength: 200, autocomplete: "off", value: project.name, required: true });
    const description = Object.assign(el("textarea"), { rows: 2, maxLength: 2000, value: project.description ?? "", placeholder: t("projectdialog.optional") });
    const status = select(PROJECT_STATUS, project.status);
    const customer = customerSelect(project.customer_id ?? null);
    const grid = el("div", "pf-grid");
    grid.append(labeled(t("projectdialog.project_name"), name, { wide: true, required: true }),
      labeled(t("projectdialog.description"), description, { wide: true }), labeled(t("projectdialog.customer"), customer),
      labeled(t("projectdialog.project_status"), status));
    if (project.is_demo) grid.append(el("p", "muted small pf-wide", t("projectdialog.demo_hint")));

    // Interventi del progetto
    const evHead = el("div", "pd-events-head");
    evHead.append(el("h3", null, t("projectdialog.events_heading", { n: project.events.length })));
    const add = button(t("projectdialog.add_event"), "btn btn-small");
    evHead.append(add);
    const list = el("ul", "pd-events");
    const today = todayIso();
    for (const pe of project.events) {
      const li = el("li", pe.event_date < today ? "past" : null);
      const info = el("div", "pd-ev-info");
      info.append(el("span", "pd-ev-date", formatMediumDate(pe.event_date)), el("span", "pd-ev-title", pe.title ?? EVENT_TYPE[pe.event_type] ?? ""));
      const meta = el("div", "pd-ev-meta");
      meta.append(badge(pe.status, EVENT_STATUS), el("span", "muted small", t("projectdialog.servers_count", { n: pe.server_count })));
      const open = button(t("projectdialog.open"), "btn btn-small");
      open.addEventListener("click", () => { d.dialog.close(); this.opts.onOpenEvent(pe); });
      const del = button("", "btn btn-small icon-only btn-danger-outline");
      del.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M5 4l.6 9h4.8l.6-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      del.title = t("projectdialog.delete_this_event");
      del.setAttribute("aria-label", t("projectdialog.delete_event_of", { date: formatMediumDate(pe.event_date) }));
      if (pe.server_count && !session.canDeleteAll) {
        del.disabled = true;
        del.title = t("projectdialog.delete_event_disabled_short");
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
    if (!project.events.length) list.append(el("li", "muted pd-empty", t("projectdialog.no_events")));

    d.body.append(grid, evHead, list);
    // Export (coordinatori e amministratori): file da importare in un'altra installazione di Date Spreader
    if (session.canExport) {
      const box = el("div", "pd-export");
      box.append(el("span", "muted small", t("projectdialog.export_intro")));
      const download = async (btn, fn) => {
        btn.disabled = true;
        try { this.opts.toast?.(t("projectdialog.downloaded", { file: await fn() })); } catch (err) { d.showError(err.message); } finally { btn.disabled = false; }
      };
      const expProject = button(t("projectdialog.export_project"), "btn btn-small");
      expProject.title = t("projectdialog.export_project_title");
      expProject.addEventListener("click", () => download(expProject, () => exportProject(project.id)));
      box.append(expProject);
      if (project.customer_id) {
        const expCustomer = button(t("projectdialog.export_customer", { customer: project.customer_name }), "btn btn-small");
        expCustomer.title = t("projectdialog.export_customer_title");
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
      const delProject = button(t("projectdialog.delete_project"), "btn btn-danger-outline");
      delProject.addEventListener("click", async () => {
        const events = current.events ?? project.events;
        const rows = events.reduce((n, e) => n + (e.server_count ?? 0), 0);
        const dates = events.slice(0, 5).map((e) => formatMediumDate(e.event_date)).join(", ") + (events.length > 5 ? "…" : "");
        const ok = await confirmDanger({
          title: t("projectdialog.delete_project_title"),
          intro: current.name,
          items: [
            t("projectdialog.delete_project_item_project"),
            ...(events.length ? [t("projectdialog.delete_project_item_events", { n: events.length, dates })] : []),
            ...(rows ? [t("projectdialog.delete_project_item_rows", { n: rows })] : []),
          ],
          keep: [
            ...(current.customer_name ? [t("projectdialog.delete_project_keep_customer", { customer: current.customer_name })] : []),
            ...(rows ? [t("projectdialog.delete_project_keep_servers")] : []),
            t("projectdialog.keep_history"),
          ],
          confirmLabel: t("projectdialog.delete_project"),
          requireText: events.length ? current.name : null, // con interventi: va scritto il nome
        });
        if (!ok) return;
        try {
          await deleteProject(project.id, current.version);
          d.dialog.close();
          this.opts.onProjectDeleted({ ...current, events });
        } catch (err) {
          d.showError(err.isConflict ? t("projectdialog.project_conflict") : err.message);
        }
      });
      d.foot.append(delProject, el("span", "spacer"));
    }
    const cancel = button(t("projectdialog.close"));
    cancel.addEventListener("click", () => d.dialog.close());
    const save = button(t("projectdialog.save_project"), "btn btn-primary", "submit");
    d.foot.append(cancel, save);

    d.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = { name: name.value.trim().replace(/\s+/g, " "), description: description.value.trim(), status: status.value };
      if (!values.name) return d.showError(t("projectdialog.name_required"), name);
      const changes = {};
      if (values.name !== current.name) changes.name = values.name;
      if (values.description !== (current.description ?? "")) changes.description = values.description;
      if (values.status !== current.status) changes.status = values.status;
      try {
        const cid = await customer.getValue(); // crea il cliente nuovo, se scritto
        if (cid !== (current.customer_id ?? null)) changes.customer_id = cid;
      } catch (err) {
        return d.showError(t("projectdialog.customer_error", { message: err.message }));
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
          d.showError(err.message, /nome|name/i.test(err.message) ? name : null);
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
 * Duplica un intervento in un'altra data dello stesso progetto (es. da rieseguire).
 * Si copiano titolo, tipo, note, tecnici e, se scelto, la tabella server con gli stati azzerati.
 * @returns {Promise<object|null>} il nuovo intervento
 */
export async function duplicateEventFlow(eventId) {
  const ev = await fetchEvent(eventId);
  return new Promise((resolve) => {
    let result = null;
    const d = makeDialog(t("projectdialog.duplicate_title"), colorFor(ev.project.id));
    d.dialog.addEventListener("close", () => resolve(result));
    const what = [ev.project.customer_name, ev.project.name, ev.title].filter(Boolean).join(" · ");
    const intro = el("p", "pf-wide dup-intro");
    // The sentence is split around {what}, which is shown in bold
    const [before, after = ""] = t("projectdialog.duplicate_intro", { date: formatMediumDate(ev.event_date) }).split("{what}");
    intro.append(before, el("strong", null, what), after);

    const date = Object.assign(el("input"), { type: "date", required: true, value: addDays(ev.event_date, 7) });
    const start = timeSelect(ev.start_time ?? "", { label: t("projectdialog.start_time") });
    const end = timeSelect(ev.end_time ?? "", { label: t("projectdialog.end_time") });
    start.addEventListener("change", () => {
      if (start.value && end.value && end.value <= start.value) end.setValue("");
    });
    const grid = el("div", "pf-grid");
    grid.append(intro, labeled(t("projectdialog.new_date"), date, { required: true }), el("span"),
      labeled(t("projectdialog.start_time"), start), labeled(t("projectdialog.end_time"), end));

    const n = ev.servers.length;
    const withServers = Object.assign(el("input"), { type: "checkbox", checked: n > 0, disabled: n === 0 });
    const check = el("label", "pf-wide dup-check");
    check.append(withServers, el("span", null, n
      ? t("projectdialog.duplicate_with_servers", { n })
      : t("projectdialog.duplicate_no_servers")));
    grid.append(check);
    // i tecnici disattivati non vengono copiati
    const names = ev.participants.filter((p) => people.byId(p.id)?.is_active !== false).map((p) => p.display_name);
    const notes = el("ul", "pf-wide muted small dup-notes");
    notes.append(
      el("li", null, names.length
        ? t("projectdialog.duplicate_copies_people", { names: names.join(", "), planned: EVENT_STATUS.pianificato })
        : t("projectdialog.duplicate_copies", { planned: EVENT_STATUS.pianificato })),
      el("li", null, isConfigEvent(ev)
        ? t("projectdialog.duplicate_rows_config")
        : t("projectdialog.duplicate_rows", {
          check: CHECK_STATUS.da_fare, stage: stageLabel(ev).toLowerCase(), planned: MIGRATION_STATUS.pianificata,
        })),
    );
    grid.append(notes);
    d.body.append(grid, d.error);

    const cancel = button(t("projectdialog.cancel"));
    cancel.addEventListener("click", () => d.dialog.close());
    const save = button(t("projectdialog.duplicate"), "btn btn-primary", "submit");
    d.foot.append(cancel, save);
    d.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!date.value) return d.showError(t("projectdialog.new_date_required"), date);
      if (start.value && end.value && end.value <= start.value) {
        return d.showError(t("projectdialog.end_after_start"), end);
      }
      save.disabled = true;
      try {
        result = await duplicateEvent(ev.id, {
          event_date: date.value, keep_times: false, start_time: start.value, end_time: end.value,
          include_servers: withServers.checked,
        });
        d.dialog.close();
      } catch (err) {
        save.disabled = false;
        d.showError(err.message);
      }
    });
    d.dialog.showModal();
    date.focus();
  });
}

/**
 * Sceglie un progetto esistente e apre il modulo «Nuovo intervento» nella data indicata.
 * @returns {Promise<object|null>} l'intervento creato
 */
export function newEventOnDate(projects, isoDate) {
  return new Promise((resolve) => {
    const d = makeDialog(t("projectdialog.new_event_on", { date: formatMediumDate(isoDate) }));
    const sel = el("select");
    sel.setAttribute("aria-label", t("projectdialog.project"));
    sel.append(new Option(t("projectdialog.choose_project"), ""));
    const noCustomer = t("projectdialog.no_customer");
    const byCustomer = new Map();
    for (const p of [...projects].sort((a, b) => a.name.localeCompare(b.name, locale()))) {
      const key = p.customer_name ?? noCustomer;
      if (!byCustomer.has(key)) byCustomer.set(key, []);
      byCustomer.get(key).push(p);
    }
    const keys = [...byCustomer.keys()].sort((a, b) => (a === noCustomer) - (b === noCustomer) || a.localeCompare(b, locale()));
    for (const k of keys) {
      const group = document.createElement("optgroup");
      group.label = k;
      byCustomer.get(k).forEach((p) => group.append(new Option(p.name, String(p.id))));
      sel.append(group);
    }
    d.body.append(labeled(t("projectdialog.project"), sel, { required: true }), d.error);
    const cancel = button(t("projectdialog.cancel"));
    cancel.addEventListener("click", () => d.dialog.close());
    const next = button(t("projectdialog.continue"), "btn btn-primary", "submit");
    d.foot.append(cancel, next);
    let chosen = null;
    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!sel.value) return d.showError(t("projectdialog.project_required"), sel);
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
