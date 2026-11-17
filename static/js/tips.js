// Tip of the day: a small card at the bottom right, once a day for each user, the first time they open
// the portal that day. The tips rotate: a user sees all of them before one comes back. ‹ › browse the
// others; "Show me" opens the screen a tip talks about. Off with "Don't show tips any more" (back on in
// Settings → Appearance, or from the user menu). Texts: static/js/i18n/tips.js (tips.tip.<id>).

import { t } from "./i18n.js";
import { prefs } from "./prefs.js";

/** admin: only for administrators · action: screen opened by "Show me" (see showTip's actions). */
export const TIPS = [
  { id: "zoom_y" },
  { id: "zoom_x" },
  { id: "pinch" },
  { id: "today" },
  { id: "week_view" },
  { id: "workweek" },
  { id: "technicians_view" },
  { id: "right_click_day" },
  { id: "empty_day" },
  { id: "progress" },
  { id: "chip_styles" },
  { id: "conflicts" },
  { id: "customer_filter" },
  { id: "right_click_only" },
  { id: "group_customer" },
  { id: "project_click" },
  { id: "sidebar_width" },
  { id: "search" },
  { id: "filters_problems" },
  { id: "dotted_day" },
  { id: "duplicate" },
  { id: "share" },
  { id: "share_link" },
  { id: "configuration_type" },
  { id: "hours" },
  { id: "new_technician" },
  { id: "preview_bottom" },
  { id: "move_date" },
  { id: "table_enter" },
  { id: "underlined_columns" },
  { id: "add_existing" },
  { id: "import_csv" },
  { id: "col_resize" },
  { id: "row_filter" },
  { id: "inv_edit", action: "inventory" },
  { id: "inv_sort", action: "inventory" },
  { id: "inv_customer", action: "inventory" },
  { id: "inv_stats", action: "inventory" },
  { id: "inv_history", action: "inventory" },
  { id: "gantt_export", action: "gantt" },
  { id: "theme", action: "settings" },
  { id: "clock", action: "settings" },
  { id: "phone" },
  { id: "auto_refresh" },
  { id: "version_click" },
  { id: "admin_os", admin: true },
  { id: "admin_sync", admin: true, action: "settings" },
  { id: "admin_customer_color", admin: true, action: "settings" },
  { id: "admin_updates", admin: true },
  { id: "os_outdated" },
  { id: "completed_upgrade" },
  { id: "pre_check" },
  { id: "check_pair" },
  { id: "check_gantt", action: "gantt" },
  { id: "check_done" },
];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let card = null;

/** The tips for this user, and the next one to show (the first not seen yet; all seen → start again). */
function pick(me) {
  const list = TIPS.filter((tip) => !tip.admin || me.is_admin);
  const seen = new Set(prefs.get().tips_seen ?? []);
  let i = list.findIndex((tip) => !seen.has(tip.id));
  const restart = i < 0;
  if (restart) i = 0;
  return { list, i, restart };
}

function markSeen(id, { restart = false, today = false } = {}) {
  const p = prefs.get();
  const seen = restart ? [] : (p.tips_seen ?? []).filter((x) => x !== id && TIPS.some((tip) => tip.id === x));
  const changes = { tips_seen: [...seen, id] };
  if (today) changes.tips_last_day = localDay();
  prefs.set(changes).catch(() => {});
}

/** At start: the tip of the day, if not shown yet today and not turned off. */
export function maybeShowTip(me, actions) {
  const p = prefs.get();
  if (!p.tips || p.tips_last_day === localDay()) return;
  showTip(me, actions, { daily: true });
}

/**
 * @param {object} me  the user (is_admin)
 * @param {Record<string, () => void>} actions  screens for "Show me": inventory, gantt, settings
 */
export function showTip(me, actions = {}, { daily = false } = {}) {
  card?.remove();
  const { list, i: start, restart } = pick(me);
  if (!list.length) return;
  let i = start;
  card = el("section", "tip-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "tip-title");
  const head = el("header", "tip-head");
  const h = el("h2", null, t("tips.title"));
  h.id = "tip-title";
  const close = el("button", "cf-clear");
  close.type = "button";
  close.title = t("tips.close");
  close.setAttribute("aria-label", t("tips.close"));
  close.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const bulb = el("span", "tip-bulb");
  bulb.setAttribute("aria-hidden", "true");
  bulb.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>';
  head.append(bulb, h, close);
  const text = el("p", "tip-text");
  text.setAttribute("aria-live", "polite");
  const showMe = el("button", "btn btn-small tip-show", t("tips.show_me"));
  showMe.type = "button";
  const foot = el("footer", "tip-foot");
  const off = el("label", "tip-off");
  const cb = el("input");
  cb.type = "checkbox";
  off.append(cb, " ", t("tips.dont_show"));
  const nav = el("span", "tip-nav");
  const prev = el("button", "icon-btn", "‹");
  prev.type = "button";
  prev.title = t("tips.prev");
  prev.setAttribute("aria-label", t("tips.prev"));
  const count = el("span", "muted");
  const next = el("button", "icon-btn", "›");
  next.type = "button";
  next.title = t("tips.next");
  next.setAttribute("aria-label", t("tips.next"));
  nav.append(prev, count, next);
  foot.append(off, nav);
  card.append(head, text, showMe, foot);
  document.body.append(card);

  const render = () => {
    const tip = list[i];
    text.textContent = t(`tips.tip.${tip.id}`);
    count.textContent = t("tips.counter", { i: i + 1, n: list.length });
    showMe.hidden = !(tip.action && actions[tip.action]);
  };
  const go = (step) => {
    i = (i + step + list.length) % list.length;
    render();
    markSeen(list[i].id);
  };
  const dismiss = () => {
    if (cb.checked) prefs.set({ tips: false }).catch(() => {});
    card?.remove();
    card = null;
  };
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  close.addEventListener("click", dismiss);
  showMe.addEventListener("click", () => { const fn = actions[list[i].action]; dismiss(); fn?.(); });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); dismiss(); }
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  });
  render();
  markSeen(list[i].id, { restart, today: daily });
}
