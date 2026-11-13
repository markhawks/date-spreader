// Filtri del calendario: stato dell'intervento, tecnico, "solo con problemi".
// Restano attivi cambiando mese e vengono ricordati nel browser.

import { EVENT_STATUS } from "./labels.js";
import { t } from "./i18n.js";

const STORE = "datespreader.filters";

const EMPTY = () => ({ statuses: [], userId: "", customerId: "", problems: false });

function load() {
  try {
    const f = JSON.parse(localStorage.getItem(STORE));
    return f ? { ...EMPTY(), ...f } : EMPTY();
  } catch { return EMPTY(); }
}

export class FilterBar {
  /**
   * @param {{ barEl: HTMLElement, toggleBtn: HTMLButtonElement, onChange: (predicate) => void }} opts
   */
  constructor({ barEl, toggleBtn, onChange }) {
    this.barEl = barEl;
    this.toggleBtn = toggleBtn;
    this.onChange = onChange;
    this.state = load();
    this.users = [];
    this.customers = [];
    toggleBtn.addEventListener("click", () => this.#setOpen(this.barEl.hidden));
  }

  /** Da chiamare quando si conoscono i tecnici; disegna la barra e applica i filtri salvati. */
  setUsers(users) {
    this.users = users;
    if (this.state.userId && !users.some((u) => String(u.id) === this.state.userId)) this.state.userId = "";
    this.#render();
    this.#emit();
    if (this.activeCount && !this.initialized) this.#setOpen(true);
    this.initialized = true;
  }

  /** Clienti per il filtro (vale per calendario e colonna progetti). */
  setCustomers(list) {
    this.customers = list;
    if (this.state.customerId && !list.some((c) => String(c.id) === this.state.customerId)) this.state.customerId = "";
    if (this.clearBtn) {
      this.#render();
      this.#emit();
    }
  }

  /** Chooses the customer ("" = all) from outside the panel: menu, project column, calendar, card. */
  setCustomer(customerId) {
    this.state.customerId = customerId ? String(customerId) : "";
    if (this.clearBtn) this.#render();
    this.#emit();
  }

  get activeCount() {
    const s = this.state;
    return (s.statuses.length ? 1 : 0) + (s.userId ? 1 : 0) + (s.customerId ? 1 : 0) + (s.problems ? 1 : 0);
  }

  /** true se l'evento passa i filtri. */
  matches(ev) {
    const s = this.state;
    if (s.statuses.length && !s.statuses.includes(ev.status)) return false;
    if (s.userId && !(ev.user_ids ?? []).includes(Number(s.userId))) return false;
    if (s.customerId && ev.customer_id !== Number(s.customerId)) return false;
    if (s.problems && !(ev.check_ko > 0 || ev.migration_failed > 0)) return false;
    return true;
  }

  // ---------------------------------------------------------------------------

  #setOpen(open) {
    this.barEl.hidden = !open;
    this.toggleBtn.setAttribute("aria-expanded", String(open));
  }

  #emit() {
    try { localStorage.setItem(STORE, JSON.stringify(this.state)); } catch { /* ignora */ }
    const n = this.activeCount;
    this.toggleBtn.textContent = n ? t("filters.button_count", { n }) : t("filters.button");
    this.toggleBtn.classList.toggle("active", n > 0);
    this.clearBtn.hidden = n === 0;
    this.onChange(n ? (ev) => this.matches(ev) : null);
  }

  #render() {
    const group = document.createElement("div");
    group.className = "filter-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t("filters.status_group"));
    group.append(Object.assign(document.createElement("span"), { className: "filter-label", textContent: t("filters.status") }));
    for (const [value, label] of Object.entries(EVENT_STATUS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-chip";
      b.textContent = label;
      const sync = () => b.setAttribute("aria-pressed", String(this.state.statuses.includes(value)));
      sync();
      b.addEventListener("click", () => {
        const set = new Set(this.state.statuses);
        set.has(value) ? set.delete(value) : set.add(value);
        this.state.statuses = [...set];
        sync();
        this.#emit();
      });
      group.append(b);
    }

    const userLabel = document.createElement("label");
    userLabel.className = "filter-group";
    userLabel.append(Object.assign(document.createElement("span"), { className: "filter-label", textContent: t("filters.technician") }));
    const userSel = document.createElement("select");
    userSel.className = "filter-select";
    userSel.append(new Option(t("filters.all"), ""));
    for (const u of this.users) {
      userSel.append(new Option(u.is_active === false ? t("filters.inactive_name", { name: u.display_name }) : u.display_name, String(u.id)));
    }
    userSel.value = this.state.userId;
    userSel.addEventListener("change", () => { this.state.userId = userSel.value; this.#emit(); });
    userLabel.append(userSel);

    const custLabel = document.createElement("label");
    custLabel.className = "filter-group";
    custLabel.title = t("filters.customer_title");
    custLabel.append(Object.assign(document.createElement("span"), { className: "filter-label", textContent: t("filters.customer") }));
    const custSel = document.createElement("select");
    custSel.className = "filter-select";
    custSel.append(new Option(t("filters.all"), ""));
    for (const c of this.customers) custSel.append(new Option(c.name, String(c.id)));
    custSel.value = this.state.customerId;
    custSel.addEventListener("change", () => { this.state.customerId = custSel.value; this.#emit(); });
    custLabel.append(custSel);

    const probLabel = document.createElement("label");
    probLabel.className = "filter-group filter-check";
    probLabel.title = t("filters.problems_title");
    const prob = document.createElement("input");
    prob.type = "checkbox";
    prob.checked = this.state.problems;
    prob.addEventListener("change", () => { this.state.problems = prob.checked; this.#emit(); });
    probLabel.append(prob, ` ${t("filters.problems")}`);

    this.clearBtn = document.createElement("button");
    this.clearBtn.type = "button";
    this.clearBtn.className = "btn btn-small";
    this.clearBtn.textContent = t("filters.clear");
    this.clearBtn.addEventListener("click", () => {
      this.state = EMPTY();
      this.#render();
      this.#emit();
    });

    this.barEl.replaceChildren(group, custLabel, userLabel, probLabel, this.clearBtn);
  }
}
