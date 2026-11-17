// New version on GitHub (administrators): the server checks the latest release (GET /api/updates, cached);
// if it is newer, a badge next to the version in the top bar and, at start, a card at the bottom right
// with the highlights, the link to the release and the command to upgrade. "Ignore this version" stops the
// card for that version (the badge stays); Settings → Appearance turns the notice off.

import { fetchUpdates } from "./api.js";
import { renderMarkdown } from "./auth.js";
import { formatMediumDate } from "./dates.js";
import { locale, t } from "./i18n.js";
import { prefs } from "./prefs.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

let card = null;
let slot = null;   // where the badge goes (next to the version), set at start

/** Command to upgrade this installation to `version`. */
function upgradeCommand(info, me) {
  if (info.package === "rpm") {
    const dist = /\.(el\d+|fc\d+)$/.exec(me.full_version ?? "")?.[1] ?? "el10";
    return `sudo dnf upgrade ./datespreader-${info.latest}-1.${dist}.noarch.rpm`;
  }
  if (info.app_dir === "/opt/datespreader") return `sudo ${info.app_dir}/deploy/install.sh --ref v${info.latest}`;
  // installed from git by hand: update the checkout; the service applies the migrations at start
  return `cd ${info.app_dir} && sudo git pull && sudo systemctl restart datespreader`;
}

/**
 * At start (administrators): checks for a new version. Returns true if the card was shown.
 * @param {HTMLElement} badgeSlot  where to put the badge (next to the version)
 */
export async function checkForUpdates(me, badgeSlot) {
  slot = badgeSlot;
  if (!me.is_admin || !prefs.get().update_notice) return false;
  let info;
  try {
    info = await fetchUpdates();
  } catch {
    return false; // not essential
  }
  if (!info.enabled || !info.newer) return false;
  showBadge(info, me);
  if (prefs.get().update_dismissed === info.latest) return false;
  showUpdate(info, me);
  return true;
}

function showBadge(info, me) {
  if (!slot) return;
  const badge = el("button", "update-badge");
  badge.type = "button";
  badge.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  badge.setAttribute("aria-label", t("updates.badge_title", { version: info.latest }));
  badge.title = t("updates.badge_title", { version: info.latest });
  badge.addEventListener("click", () => showUpdate(info, me));
  slot.replaceChildren(badge);
  slot.hidden = false;
}

/**
 * «Check now» (administrators): asks GitHub now, skipping the 6-hour memory of the server.
 * A newer version shows the badge and the card; returns the answer of the server.
 */
export async function checkNow(me) {
  const info = await fetchUpdates(true);
  if (info.enabled && info.newer) {
    showBadge(info, me);
    showUpdate(info, me);
  }
  return info;
}

/** One line for a check result: up to date, new version, disabled or not reachable. */
export function checkMessage(info) {
  if (!info.enabled) return t("updates.disabled");
  if (!info.latest) return t("updates.unreachable", { error: info.error ?? "?" });
  if (info.newer) return t("updates.available", { version: info.latest });
  return t("updates.up_to_date", { version: info.current });
}

/** Settings → Administration → «Updates»: installed and latest version, last check, «Check now», notice. */
export function updatesPanel(me, { toast = () => {}, onPrefs = null } = {}) {
  const box = el("div", "settings-field updates-panel");
  box.append(el("h4", null, t("updates.panel_title")));
  const facts = el("dl", "updates-facts");
  const result = el("p", "small updates-result");
  const btn = el("button", "btn btn-small", t("updates.check_now"));
  btn.type = "button";
  const fact = (label, value) => {
    const dd = el("dd");
    if (value instanceof Node) dd.append(value); else dd.textContent = value ?? "—";
    facts.append(el("dt", null, label), dd);
  };
  const render = (info) => {
    facts.replaceChildren();
    fact(t("updates.installed"), info.full_version || info.current);
    let latest = info.latest ? `${info.latest}${info.published_at ? ` · ${formatMediumDate(info.published_at)}` : ""}` : "—";
    if (info.latest && info.url) {
      const wrap = el("span");
      const a = el("a", null, t("updates.open"));
      Object.assign(a, { href: info.url, target: "_blank", rel: "noopener" });
      wrap.append(latest, " · ", a);
      latest = wrap;
    }
    fact(t("updates.latest"), latest);
    fact(t("updates.checked"), info.checked_at
      ? new Date(info.checked_at).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })
      : (info.enabled ? t("updates.never") : "—"));
    result.textContent = checkMessage(info);
    result.className = `small updates-result ${!info.enabled || !info.latest ? "warn" : info.newer ? "new" : "ok"}`;
    btn.disabled = !info.enabled;
  };
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    result.textContent = t("updates.checking");
    try {
      render(await checkNow(me));
    } catch (err) {
      result.textContent = err.message;
      btn.disabled = false;
    }
  });
  fetchUpdates().then(render).catch((err) => { result.textContent = err.message; });
  const row = el("div", "updates-actions");
  row.append(btn, result);
  box.append(facts, row);
  if (onPrefs) box.append(onPrefs());
  return box;
}

function showUpdate(info, me) {
  card?.remove();
  card = el("section", "tip-card update-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "upd-title");
  const head = el("header", "tip-head");
  const icon = el("span", "tip-bulb");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const h = el("h2", null, t("updates.title", { version: info.latest }));
  h.id = "upd-title";
  const close = el("button", "cf-clear");
  close.type = "button";
  close.title = t("updates.close");
  close.setAttribute("aria-label", t("updates.close"));
  close.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  head.append(icon, h, close);
  const sub = el("p", "muted small update-sub", info.published_at
    ? t("updates.current_date", { current: info.current, date: formatMediumDate(info.published_at) })
    : t("updates.current", { current: info.current }));
  const text = el("div", "tip-text update-text");
  text.innerHTML = info.highlights ? renderMarkdown(info.highlights) : "";
  const how = el("p", "small update-how", t("updates.how"));
  const cmd = el("code", "update-cmd", upgradeCommand(info, me));
  const foot = el("footer", "tip-foot");
  const ignore = el("button", "btn btn-small", t("updates.ignore"));
  ignore.type = "button";
  ignore.title = t("updates.ignore_title");
  const link = el("a", "btn btn-small btn-primary", t("updates.open"));
  Object.assign(link, { href: info.url, target: "_blank", rel: "noopener" });
  foot.append(ignore, link);
  card.append(head, sub, text, how, cmd, foot);
  document.body.append(card);

  const dismiss = () => { card?.remove(); card = null; };
  close.addEventListener("click", dismiss);
  ignore.addEventListener("click", () => { prefs.set({ update_dismissed: info.latest }).catch(() => {}); dismiss(); });
  card.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); dismiss(); } });
}
