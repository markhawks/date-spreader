// Tecnici: elenco condiviso, selettore dei partecipanti, finestra di gestione.

import { addTechnician, createUser, fetchUsers, patchUser, temporaryPassword } from "./api.js";

const NEW_TECH = "__new__";

const fmtDateTime = (iso) =>
  new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

const ROLES = { tecnico: "Tecnico", coordinatore: "Coordinatore", admin: "Amministratore" };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// ---------------------------------------------------------------------------
// Elenco condiviso: un solo caricamento, avvisa i componenti quando cambia.
// ---------------------------------------------------------------------------
class PeopleStore {
  constructor() {
    this.users = [];          // tutti, anche i disattivati
    this.listeners = new Set();
    this.loading = null;
  }

  /** Carica l'elenco (una volta sola, salvo `force`). */
  load(force = false) {
    if (this.loading && !force) return this.loading;
    this.loading = fetchUsers(true).then((users) => {
      this.users = users;
      this.listeners.forEach((fn) => fn(users));
      return users;
    });
    return this.loading;
  }

  active() { return this.users.filter((u) => u.is_active); }
  byId(id) { return this.users.find((u) => u.id === Number(id)); }
  /** Nome da mostrare, segnalando i disattivati. */
  label(u) { return u.is_active === false ? `${u.display_name} (disattivato)` : u.display_name; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const people = new PeopleStore();

// ---------------------------------------------------------------------------
// Selettore partecipanti: etichette con × e menu a tendina "+ Aggiungi tecnico".
// ---------------------------------------------------------------------------
/**
 * @param {number[]} selectedIds
 * @param {{ onChange?: (ids: number[]) => (void|Promise<unknown>), label?: string }} opts
 *   Se onChange restituisce una Promise che fallisce, la scelta viene annullata.
 * @returns {HTMLElement & { getIds: () => number[] }}
 */
export function participantPicker(selectedIds, { onChange = () => {}, label = "Partecipanti" } = {}) {
  let ids = [...new Set(selectedIds.map(Number))];
  const root = el("div", "picker");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", label);

  async function commit(next) {
    const prev = ids;
    ids = next;
    render();
    root.classList.add("saving");
    try {
      await onChange([...ids]);
    } catch {
      ids = prev; // salvataggio non riuscito: torna come prima
      render();
    } finally {
      root.classList.remove("saving");
    }
  }

  function render() {
    const chips = ids.map((id) => {
      const u = people.byId(id);
      const chip = el("span", `chip-person${u && !u.is_active ? " inactive" : ""}`);
      chip.append(el("span", null, u ? people.label(u) : `#${id}`));
      const x = el("button", "chip-x");
      x.type = "button";
      x.textContent = "×";
      x.setAttribute("aria-label", `Togli ${u?.display_name ?? id}`);
      x.addEventListener("click", () => commit(ids.filter((i) => i !== id)));
      chip.append(x);
      return chip;
    });

    const select = el("select", "picker-select");
    select.setAttribute("aria-label", `Aggiungi a ${label.toLowerCase()}`);
    const available = people.active().filter((u) => !ids.includes(u.id));
    select.append(new Option("+ Aggiungi tecnico…", ""));
    for (const u of available) select.append(new Option(u.display_name, String(u.id)));
    select.append(new Option("+ Nuovo tecnico…", NEW_TECH));
    select.addEventListener("change", () => {
      if (select.value === NEW_TECH) showNewForm();
      else if (select.value) commit([...ids, Number(select.value)]);
    });

    root.replaceChildren(...chips, select);
  }

  /** Campo per un tecnico non ancora in elenco: se il nome esiste già si usa quello, altrimenti va nel database. */
  function showNewForm() {
    const box = el("span", "picker-new");
    const input = el("input", "picker-new-input");
    Object.assign(input, { type: "text", maxLength: 200, placeholder: "Nome e cognome", autocomplete: "off" });
    input.setAttribute("aria-label", "Nome del nuovo tecnico");
    const ok = el("button", "btn btn-small btn-primary", "Aggiungi");
    ok.type = "button";
    const cancel = el("button", "btn btn-small", "Annulla");
    cancel.type = "button";
    const msg = el("span", "picker-new-msg error-text");
    msg.setAttribute("role", "alert");
    box.append(input, ok, cancel, msg);
    root.replaceChildren(...root.querySelectorAll(".chip-person"), box);
    input.focus();

    async function submit() {
      const name = input.value.trim().replace(/\s+/g, " ");
      if (!name) { msg.textContent = "Scrivi il nome."; input.focus(); return; }
      ok.disabled = input.disabled = true;
      msg.textContent = "";
      try {
        const user = await addTechnician(name);
        await people.load(true); // il nuovo tecnico compare in tutti i menu
        if (ids.includes(user.id)) { render(); return; }
        await commit([...ids, user.id]);
      } catch (err) {
        ok.disabled = input.disabled = false;
        msg.textContent = err.message;
        input.focus();
      }
    }
    ok.addEventListener("click", submit);
    cancel.addEventListener("click", () => render());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); render(); }
    });
  }

  render();
  const off = people.onChange(() => { if (root.isConnected) render(); else off(); });
  root.getIds = () => [...ids];
  return root;
}

