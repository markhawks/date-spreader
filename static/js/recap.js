// Recap for smartphones: a single read-only page for technicians and coordinators who are away
// from the office (the portal itself is meant for a desktop). It shows the interventions still
// to close, today's and the next 7 days', "mine" or "all"; tapping one shows its servers, and the
// only thing that can be changed is the intervention status.
//
// It starts by itself on small screens; "Full version" switches to the normal portal (remembered
// in the browser), and the "Recap" button of the normal portal on a phone switches back.

import { fetchEvent, fetchEvents, fetchProjects, logout } from "./api.js";
import { assignColors, colorFor } from "./colors.js";
import { addDays, formatLongDate, formatTime, parseIso, todayIso } from "./dates.js";
import { eventStatusControl } from "./eventstatus.js";
import { locale, t } from "./i18n.js";
import { EVENT_STATUS, EVENT_TYPE, MIGRATION_STATUS, badge, shortOs, stageDone, stageLabel } from "./labels.js";
import { people } from "./people.js";

const MODE_KEY = "datespreader.mobile";      // "full" = normal portal also on a phone, "recap" = recap
const FILTER_KEY = "datespreader.recap.filter";
const SMALL = "(max-width: 760px)";
const PAST_DAYS = 14;                        // "to close": interventions of the last 14 days not completed
const NEXT_DAYS = 7;
const REFRESH_MS = 60_000;
const CLOSED = ["completato", "annullato"];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* optional */ }
}

/** True on a small screen, unless the user chose the full version. */
export function wantsRecap() {
  const mode = stored(MODE_KEY);
  if (mode === "full") return false;
  return matchMedia(SMALL).matches;
}

/** From the full portal on a phone: back to the recap. */
export function switchToRecap() {
  store(MODE_KEY, null);
  location.reload();
}

export const isSmallScreen = () => matchMedia(SMALL).matches;

/**
 * @param {{ me: object, toast: (msg: string) => void }} opts
 */
