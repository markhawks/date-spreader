// Barra laterale: riquadri dei progetti (cliccabili) e ricerca rapida.

import { search } from "./api.js";
import { colorFor, paint } from "./colors.js";
import { formatShortDate, todayIso } from "./dates.js";
import { CHECK_STATUS, MIGRATION_STATUS, badge } from "./labels.js";
import { locale, t } from "./i18n.js";

const SEARCH_DELAY_MS = 250;
const MAX_HITS = 30;

/** Minuscolo e senza accenti, per una ricerca tollerante. */
const normalize = (s) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Iniziali delle prime due parole che iniziano con lettera o cifra ("Delta - Update" → "MU"). */
const initials = (name) =>
  name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

/** Prossimo intervento da oggi in poi; altrimenti l'ultimo passato. */
function referenceEvent(project, today) {
  const events = project.events;
  if (!events.length) return null;
  const next = events.find((e) => e.event_date >= today);
  return next ? { event: next, upcoming: true } : { event: events.at(-1), upcoming: false };
}

export class Sidebar {
  /**
   * @param {{ listEl, searchEl, emptyEl, countEl, serversEl,
   *           onSelect?: (project, tileEl: HTMLElement) => void,
   *           onServerHit?: (hit) => void }} opts
   */
  constructor({ listEl, searchEl, emptyEl, countEl, serversEl, onSelect, onServerHit, onCreate, onEdit }) {
    Object.assign(this, { listEl, searchEl, emptyEl, countEl, serversEl });
    this.onSelect = onSelect ?? (() => {});
    this.onEdit = onEdit ?? null;
    this.onCreate = onCreate ?? null;
    this.onServerHit = onServerHit ?? (() => {});
    this.projects = [];
    this.query = "";
    this.searchToken = 0;
    this.view = "grid";
    this.group = "none";          // "customer" = raggruppa per cliente
    this.customerFilter = null;   // id cliente dal pannello Filtri (null = tutti)
    this.sort = "name";
    searchEl.addEventListener("input", () => {
      this.query = searchEl.value;
      this.#applyFilter();
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.#searchServers(), SEARCH_DELAY_MS);
    });
    listEl.addEventListener("click", (e) => {
      if (e.target.closest(".add-tile")) {
        this.onCreate?.();
        return;
      }
      const edit = e.target.closest(".tile-edit");
      if (edit) {
        const p = this.projects.find((x) => x.id === Number(edit.dataset.projectId));
        if (p) this.onEdit?.(p);
        return;
      }
      const tile = e.target.closest(".project-tile");
      if (!tile) return;
      const project = this.projects.find((p) => p.id === Number(tile.dataset.projectId));
      if (project) this.onSelect(project, tile);
    });
  }

  /** Vista ("grid" quadrati | "list" rettangoli) e ordinamento ("name" | "date"). */
  /** Mostra solo i progetti di un cliente (null = tutti). */
  setCustomerFilter(customerId) {
    this.customerFilter = customerId ? Number(customerId) : null;
    this.#applyFilter();
  }

  setDisplay({ view, sort, group }) {
    if (group) this.group = group;
    if (view) this.view = view;
    if (sort) this.sort = sort;
    this.listEl.classList.toggle("list", this.view === "list");
    if (this.projects.length || this.onCreate) this.setProjects(this.projects);
  }

