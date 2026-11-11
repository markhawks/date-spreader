// Tecnici: elenco condiviso, selettore dei partecipanti, finestra di gestione.

import { addTechnician, createUser, fetchUsers, patchUser, temporaryPassword } from "./api.js";
import { locale, t } from "./i18n.js";

const NEW_TECH = "__new__";

const fmtDateTime = (iso) =>
  new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });

const ROLES = { tecnico: t("people.role.tecnico"), coordinatore: t("people.role.coordinatore"), admin: t("people.role.admin") };

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
  label(u) { return u.is_active === false ? t("people.inactive_name", { name: u.display_name }) : u.display_name; }
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
export function participantPicker(selectedIds, { onChange = () => {}, label = t("people.participants") } = {}) {
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
      x.setAttribute("aria-label", t("people.picker_remove", { name: u?.display_name ?? id }));
      x.addEventListener("click", () => commit(ids.filter((i) => i !== id)));
      chip.append(x);
      return chip;
    });

    const select = el("select", "picker-select");
    select.setAttribute("aria-label", t("people.picker_add_to", { label: label.toLowerCase() }));
    const available = people.active().filter((u) => !ids.includes(u.id));
    select.append(new Option(t("people.picker_add"), ""));
    for (const u of available) select.append(new Option(u.display_name, String(u.id)));
    select.append(new Option(t("people.picker_new"), NEW_TECH));
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
    Object.assign(input, { type: "text", maxLength: 200, placeholder: t("people.full_name_placeholder"), autocomplete: "off" });
    input.setAttribute("aria-label", t("people.new_tech_name"));
    const ok = el("button", "btn btn-small btn-primary", t("people.add"));
    ok.type = "button";
    const cancel = el("button", "btn btn-small", t("people.cancel"));
    cancel.type = "button";
    const msg = el("span", "picker-new-msg error-text");
    msg.setAttribute("role", "alert");
    box.append(input, ok, cancel, msg);
    root.replaceChildren(...root.querySelectorAll(".chip-person"), box);
    input.focus();

    async function submit() {
      const name = input.value.trim().replace(/\s+/g, " ");
      if (!name) { msg.textContent = t("people.name_missing"); input.focus(); return; }
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
          <h2 id="people-title">${t("people.title")}</h2>
          <button type="button" class="icon-btn" data-close aria-label="${t("people.close")}">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </header>
        <div class="pf-body">
          <p class="muted pf-note">${t("people.note_html")}</p>
          <div class="temp-pw" hidden></div>
          <div class="table-wrap"><table class="people-table">
            <thead><tr><th>${t("people.col.name")}</th><th>${t("people.col.email")}</th><th>${t("people.col.username")}</th><th>${t("people.col.role")}</th><th>${t("people.col.access")}</th><th>${t("people.col.active")}</th></tr></thead>
            <tbody></tbody>
          </table></div>
          <form class="people-add" novalidate>
            <h3>${t("people.add_user")}</h3>
            <div class="people-add-grid">
              <label class="pf-field"><span>${t("people.field.name")} <em>*</em></span><input name="display_name" maxlength="200" autocomplete="off" placeholder="${t("people.full_name_placeholder")}"></label>
              <label class="pf-field"><span>${t("people.field.email")}</span><input name="email" type="email" maxlength="255" autocomplete="off" placeholder="${t("people.field.email_placeholder")}"></label>
              <label class="pf-field"><span>${t("people.field.username")}</span><input name="username" maxlength="50" autocomplete="off" placeholder="${t("people.field.username_placeholder")}"></label>
              <label class="pf-field"><span>${t("people.field.role")}</span><select name="role"></select></label>
              <button type="submit" class="btn btn-primary">${t("people.add")}</button>
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
    const users = [...people.users].sort((a, b) => (b.is_active - a.is_active) || a.display_name.localeCompare(b.display_name, locale()));
    this.tbody.replaceChildren(...users.map((u) => this.#row(u)));
  }

  #row(user) {
    const tr = el("tr", user.is_active ? null : "inactive");
    let current = { ...user };

    const name = el("input", "cell-input");
    name.value = user.display_name;
    name.setAttribute("aria-label", t("people.col.name"));
    const email = el("input", "cell-input");
    email.type = "email";
    email.value = user.email ?? "";
    email.placeholder = "—";
    email.setAttribute("aria-label", t("people.col.email"));
    const username = el("input", "cell-input mono");
    username.value = user.username ?? "";
    username.placeholder = "—";
    username.autocomplete = "off";
    username.setAttribute("aria-label", t("people.col.username"));
    const role = el("select", "cell-input");
    role.setAttribute("aria-label", t("people.col.role"));
    for (const [v, l] of Object.entries(ROLES)) role.append(new Option(l, v));
    role.value = user.role;
    const active = el("input");
    active.type = "checkbox";
    active.checked = user.is_active;
    active.setAttribute("aria-label", t("people.col.active"));

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
      const state = !u.is_active ? ["muted", t("people.access.inactive")]
        : !u.has_password ? ["muted", t("people.access.none")]
        : u.must_change_password ? ["warn-text", t("people.access.temporary")]
        : ["ok-text", u.last_login_at ? t("people.access.last_login", { when: fmtDateTime(u.last_login_at) }) : t("people.access.never")];
      const label = el("span", `access-state ${state[0]}`, state[1]);
      const btn = el("button", "btn btn-small", u.has_password ? t("people.access.new_password") : t("people.access.enable"));
      btn.type = "button";
      btn.disabled = !u.is_active;
      btn.title = t("people.access.button_title");
      btn.addEventListener("click", async () => {
        if (!btn.classList.contains("confirm")) {
          btn.classList.add("confirm");
          btn.textContent = t("people.access.confirm");
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
        const tag = el("span", "tag-demo", t("people.demo_tag"));
        tag.title = t("people.demo_title");
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
      el("strong", null, t("people.temp.heading", { name: user.display_name })),
      el("code", "temp-code", password),
    );
    const info = el("p", "muted small", login
      ? t("people.temp.info", { login })
      : t("people.temp.no_login"));
    const copy = el("button", "btn btn-small", t("people.temp.copy"));
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(password); copy.textContent = t("people.temp.copied"); }
      catch { copy.textContent = t("people.temp.copy_failed"); }
    });
    const hide = el("button", "btn btn-small", t("people.temp.hide"));
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
    if (!f.display_name.value.trim()) return this.#formError(t("people.name_required"), "display_name");
    const btn = this.form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const u = await createUser({ display_name: f.display_name.value, email: f.email.value, username: f.username.value, role: f.role.value });
      this.form.reset();
      this.#formError(null);
      await people.load(true);
      this.#render();
      this.tbody.querySelector(`tr:nth-child(${[...this.tbody.children].findIndex((r) => r.querySelector("input").value === u.display_name) + 1})`)?.classList.add("added");
      this.toast(t("people.added", { name: u.display_name }));
      f.display_name.focus();
    } catch (err) {
      const field = /email/i.test(err.message) ? "email" : "display_name";
      this.#formError(err.message, field);
    } finally {
      btn.disabled = false;
    }
  }
}
