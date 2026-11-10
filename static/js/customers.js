// Clienti: elenco condiviso, menu a tendina (con "nuovo cliente"), finestra di gestione (amministratori).

import { createCustomer, deleteCustomer, fetchCustomers, patchCustomer, renameCustomer } from "./api.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const NEW = "__new__";

class CustomerStore {
  constructor() {
    this.list = [];
    this.listeners = new Set();
    this.loading = null;
  }

  load(force = false) {
    if (this.loading && !force) return this.loading;
    this.loading = fetchCustomers().then((list) => {
      this.list = list;
      this.listeners.forEach((fn) => fn(list));
      return list;
    });
    return this.loading;
  }

  byId(id) { return this.list.find((c) => c.id === Number(id)); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const customers = new CustomerStore();

/**
 * Menu a tendina del cliente, con "+ Nuovo cliente…" che apre un campo per crearlo al volo.
 * @returns {HTMLElement & { getValue: () => Promise<number|null> }}
 *   getValue crea il cliente nuovo se è stato scritto, e restituisce l'id (o null).
 */
export function customerSelect(selectedId = null) {
  const wrap = el("div", "customer-select");
  const select = el("select");
  select.setAttribute("aria-label", "Cliente");
  const input = el("input");
  Object.assign(input, { type: "text", maxLength: 200, placeholder: "Nome del nuovo cliente", hidden: true, autocomplete: "off" });
  input.setAttribute("aria-label", "Nome del nuovo cliente");
  const cancel = el("button", "btn btn-small", "Annulla");
  cancel.type = "button";
  cancel.hidden = true;

  const fill = (value) => {
    select.replaceChildren(new Option("— nessun cliente —", ""));
    for (const c of customers.list) select.append(new Option(c.name, String(c.id)));
    select.append(new Option("+ Nuovo cliente…", NEW));
    select.value = value == null ? "" : String(value);
  };
  fill(selectedId);

  const showNew = (on) => {
    select.hidden = on;
    input.hidden = !on;
    cancel.hidden = !on;
    if (on) input.focus();
  };
  select.addEventListener("change", () => { if (select.value === NEW) showNew(true); });
  cancel.addEventListener("click", () => { input.value = ""; fill(selectedId); showNew(false); select.focus(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); cancel.click(); } });

  wrap.append(select, input, cancel);
  wrap.getValue = async () => {
    if (!input.hidden) {
      const name = input.value.trim();
      if (!name) return selectedId ?? null;
      // Se esiste già (anche con maiuscole diverse) si usa quello
      const existing = customers.list.find((c) => c.name.toLowerCase() === name.replace(/\s+/g, " ").toLowerCase());
      if (existing) return existing.id;
      const created = await createCustomer(name);
      await customers.load(true);
      return created.id;
    }
    return select.value ? Number(select.value) : null;
  };
  return wrap;
}

// ---------------------------------------------------------------------------
// Gestione clienti (amministratori): rinomina, elimina se senza progetti
// ---------------------------------------------------------------------------
export async function showCustomersDialog({ toast = () => {}, onChanged = () => {} } = {}) {
  const dialog = el("dialog", "pf-dialog customers-dialog");
  dialog.setAttribute("aria-labelledby", "cust-title");
  dialog.innerHTML = `
    <div class="pf">
      <header class="pf-head">
        <h2 id="cust-title">Clienti</h2>
        <button type="button" class="icon-btn" data-close aria-label="Chiudi">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="pf-body">
        <p class="muted pf-note">I clienti si creano direttamente dai moduli dei progetti («+ Nuovo cliente…»). Qui si
          <strong>rinominano</strong> (il nome cambia su tutti i progetti), si sceglie il <strong>colore</strong> dei loro
          progetti in calendario e nella colonna progetti («Automatico» = colori assegnati dal portale), e si
          <strong>eliminano</strong> quelli senza progetti.</p>
        <div class="cust-list"></div>
        <form class="people-add cust-add" novalidate>
          <h3>Aggiungi cliente</h3>
          <div class="cust-add-grid">
            <label class="pf-field"><span>Nome</span><input name="name" maxlength="200" autocomplete="off"></label>
            <button type="submit" class="btn btn-primary">Aggiungi</button>
          </div>
          <p class="pf-error" role="alert" hidden></p>
        </form>
      </div>
    </div>`;
  document.body.append(dialog);
  const listEl = dialog.querySelector(".cust-list");
  const form = dialog.querySelector("form");
  const err = form.querySelector(".pf-error");
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());

  async function render() {
    const list = await customers.load(true);
    if (!list.length) {
      listEl.replaceChildren(el("p", "muted", "Nessun cliente."));
      return;
    }
    listEl.replaceChildren(...list.map((c) => {
      const row = el("div", "os-row cust-row");
      const name = el("input", "cell-input");
      name.value = c.name;
      name.setAttribute("aria-label", "Nome del cliente");
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); name.blur(); }
        if (e.key === "Escape" && name.value !== c.name) { e.preventDefault(); name.value = c.name; }
      });
      name.addEventListener("change", async () => {
        try {
          await renameCustomer(c.id, c.version, name.value);
          toast("Cliente rinominato.");
          onChanged();
          await render();
        } catch (ex) {
          toast(ex.message);
          name.value = c.name;
        }
      });
      // Colore: selettore + "Automatico" per tornare ai colori assegnati dal portale
      const colorBox = el("span", "cust-color");
      const picker = el("input");
      picker.type = "color";
      picker.value = c.color ?? "#9ca3af";
      picker.title = c.color ? `Colore dei progetti: ${c.color}` : "Colore automatico: scegline uno per tutti i progetti del cliente";
      picker.setAttribute("aria-label", `Colore dei progetti di ${c.name}`);
      picker.classList.toggle("auto", !c.color);
      const auto = el("button", "btn btn-small", "Automatico");
      auto.type = "button";
      auto.hidden = !c.color;
      auto.title = "Torna ai colori assegnati automaticamente";
      const saveColor = async (color) => {
        try {
          await patchCustomer(c.id, c.version, { color });
          toast(color ? "Colore aggiornato." : "Colori automatici ripristinati.");
          onChanged();
          await render();
        } catch (ex) { toast(ex.message); }
      };
      picker.addEventListener("change", () => saveColor(picker.value));
      auto.addEventListener("click", () => saveColor(null));
      colorBox.append(picker, auto);
      const count = el("span", "muted small", c.project_count === 1 ? "1 progetto" : `${c.project_count} progetti`);
      const del = el("button", "btn btn-small btn-danger-outline", "Elimina");
      del.type = "button";
      del.disabled = c.project_count > 0;
      del.title = c.project_count ? "Ha dei progetti: assegnali a un altro cliente prima di eliminarlo" : "Elimina";
      del.addEventListener("click", async () => {
        if (!del.classList.contains("confirm")) { del.classList.add("confirm"); del.textContent = "Confermi?"; return; }
        try {
          await deleteCustomer(c.id);
          onChanged();
          await render();
        } catch (ex) { toast(ex.message); }
      });
      const tags = el("span");
      if (c.is_demo) tags.append(el("span", "tag-demo", "esempio"));
      row.append(name, colorBox, tags, count, del);
      return row;
    }));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) { err.textContent = "Scrivi il nome del cliente."; err.hidden = false; return; }
    try {
      await createCustomer(name);
      form.reset();
      err.hidden = true;
      onChanged();
      await render();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  dialog.showModal();
  await render();
}
