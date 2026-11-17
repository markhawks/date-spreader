// Users connected now: this page reports itself to the server (what it shows, whether an edit is in
// progress), the button with the bust next to «Gantt» shows how many users are connected, and a click
// lists them. Administrators also see browser and IP and can send a notice to everybody (e.g. before
// a restart); the notice appears as a banner at the top of every page within seconds.

import { clearNotice, fetchPresence, leavePresence, reportPresence, sendNotice } from "./api.js";
import { locale, t } from "./i18n.js";

const VISIBLE_EVERY = 15_000;   // ms between two reports while the page is in the foreground
const HIDDEN_EVERY = 60_000;    // ms in the background

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const pageId = (() => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
})();

const shown = (id) => {
  const n = document.getElementById(id);
  return n && !n.hidden;
};

/** What this page shows now, and whether an edit is in progress (an open form, a cell being changed). */
function currentActivity() {
  let activity = "calendar";
  let detail = null;
  if (shown("sheet")) {
    activity = "sheet";
    detail = document.querySelector("#sheet .sheet-title, #sheet-title")?.textContent?.trim() || null;
  } else if (shown("gantt")) activity = "gantt";
  else if (shown("inventory")) activity = "inventory";
  else if (shown("workload")) activity = "technicians";
  else if (document.querySelector("dialog[open].settings-dialog")) activity = "settings";
  else if (document.querySelector(".calendar-scroll[data-view='week']")) activity = "week";
  const form = document.querySelector(
    "dialog[open].pf-dialog:not(.settings-dialog):not(.changelog-dialog):not(.whatsnew-dialog):not(.confirm-dialog)");
  const cell = document.querySelector("td.dirty, td.saving");
  if (!detail && form) detail = form.querySelector("h2")?.textContent?.trim() || null;
  return { activity, detail, editing: Boolean(form || cell) };
}

const ACTIVITY = {
  calendar: "presence.act_calendar", week: "presence.act_week", technicians: "presence.act_technicians",
  gantt: "presence.act_gantt", inventory: "presence.act_inventory", sheet: "presence.act_sheet",
  settings: "presence.act_settings", recap: "presence.act_recap", other: "presence.act_other",
};

const time = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