  /**
   * Ordinamento "per data": prima i progetti con il prossimo intervento più vicino,
   * poi quelli con soli interventi passati (dal più recente), infine quelli senza interventi.
   */
  #sorted(projects, today) {
    const byName = (a, b) => a.name.localeCompare(b.name, locale(), { sensitivity: "base" });
    if (this.sort !== "date") return [...projects].sort(byName);
    const key = (p) => {
      const next = p.events.find((e) => e.event_date >= today);
      if (next) return [0, next.event_date];
      if (p.events.length) return [1, p.events.at(-1).event_date];
      return [2, ""];
    };
    return [...projects].sort((a, b) => {
      const [ga, da] = key(a);
      const [gb, db] = key(b);
      if (ga !== gb) return ga - gb;
      if (da !== db) return ga === 1 ? (da < db ? 1 : -1) : (da < db ? -1 : 1); // passati: dal più recente
      return byName(a, b);
    });
  }

  setProjects(projects) {
    this.projects = projects;
    const today = todayIso();
    const active = this.listEl.querySelector(".project-tile.active")?.dataset.projectId;
    const sorted = this.#sorted(projects, today);
    let tiles;
    if (this.group === "customer") {
      // Un'intestazione per cliente (in ordine alfabetico), "Senza cliente" in fondo
      const groups = new Map();
      for (const p of sorted) {
        const key = p.customer_name ?? "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }
      const keys = [...groups.keys()].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, locale(), { sensitivity: "base" }));
      tiles = keys.flatMap((key) => [this.#groupHead(key, groups.get(key)), ...groups.get(key).map((p) => this.#tile(p, today))]);
    } else {
      tiles = sorted.map((p) => this.#tile(p, today));
    }
    if (this.onCreate) tiles.push(this.#addTile());
    this.listEl.replaceChildren(...tiles);
    if (active) this.setActive(Number(active));
    this.#applyFilter();
  }

  /** Evidenzia il progetto attivo (null per nessuno). */
  setActive(projectId) {
    for (const tile of this.listEl.querySelectorAll(".project-tile")) {
      const on = Number(tile.dataset.projectId) === projectId;
      tile.classList.toggle("active", on);
      tile.setAttribute("aria-pressed", String(on));
    }
  }

  #groupHead(name, projects) {
    const li = document.createElement("li");
    li.className = "group-head";
    li.dataset.group = name;
    const title = document.createElement("span");
    title.className = "group-name";
    title.textContent = name || t("sidebar.no_customer");
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = projects.length;
    li.append(title, count);
    return li;
  }

  /** Riquadro "+ Nuovo progetto", sempre visibile in fondo all'elenco. */
  #addTile() {
    const li = document.createElement("li");
    li.className = "add-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "project-tile add-tile";
    btn.title = t("sidebar.add_title");
    btn.innerHTML =
      '<svg class="add-icon" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">' +
      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' +
      `<span class="add-label">${t("sidebar.add_label")}</span>`;
    li.append(btn);
    return li;
  }

  #tile(project, today) {
    const li = document.createElement("li");
    li.dataset.search = normalize(`${project.name} ${project.description ?? ""} ${project.customer_name ?? ""}`);
    li.dataset.customer = project.customer_id ?? "";
    li.dataset.group = project.customer_name ?? "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "project-tile";
    btn.dataset.projectId = project.id;
    btn.setAttribute("aria-pressed", "false");
    paint(btn, project.id);

    const badge = document.createElement("span");
    badge.className = "tile-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = initials(project.name);

    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = project.name;

    const meta = document.createElement("span");
    meta.className = "tile-meta";
    const ref = referenceEvent(project, today);
    const n = project.events.length;
    const date = ref ? formatShortDate(ref.event.event_date) : "";
    meta.textContent = ref
      ? t(ref.upcoming ? "sidebar.meta_next" : "sidebar.meta_last", { date })
      : t("sidebar.meta_none");
    meta.title = ref
      ? t(ref.upcoming ? "sidebar.meta_next_title" : "sidebar.meta_last_title", { date })
      : t("sidebar.meta_none_title");

    btn.title = [project.customer_name, project.name, project.description].filter(Boolean).join(" · ");
    btn.append(badge, name, meta);
    if (project.customer_name && this.group !== "customer") {
      const cust = document.createElement("span");
      cust.className = "tile-customer";
      cust.textContent = project.customer_name;
      btn.append(cust);
    }
    const tags = document.createElement("span");
    tags.className = "tile-tags";
    if (n > 1) {
      const count = document.createElement("span");
      count.className = "tile-count";
      count.textContent = t("sidebar.dates_count", { n });
      tags.append(count);
    }
    if (project.is_demo) {
      const demo = document.createElement("span");
      demo.className = "tag-demo";
      demo.textContent = t("sidebar.demo_tag");
      demo.title = t("sidebar.demo_title");
      tags.append(demo);
      btn.classList.add("is-demo");
    }
    if (tags.childElementCount) btn.append(tags);
    li.append(btn);
    if (this.onEdit) {
      // Pulsante separato (non dentro il riquadro: niente pulsanti annidati)
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "tile-edit";
      edit.dataset.projectId = project.id;
      edit.title = t("sidebar.edit_title");
      edit.setAttribute("aria-label", t("sidebar.edit_label", { name: project.name }));
      edit.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      li.append(edit);
    }
    return li;
  }

  /** Cerca i server (hostname, IP, sistema operativo) negli interventi. */
  async #searchServers() {
    const q = this.query.trim();
    const token = ++this.searchToken;
    if (q.length < 2) {
      this.serversEl.replaceChildren();
      this.serversEl.hidden = true;
      return;
    }
    let result;
    try {
      result = await search(q);
    } catch (err) {
      if (token !== this.searchToken) return;
      this.serversEl.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: t("sidebar.search_failed", { error: err.message }) }));
      this.serversEl.hidden = false;
      return;
    }
    if (token !== this.searchToken) return; // nel frattempo l'utente ha scritto altro

    const head = document.createElement("h3");
    head.className = "hits-title";
    head.textContent = t("sidebar.servers_title", { count: `${result.servers.length}${result.servers.length >= 50 ? "+" : ""}` });
    const list = document.createElement("ul");
    list.className = "hits";
    for (const hit of result.servers.slice(0, MAX_HITS)) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hit";
      btn.style.setProperty("--c", colorFor(hit.project_id));
      btn.title = [hit.hostname, hit.ip_address, hit.operating_system].filter(Boolean).join(" · ");
      const host = Object.assign(document.createElement("span"), { className: "hit-host mono", textContent: hit.hostname });
      const where = Object.assign(document.createElement("span"), {
        className: "hit-where",
        textContent: `${hit.project_name} · ${formatShortDate(hit.event_date)}`,
      });
      const badges = document.createElement("span");
      badges.className = "hit-badges";
      badges.append(badge(hit.check_status, CHECK_STATUS), badge(hit.migration_status, MIGRATION_STATUS));
      btn.append(host, where, badges);
      btn.addEventListener("click", () => this.onServerHit(hit));
      li.append(btn);
      list.append(li);
    }
    const children = [head];
    if (result.servers.length) children.push(list);
    else children.push(Object.assign(document.createElement("p"), { className: "muted", textContent: t("sidebar.no_servers") }));
    if (result.servers.length > MAX_HITS) {
      children.push(Object.assign(document.createElement("p"), { className: "muted small", textContent: t("sidebar.too_many", { n: MAX_HITS }) }));
    }
    this.serversEl.replaceChildren(...children);
    this.serversEl.hidden = false;
  }

  #applyFilter() {
    const q = normalize(this.query.trim());
    let visible = 0;
    const perGroup = new Map();
    for (const li of this.listEl.children) {
      if (li.classList.contains("add-item") || li.classList.contains("group-head")) continue; // il "+" resta sempre visibile
      const show = (!q || li.dataset.search.includes(q))
        && (!this.customerFilter || Number(li.dataset.customer) === this.customerFilter);
      li.hidden = !show;
      if (show) {
        visible++;
        perGroup.set(li.dataset.group, (perGroup.get(li.dataset.group) ?? 0) + 1);
      }
    }
    // Intestazioni di cliente senza progetti visibili: nascoste
    for (const head of this.listEl.querySelectorAll(".group-head")) {
      const n = perGroup.get(head.dataset.group) ?? 0;
      head.hidden = n === 0;
      head.querySelector(".group-count").textContent = n;
    }
    this.emptyEl.hidden = visible > 0 || this.projects.length === 0;
    this.countEl.textContent = q ? `${visible}/${this.projects.length}` : `${this.projects.length}`;
  }
}


/**
 * Bordo trascinabile per la larghezza della colonna progetti.
 * @param {HTMLElement} handle  @param {HTMLElement} sidebar
 * @param {{ onEnd: (px: number) => void, min?: number, max?: number, initial?: number }} opts
 */
export function attachSidebarResizer(handle, sidebar, { onEnd, min = 200, max = 640, initial = 280 }) {
  const clamp = (px) => Math.round(Math.min(max, Math.max(min, px)));
  const set = (px) => document.documentElement.style.setProperty("--sidebar-w", `${px}px`);
  const now = () => sidebar.getBoundingClientRect().width;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("col-resizing");
    const left = sidebar.getBoundingClientRect().left;
    let px = null;
    const move = (ev) => { px = clamp(ev.clientX - left); set(px); };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.classList.remove("col-resizing");
      if (px !== null) onEnd(px);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
  handle.addEventListener("dblclick", () => { set(initial); onEnd(initial); });
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const px = clamp(now() + (e.key === "ArrowRight" ? 20 : -20));
    set(px);
    onEnd(px);
  });
}