// ---------------------------------------------------------------------------
// Finestra "Tecnici": elenco modificabile + aggiunta.
// ---------------------------------------------------------------------------
export class PeopleDialog {
  /** @param {{ toast?: (msg: string) => void }} opts */
  constructor({ toast = () => {} } = {}) {
    this.toast = toast;
    this.dialog = el("dialog", "pf-dialog people-dialog");
    this.dialog.setAttribute("aria-labelledby", "people-title");
    this.dialog.innerHTML = `
      <div class="pf">
        <header class="pf-head">
          <h2 id="people-title">Utenti</h2>
          <button type="button" class="icon-btn" data-close aria-label="Chiudi">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </header>
        <div class="pf-body">
          <p class="muted pf-note">Le modifiche si salvano da sole. Un utente non si cancella: si <strong>disattiva</strong>
            (sparisce dai menu e non può accedere, ma resta negli interventi e nella cronologia).
            Per far accedere qualcuno genera una <strong>password temporanea</strong>: al primo accesso dovrà cambiarla.</p>
          <div class="temp-pw" hidden></div>
          <div class="table-wrap"><table class="people-table">
            <thead><tr><th>Nome</th><th>Email aziendale</th><th>Nome utente</th><th>Ruolo</th><th>Accesso al portale</th><th>Attivo</th></tr></thead>
            <tbody></tbody>
          </table></div>
          <form class="people-add" novalidate>
            <h3>Aggiungi utente</h3>
            <div class="people-add-grid">
              <label class="pf-field"><span>Nome <em>*</em></span><input name="display_name" maxlength="200" autocomplete="off" placeholder="Nome e cognome"></label>
              <label class="pf-field"><span>Email</span><input name="email" type="email" maxlength="255" autocomplete="off" placeholder="facoltativa"></label>
              <label class="pf-field"><span>Nome utente</span><input name="username" maxlength="50" autocomplete="off" placeholder="facoltativo"></label>
              <label class="pf-field"><span>Ruolo</span><select name="role"></select></label>
              <button type="submit" class="btn btn-primary">Aggiungi</button>
            </div>
            <p class="pf-error" role="alert" hidden></p>
          </form>
        </div>
      </div>`;
    document.body.append(this.dialog);
    this.tbody = this.dialog.querySelector("tbody");
    this.form = this.dialog.querySelector("form");
    this.errorEl = this.form.querySelector(".pf-error");
    this.tempBox = this.dialog.querySelector(".temp-pw");
    for (const [v, l] of Object.entries(ROLES)) this.form.elements.role.append(new Option(l, v));

    this.dialog.querySelector("[data-close]").addEventListener("click", () => this.dialog.close());
    this.dialog.addEventListener("click", (e) => { if (e.target === this.dialog) this.dialog.close(); });
    this.form.addEventListener("submit", (e) => { e.preventDefault(); this.#add(); });
    people.onChange(() => { if (this.dialog.open && !this.dialog.contains(document.activeElement)) this.#render(); });
  }

  async open() {
    this.form.reset();
    this.tempBox.hidden = true;
    this.#formError(null);
    this.dialog.showModal();
    await people.load(true);
    this.#render();
    this.form.elements.display_name.focus();
  }

  #render() {
    const users = [...people.users].sort((a, b) => (b.is_active - a.is_active) || a.display_name.localeCompare(b.display_name, "it"));
    this.tbody.replaceChildren(...users.map((u) => this.#row(u)));
  }

  #row(user) {
    const tr = el("tr", user.is_active ? null : "inactive");
    let current = { ...user };

    const name = el("input", "cell-input");
    name.value = user.display_name;
    name.setAttribute("aria-label", "Nome");
    const email = el("input", "cell-input");
    email.type = "email";
    email.value = user.email ?? "";
    email.placeholder = "—";
    email.setAttribute("aria-label", "Email aziendale");
    const username = el("input", "cell-input mono");
    username.value = user.username ?? "";
    username.placeholder = "—";
    username.autocomplete = "off";
    username.setAttribute("aria-label", "Nome utente");
    const role = el("select", "cell-input");
    role.setAttribute("aria-label", "Ruolo");
    for (const [v, l] of Object.entries(ROLES)) role.append(new Option(l, v));
    role.value = user.role;
    const active = el("input");
    active.type = "checkbox";
    active.checked = user.is_active;
    active.setAttribute("aria-label", "Attivo");

    const fill = (u) => {
      current = { ...u };
      if (document.activeElement !== name) name.value = u.display_name;
      if (document.activeElement !== email) email.value = u.email ?? "";
      if (document.activeElement !== username) username.value = u.username ?? "";
      renderAccess(u);
      role.value = u.role;
      active.checked = u.is_active;
      tr.classList.toggle("inactive", !u.is_active);
    };

    const save = async (field, value, control) => {
      const td = control.closest("td");
      td.classList.remove("error");
      td.classList.add("saving");
      try {
        const updated = await patchUser(current.id, { version: current.version, [field]: value });
        fill(updated);
        td.classList.add("saved");
        setTimeout(() => td.classList.remove("saved"), 1200);
        people.load(true); // aggiorna menu, filtri e selettori in tutta l'app
      } catch (err) {
        if (err.isConflict && err.current) fill(err.current);
        else fill(current);
        td.classList.add("error");
        control.title = err.message;
        this.toast(err.message);
      } finally {
        td.classList.remove("saving");
      }
    };

    name.addEventListener("change", () => save("display_name", name.value, name));
    email.addEventListener("change", () => save("email", email.value, email));
    username.addEventListener("change", () => save("username", username.value, username));
    role.addEventListener("change", () => save("role", role.value, role));
    active.addEventListener("change", () => save("is_active", active.checked, active));
    const saved = (c) => (c === name ? current.display_name : c === email ? current.email ?? "" : current.username ?? "");
    for (const c of [name, email, username]) {
      c.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); c.blur(); }
        if (e.key === "Escape" && c.value !== saved(c)) {
          e.preventDefault(); // annulla la cella, non chiude la finestra
          fill(current);
        }
      });
    }

    // Accesso: stato + pulsante "Password temporanea" (conferma con un secondo clic)
    const access = el("div", "access-cell");
    const renderAccess = (u) => {
      const state = !u.is_active ? ["muted", "Disattivato"]
        : !u.has_password ? ["muted", "Nessun accesso"]
        : u.must_change_password ? ["warn-text", "Password temporanea"]
        : ["ok-text", u.last_login_at ? `Ultimo accesso ${fmtDateTime(u.last_login_at)}` : "Mai entrato"];
      const label = el("span", `access-state ${state[0]}`, state[1]);
      const btn = el("button", "btn btn-small", u.has_password ? "Nuova password" : "Abilita accesso");
      btn.type = "button";
      btn.disabled = !u.is_active;
      btn.title = "Genera una password temporanea, da cambiare al primo accesso";
      btn.addEventListener("click", async () => {
        if (!btn.classList.contains("confirm")) {
          btn.classList.add("confirm");
          btn.textContent = "Confermi?";
          setTimeout(() => { if (btn.isConnected) renderAccess(current); }, 4000);
          return;
        }
        btn.disabled = true;
        try {
          const { password } = await temporaryPassword(current.id);
          this.#showTemp(current, password);
          await people.load(true);
          const fresh = people.byId(current.id);
          if (fresh) fill(fresh);
        } catch (err) {
          this.toast(err.message);
          renderAccess(current);
        }
      });
      access.replaceChildren(label, btn);
    };
    renderAccess(user);

    for (const c of [name, email, username, role, access, active]) {
      const td = el("td");
      if (c === active) td.className = "center";
      td.append(c);
      if (c === name && user.is_demo) {
        const tag = el("span", "tag-demo", "esempio");
        tag.title = "Tecnico di esempio: si toglie con «python -m app.cli demo remove»";
        td.classList.add("has-tag");
        td.append(tag);
      }
      tr.append(td);
    }
    return tr;
  }