/** "Chrome 131 · Windows" from a user agent (enough to tell two PCs apart). */
function browserOf(ua) {
  if (!ua) return "";
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)[1]}`
    : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)[1]}`
      : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)[1]}`
        : /Safari\//.test(ua) ? "Safari" : "";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [b, os].filter(Boolean).join(" · ");
}

/**
 * @param {{ me: object, toast: (m: string) => void }} opts
 */
export function startPresence({ me, toast }) {
  const btn = document.getElementById("btn-online");
  const countEl = btn.querySelector(".online-count");
  const banner = document.getElementById("notice-banner");
  let timer = null;
  let popover = null;
  let last = "";

  const showNotice = (notice) => {
    banner.hidden = !notice;
    if (!notice) { banner.replaceChildren(); return; }
    banner.replaceChildren(el("strong", null, t("presence.notice_from", { name: notice.by ?? "" })), " ", notice.message);
  };
  const showCount = (n) => {
    countEl.textContent = String(n);
    btn.title = t("presence.button_title", { n });
    btn.setAttribute("aria-label", btn.title);
  };

  async function report() {
    clearTimeout(timer);
    const a = currentActivity();
    try {
      const res = await reportPresence({ page_id: pageId, visible: !document.hidden, ...a });
      showCount(res.count);
      showNotice(res.notice);
      if (popover) renderPopover();
    } catch { /* the next report will try again */ }
    timer = setTimeout(report, document.hidden ? HIDDEN_EVERY : VISIBLE_EVERY);
  }

  // report at once when the activity changes (form opened, table closed…), at most every 2 s
  let pending = null;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      const a = JSON.stringify(currentActivity());
      if (a !== last) { last = a; report(); }
    }, 2000);
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "open", "class"] });
  document.addEventListener("visibilitychange", () => report());
  addEventListener("pagehide", () => leavePresence(pageId));

  // --- the list (popover under the button) ---
  async function renderPopover() {
    let data;
    try {
      data = await fetchPresence();
    } catch (err) {
      popover?.replaceChildren(el("p", "error", err.message));
      return;
    }
    if (!popover) return;
    showCount(data.count);
    showNotice(data.notice);
    const head = el("header", "online-head");
    head.append(el("strong", null, t("presence.title", { n: data.count })));
    const list = el("ul", "online-list");
    for (const u of data.users) {
      const li = el("li", `online-user ${u.state}${u.editing ? " editing" : ""}`);
      const dot = el("span", "online-dot");
      dot.title = t(`presence.state_${u.state}`);
      const what = t(ACTIVITY[u.activity] ?? ACTIVITY.other) + (u.detail ? ` · ${u.detail}` : "");
      const main = el("div", "online-main");
      main.append(el("span", "online-name", u.name + (u.user_id === me.id ? ` ${t("presence.you")}` : "")),
        el("span", "online-what", what));
      if (u.editing) main.append(el("span", "online-editing", t("presence.editing")));
      const meta = [t(`presence.state_${u.state}`), t("presence.since", { time: time(u.since) }),
        u.pages > 1 ? t("presence.pages", { n: u.pages }) : null,
        me.is_admin ? browserOf(u.user_agent) : null, me.is_admin ? u.ip : null].filter(Boolean).join(" · ");
      main.append(el("span", "online-meta muted", meta));
      li.append(dot, main);
      list.append(li);
    }
    if (!data.users.length) list.append(el("li", "muted", t("presence.nobody")));
    const parts = [head, list];
    if (me.is_admin) parts.push(noticeForm(data.notice));
    popover.replaceChildren(...parts);
  }

  function noticeForm(notice) {
    const box = el("form", "online-notice");
    box.noValidate = true;
    box.append(el("strong", null, t("presence.notice_title")));
    const input = el("input");
    Object.assign(input, { type: "text", maxLength: 300, placeholder: t("presence.notice_placeholder"), value: notice?.message ?? "" });
    input.setAttribute("aria-label", t("presence.notice_title"));
    const mins = el("select");
    for (const [v, label] of [["", t("presence.notice_until_restart")], ["15", "15 min"], ["30", "30 min"], ["60", "1 h"], ["120", "2 h"]]) {
      mins.append(new Option(label, v));
    }
    mins.setAttribute("aria-label", t("presence.notice_duration"));
    const send = el("button", "btn btn-small btn-primary", t("presence.notice_send"));
    send.type = "submit";
    const row = el("div", "online-notice-row");
    row.append(input, mins, send);
    box.append(row, el("p", "muted small", t("presence.notice_hint")));
    if (notice) {
      const clear = el("button", "btn btn-small", t("presence.notice_clear"));
      clear.type = "button";
      clear.addEventListener("click", async () => {
        try { await clearNotice(); showNotice(null); toast(t("presence.notice_cleared")); renderPopover(); } catch (err) { toast(err.message); }
      });
      row.append(clear);
    }
    box.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message) { input.focus(); return; }
      try {
        const res = await sendNotice(message, mins.value ? Number(mins.value) : null);
        showNotice(res.notice);
        toast(t("presence.notice_sent"));
        renderPopover();
      } catch (err) { toast(err.message); }
    });
    return box;
  }

  const close = () => {
    popover?.remove();
    popover = null;
    btn.setAttribute("aria-expanded", "false");
  };
  btn.addEventListener("click", () => {
    if (popover) { close(); return; }
    popover = el("div", "online-popover");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", t("presence.title_short"));
    popover.append(el("p", "muted", t("presence.loading")));
    document.getElementById("online-menu").append(popover);
    btn.setAttribute("aria-expanded", "true");
    renderPopover();
  });
  document.addEventListener("click", (e) => {
    if (popover && !e.target.closest("#online-menu")) close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && popover) { close(); btn.focus(); } });

  report();
}
