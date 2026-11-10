// Finestra "Nuovo progetto", con primo intervento facoltativo.

import { createProject } from "./api.js";
import { todayIso } from "./dates.js";
import { EVENT_TYPE } from "./labels.js";
import { customerSelect, customers } from "./customers.js";
import { participantPicker, people } from "./people.js";
import { linkTimes, timeSelect } from "./timepick.js";

const html = `
  <form method="dialog" class="pf" novalidate>
    <header class="pf-head">
      <h2 id="pf-title">Nuovo progetto</h2>
      <button type="button" class="icon-btn" data-cancel aria-label="Chiudi">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </header>

    <div class="pf-body">
      <label class="pf-field">
        <span>Nome del progetto <em>*</em></span>
        <input name="name" required maxlength="200" autocomplete="off" placeholder="Es. Delta Energia – migrazione RHEL 9">
      </label>
      <div class="pf-field">
        <span>Cliente</span>
        <div class="pf-customer"></div>
      </div>
      <label class="pf-field">
        <span>Descrizione</span>
        <textarea name="description" rows="2" maxlength="2000" placeholder="Facoltativa"></textarea>
      </label>

      <fieldset class="pf-event">
        <legend>
          <label class="pf-toggle"><input type="checkbox" name="with_event" checked> Primo intervento</label>
        </legend>
        <p class="muted pf-note">Senza un intervento il progetto non compare nel calendario.</p>
        <div class="pf-grid">
          <label class="pf-field"><span>Data <em>*</em></span><input type="date" name="event_date" required></label>
          <label class="pf-field"><span>Tipo</span><select name="event_type"></select></label>
          <label class="pf-field pf-wide"><span>Titolo</span><input name="title" maxlength="200" autocomplete="off" placeholder="Es. prima finestra"></label>
          <label class="pf-field"><span>Ora inizio</span><span class="pf-start"></span></label>
          <label class="pf-field"><span>Ora fine</span><span class="pf-end"></span></label>
          <div class="pf-time-hint pf-wide"></div>
          <div class="pf-field pf-wide"><span>Tecnici</span><div class="pf-people"></div></div>
        </div>
      </fieldset>

      <p class="pf-error" role="alert" hidden></p>
    </div>

    <footer class="pf-foot">
      <button type="button" class="btn" data-cancel>Annulla</button>
      <button type="submit" class="btn btn-primary">Crea progetto</button>
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
    this.picker = participantPicker([], { label: "Tecnici" });
    this.dialog.querySelector(".pf-people").replaceChildren(this.picker);
    this.form.elements.event_date.value = date ?? todayIso();
    // Orari a passi di 30 minuti, proposti in base agli interventi già presenti nella data
    this.timesAbort?.abort();
    this.timesAbort = new AbortController();
    this.start = timeSelect("", { label: "Ora inizio" });
    this.end = timeSelect("", { label: "Ora fine" });
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
    if (!name) return this.#error("Il nome del progetto è obbligatorio.", "name");

    let customerId;
    try {
      customerId = await this.customer.getValue(); // crea il cliente nuovo, se scritto
    } catch (err) {
      return this.#error(`Cliente: ${err.message}`);
    }
    const payload = { name, description: f.description.value, customer_id: customerId };
    if (f.with_event.checked) {
      if (!f.event_date.value) return this.#error("Indica la data dell'intervento.", "event_date");
      if (this.start.value && this.end.value && this.end.value <= this.start.value) {
        this.end.focus();
        return this.#error("L'ora di fine deve essere successiva all'ora di inizio.");
      }
      payload.first_event = {
        event_date: f.event_date.value,
        event_type: f.event_type.value,
        title: f.title.value,
        start_time: this.start.value,
        end_time: this.end.value,
        participant_ids: this.picker.getIds(),
      };
    }

    this.#error(null);
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Creazione…";
    try {
      const project = await createProject(payload);
      this.dialog.close();
      this.onCreated(project);
    } catch (err) {
      this.#error(err.message, err.isConflict ? "name" : null);
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = "Crea progetto";
    }
  }
}