  /** Mostra la password temporanea una sola volta, con il pulsante per copiarla. */
  #showTemp(user, password) {
    const login = user.username || user.email;
    this.tempBox.replaceChildren();
    const text = el("div");
    text.append(
      el("strong", null, `Password temporanea per ${user.display_name}: `),
      el("code", "temp-code", password),
    );
    const info = el("p", "muted small", login
      ? `Accesso con «${login}». Comunicala di persona o in modo sicuro: viene mostrata solo ora e al primo accesso andrà cambiata.`
      : "Attenzione: l'utente non ha né email né nome utente. Impostane uno per permettergli di accedere.");
    const copy = el("button", "btn btn-small", "Copia");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(password); copy.textContent = "Copiata"; }
      catch { copy.textContent = "Selezionala e copiala a mano"; }
    });
    const hide = el("button", "btn btn-small", "Nascondi");
    hide.type = "button";
    hide.addEventListener("click", () => { this.tempBox.hidden = true; this.tempBox.replaceChildren(); });
    const actions = el("div", "temp-actions");
    actions.append(copy, hide);
    this.tempBox.append(text, info, actions);
    this.tempBox.hidden = false;
    this.tempBox.scrollIntoView({ block: "nearest" });
  }

  #formError(message, field) {
    this.form.querySelectorAll(".invalid").forEach((x) => x.classList.remove("invalid"));
    this.errorEl.hidden = !message;
    this.errorEl.textContent = message ?? "";
    if (field) {
      this.form.elements[field].classList.add("invalid");
      this.form.elements[field].focus();
    }
  }

  async #add() {
    const f = this.form.elements;
    if (!f.display_name.value.trim()) return this.#formError("Il nome è obbligatorio.", "display_name");
    const btn = this.form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const u = await createUser({ display_name: f.display_name.value, email: f.email.value, username: f.username.value, role: f.role.value });
      this.form.reset();
      this.#formError(null);
      await people.load(true);
      this.#render();
      this.tbody.querySelector(`tr:nth-child(${[...this.tbody.children].findIndex((r) => r.querySelector("input").value === u.display_name) + 1})`)?.classList.add("added");
      this.toast(`${u.display_name} aggiunto agli utenti.`);
      f.display_name.focus();
    } catch (err) {
      const field = /email/i.test(err.message) ? "email" : "display_name";
      this.#formError(err.message, field);
    } finally {
      btn.disabled = false;
    }
  }
}