export async function startRecap({ me, toast }) {
  document.body.classList.add("recap-mode", "signed-in");
  const root = el("div", "recap");
  document.body.prepend(root);
  try {
    // technicians' names and the project colors (same as in the full portal)
    const [projects] = await Promise.all([fetchProjects(), people.load()]);
    assignColors(projects);
  } catch { /* optional */ }

  let filter = stored(FILTER_KEY) ?? (me.role === "tecnico" ? "mine" : "all");
  let events = [];
  let loadedAt = null;
  const open = new Set();

  // --- header ---
  const head = el("header", "rc-head");
  const brand = el("div", "rc-brand");
  brand.append(el("strong", null, "Date Spreader"), el("span", "muted", me.display_name));
  const refresh = el("button", "rc-icon-btn");
  refresh.innerHTML = '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="M13.2 6.2A5.5 5.5 0 1 0 13.4 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.6 2.6v3.8H9.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  refresh.type = "button";
  refresh.setAttribute("aria-label", t("recap.refresh"));
  refresh.title = t("recap.refresh");
  refresh.addEventListener("click", () => load());
  head.append(brand, refresh);

  const sub = el("p", "rc-sub muted");
  const tabs = el("div", "rc-tabs");
  tabs.setAttribute("role", "tablist");
  const tab = (value, label) => {
    const b = el("button", "rc-tab", label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => { filter = value; store(FILTER_KEY, value); render(); });
    b.dataset.value = value;
    return b;
  };
  tabs.append(tab("mine", t("recap.mine")), tab("all", t("recap.all")));
  const list = el("main", "rc-list");
  const foot = el("footer", "rc-foot");
  const full = el("button", "btn", t("recap.full_version"));
  full.type = "button";
  full.addEventListener("click", () => { store(MODE_KEY, "full"); location.reload(); });
  const out = el("button", "btn", t("recap.logout"));
  out.type = "button";
  out.addEventListener("click", async () => { try { await logout(); } finally { location.reload(); } });
  foot.append(full, out);
  root.append(head, sub, tabs, list, foot);

  const names = (ids) => (ids ?? []).map((id) => people.byId(id)?.display_name).filter(Boolean);
  const mine = (ev) => me.id != null && (ev.user_ids ?? []).includes(me.id);
  const timeText = (ev) => (ev.start_time
    ? `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`
    : t("recap.all_day"));

  async function load() {
    refresh.disabled = true;
    const today = todayIso();
    try {
      events = await fetchEvents(addDays(today, -PAST_DAYS), addDays(today, NEXT_DAYS));
      loadedAt = new Date();
    } catch (err) {
      toast(t("recap.load_error", { message: err.message }));
    } finally {
      refresh.disabled = false;
    }
    render();
  }

  function card(ev) {
    const c = el("article", `rc-card status-${ev.status}`);
    c.style.setProperty("--c", colorFor(ev.project_id));
    const top = el("button", "rc-card-top");
    top.type = "button";
    top.setAttribute("aria-expanded", String(open.has(ev.id)));
    const line1 = el("div", "rc-line1");
    line1.append(el("span", "rc-time", timeText(ev)), badge(ev.status, EVENT_STATUS));
    const conflicts = (ev.conflict_users?.length ?? 0) + (ev.conflict_servers ?? 0);
    if (conflicts) line1.append(el("span", "rc-warn", t("recap.conflicts", { n: conflicts })));
    const title = el("div", "rc-title", ev.project_name);
    const meta = el("div", "rc-meta muted", [ev.customer_name, ev.title, EVENT_TYPE[ev.event_type] ?? ev.event_type].filter(Boolean).join(" · "));
    const n = ev.server_count;
    const prog = el("div", "rc-progress");
    if (n) {
      const bar = el("span", "rc-bar");
      bar.style.setProperty("--p", `${Math.round((ev.migrated / n) * 100)}%`);
      prog.append(el("span", "rc-count", `${ev.migrated}/${n}`), bar);
    } else {
      prog.append(el("span", "muted", t("recap.no_servers")));
    }
    const who = names(ev.user_ids);
    top.append(line1, title, meta, prog);
    if (who.length) top.append(el("div", "rc-people", who.join(", ")));
    c.append(top);
    const details = el("div", "rc-details");
    details.hidden = !open.has(ev.id);
    c.append(details);
    if (open.has(ev.id)) fill(details, ev);
    top.addEventListener("click", () => {
      if (open.has(ev.id)) open.delete(ev.id); else open.add(ev.id);
      top.setAttribute("aria-expanded", String(open.has(ev.id)));
      details.hidden = !open.has(ev.id);
      if (open.has(ev.id)) fill(details, ev);
    });
    return c;
  }

  async function fill(box, summary) {
    box.replaceChildren(el("p", "muted", t("recap.loading")));
    let ev;
    try {
      ev = await fetchEvent(summary.id);
    } catch (err) {
      box.replaceChildren(el("p", "pf-error", err.message));
      return;
    }
    const status = el("label", "rc-status");
    status.append(el("span", null, t("recap.status")), eventStatusControl(ev, {
      onSaved: (updated) => { toast(t("recap.status_saved", { status: EVENT_STATUS[updated.status] ?? updated.status })); load(); },
      onConflict: (_, message) => toast(message),
      onError: (message) => toast(message),
    }));
    box.replaceChildren(status);
    if (ev.notes) box.append(el("p", "rc-notes", ev.notes));
    if (ev.conflicts?.length) {
      const warn = el("ul", "rc-conflicts");
      for (const c of ev.conflicts) {
        warn.append(el("li", null, c.kind === "server"
          ? t("recap.conflict_server", { name: c.name, other: c.other.project_name })
          : t("recap.conflict_tech", { name: c.name, other: c.other.project_name })));
      }
      box.append(warn);
    }
    if (ev.servers.length) {
      box.append(el("p", "rc-servers-head muted", t("recap.servers", {
        stage: stageDone(ev), done: ev.servers.filter((s) => s.migration_status === "completata").length, n: ev.servers.length,
      })));
      const ul = el("ul", "rc-servers");
      for (const s of ev.servers) {
        const li = el("li");
        const l1 = el("div", "rc-srv1");
        l1.append(el("span", "mono", s.hostname), badge(s.migration_status, MIGRATION_STATUS));
        li.append(l1);
        const extra = [s.environment, shortOs(s.operating_system), s.assigned_user?.display_name].filter(Boolean).join(" · ");
        if (extra) li.append(el("div", "muted small", extra));
        if (s.notes) li.append(el("div", "rc-srv-notes small", s.notes));
        li.title = `${stageLabel(ev)}: ${MIGRATION_STATUS[s.migration_status] ?? s.migration_status}`;
        ul.append(li);
      }
      box.append(ul);
    }
  }

  function section(title, items, { empty = null, byDay = false } = {}) {
    const sec = el("section", "rc-section");
    sec.append(el("h2", null, title));
    if (!items.length) {
      if (!empty) return null;
      sec.append(el("p", "muted rc-empty", empty));
      return sec;
    }
    let day = null;
    const fmtDay = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
    for (const ev of items) {
      if (byDay && ev.event_date !== day) {
        day = ev.event_date;
        const d = fmtDay.format(parseIso(day));
        sec.append(el("h3", "rc-day", d.charAt(0).toUpperCase() + d.slice(1)));
      }
      sec.append(card(ev));
    }
    return sec;
  }

  function render() {
    tabs.querySelectorAll(".rc-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.value === filter)));
    const today = todayIso();
    const shown = events.filter((ev) => filter === "all" || mine(ev));
    const sort = (a, b) => (a.event_date + (a.start_time ?? "")).localeCompare(b.event_date + (b.start_time ?? ""));
    const toClose = shown.filter((ev) => ev.event_date < today && !CLOSED.includes(ev.status)).sort(sort);
    const todays = shown.filter((ev) => ev.event_date === today).sort(sort);
    const next = shown.filter((ev) => ev.event_date > today).sort(sort);
    const d = formatLongDate(today);
    sub.textContent = [d.charAt(0).toUpperCase() + d.slice(1),
      loadedAt && t("recap.updated", { time: loadedAt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) })]
      .filter(Boolean).join(" · ");
    list.replaceChildren(...[
      section(t("recap.to_close"), toClose),
      section(t("recap.today"), todays, { empty: t("recap.today_empty") }),
      section(t("recap.next_days", { n: NEXT_DAYS }), next, { empty: t("recap.next_empty"), byDay: true }),
    ].filter(Boolean));
  }

  render();
  await load();
  setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
}
