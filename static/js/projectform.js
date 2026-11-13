// Finestra "Nuovo progetto", con primo intervento facoltativo.

import { createProject } from "./api.js";
import { todayIso } from "./dates.js";
import { EVENT_TYPE } from "./labels.js";
import { t } from "./i18n.js";
import { customerSelect, customers } from "./customers.js";
import { orderField } from "./projectdialog.js";
import { participantPicker, people } from "./people.js";
import { linkTimes, timeSelect } from "./timepick.js";

const html = `
  <form method="dialog" class="pf" novalidate>
    <header class="pf-head">
      <h2 id="pf-title">${t("projectform.title")}</h2>
      <button type="button" class="icon-btn" data-cancel aria-label="${t("projectform.close")}">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </header>

    <div class="pf-body">
      <label class="pf-field">
        <span>${t("projectform.name")} <em>*</em></span>
        <input name="name" required maxlength="200" autocomplete="off" placeholder="${t("projectform.name_placeholder")}">
      </label>
      <div class="pf-field">
        <span>${t("projectform.customer")}</span>
        <div class="pf-customer"></div>
      </div>
      <label class="pf-field">
        <span>${t("projectform.description")}</span>
        <textarea name="description" rows="2" maxlength="2000" placeholder="${t("projectform.description_placeholder")}"></textarea>
      </label>

      <fieldset class="pf-event">
        <legend>
          <label class="pf-toggle"><input type="checkbox" name="with_event" checked> ${t("projectform.first_event")}</label>
        </legend>
        <p class="muted pf-note">${t("projectform.first_event_note")}</p>
        <div class="pf-grid">
          <label class="pf-field"><span>${t("projectform.date")} <em>*</em></span><input type="date" name="event_date" required></label>
          <label class="pf-field"><span>${t("projectform.type")}</span><select name="event_type"></select></label>
          <label class="pf-field pf-wide"><span>${t("projectform.event_title")}</span><input name="title" maxlength="200" autocomplete="off" placeholder="${t("projectform.event_title_placeholder")}"></label>
          <label class="pf-field pf-wide"><span>${t("projectform.order")}</span><span class="pf-order"></span></label>
          <div class="pf-order-hint pf-wide"></div>
          <label class="pf-field"><span>${t("projectform.start")}</span><span class="pf-start"></span></label>
          <label class="pf-field"><span>${t("projectform.end")}</span><span class="pf-end"></span></label>
          <div class="pf-time-hint pf-wide"></div>
          <div class="pf-field pf-wide"><span>${t("projectform.technicians")}</span><div class="pf-people"></div></div>
        </div>
      </fieldset>

      <p class="pf-error" role="alert" hidden></p>
    </div>

    <footer class="pf-foot">
      <button type="button" class="btn" data-cancel>${t("projectform.cancel")}</button>
      <button type="submit" class="btn btn-primary">${t("projectform.submit")}</button>
    </footer>
  </form>`;

export class ProjectForm {
  /** @param {{ onCreated: (project) => void }} opts */
  constructor({ onCreated }) {
    this.onCreated = onCreated;
    this.dialog = document.createElement("dialog");
    this.dialog.className = "pf-dialog";
    this.dialog.setAttribute("aria-labelledby", "pf-title");
    this.dialog.innerHTML = html;
    document.body.append(this.dialog);

    this.form = this.dialog.querySelector("form");
    this.errorEl = this.dialog.querySelector(".pf-error");
    this.submitBtn = this.dialog.querySelector("[type=submit]");
    const typeSel = this.form.elements.event_type;
    for (const [value, label] of Object.entries(EVENT_TYPE)) typeSel.append(new Option(label, value));

    this.form.elements.with_event.addEventListener("change", () => this.#syncEventFields());
    this.dialog.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => this.dialog.close()));
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.#submit();
    });
    // Clic sullo sfondo: chiude
    this.dialog.addEventListener("click", (e) => { if (e.target === this.dialog) this.dialog.close(); });
  }

  /** @param {{ date?: string }} [opts] date: data del primo intervento (es. dal tasto destro sul calendario) */
  async open({ date = null } = {}) {
    this.form.reset();
    await Promise.all([people.load(), customers.load(true)]);
    this.customer = customerSelect(null);
    this.dialog.querySelector(".pf-customer").replaceChildren(this.customer);
    // Commessa of the first intervention: follows the customer chosen above
    this.order?.dispose();
    this.order = orderField(null);
    this.dialog.querySelector(".pf-order").replaceChildren(this.order.input);
    this.dialog.querySelector(".pf-order-hint").replaceChildren(this.order.hint);
    this.customer.addEventListener("change", (e) => {
      const v = e.target.value;
      this.order.setCustomer(!v ? null : /^\d+$/.test(v) ? Number(v) : "new");
    });
    this.picker = participantPicker([], { label: t("projectform.technicians") });
    this.dialog.querySelector(".pf-people").replaceChildren(this.picker);
    this.form.elements.event_date.value = date ?? todayIso();
    // Orari a passi di 30 minuti, proposti in base agli interventi già presenti nella data
    this.timesAbort?.abort();
    this.timesAbort = new AbortController();
    this.start = timeSelect("", { label: t("projectform.start") });
    this.end = timeSelect("", { label: t("projectform.end") });
    this.dialog.querySelector(".pf-start").replaceChildren(this.start);
    this.dialog.querySelector(".pf-end").replaceChildren(this.end);
    const times = linkTimes(this.form.elements.event_date, this.start, this.end, { signal: this.timesAbort.signal });
    this.dialog.querySelector(".pf-time-hint").replaceChildren(times.hint);
    this.#syncEventFields();
    this.#error(null);
    this.dialog.showModal();
    this.form.elements.name.focus();
  }

  #syncEventFields() {
    const on = this.form.elements.with_event.checked;
    const box = this.dialog.querySelector(".pf-grid");
    box.querySelectorAll("input, select, button").forEach((el) => { el.disabled = !on; });
    box.classList.toggle("off", !on);
    // the commessa also needs a customer
    if (on && this.order) this.order.input.disabled = this.order.disabledByCustomer();
  }

  #error(message, field = null) {
    this.form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    this.errorEl.hidden = !message;
    this.errorEl.textContent = message ?? "";
    if (field) {
      const el = this.form.elements[field];
      el?.classList.add("invalid");
      el?.focus();
    }
  }

  async #submit() {
    const f = this.form.elements;
    const name = f.name.value.trim();
    if (!name) return this.#error(t("projectform.name_required"), "name");

    let customerId;
    try {
      customerId = await this.customer.getValue(); // crea il cliente nuovo, se scritto
    } catch (err) {
      return this.#error(t("projectform.customer_error", { error: err.message }));
    }
    const payload = { name, description: f.description.value, customer_id: customerId };
    if (f.with_event.checked) {
      if (!f.event_date.value) return this.#error(t("projectform.date_required"), "event_date");
      if (this.start.value && this.end.value && this.end.value <= this.start.value) {
        this.end.focus();
        return this.#error(t("projectform.end_before_start"));
      }
      payload.first_event = {
        event_date: f.event_date.value,
        event_type: f.event_type.value,
        title: f.title.value,
        start_time: this.start.value,
        end_time: this.end.value,
        participant_ids: this.picker.getIds(),
        ...(customerId != null && { order_code: this.order.input.value.trim() }),
      };
    }

    this.#error(null);
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = t("projectform.creating");
    try {
      const project = await createProject(payload);
      this.dialog.close();
      this.onCreated(project);
    } catch (err) {
      this.#error(err.message, err.isConflict ? "name" : null);
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = t("projectform.submit");
    }
  }
}
