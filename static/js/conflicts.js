// Scheduling conflicts of an intervention (computed by the server: app/repositories/conflicts.py):
// warning box shown in the intervention card and in the full-screen table.

import { formatShortDate, formatTime } from "./dates.js";
import { t } from "./i18n.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const when = (o) => (o.start_time
  ? (o.end_time ? `${formatTime(o.start_time)}–${formatTime(o.end_time)}` : formatTime(o.start_time))
  : t("conflicts.all_day"));

/** Warning icon drawn with CSS (the ⚠ character is missing from some fonts). */
export function warnIcon() {
  const i = el("span", "warn-icon");
  i.setAttribute("aria-hidden", "true");
  i.textContent = "!";
  return i;
}

/** Name of the other intervention: "Customer · Project · title". */
export const otherName = (o) => [o.customer_name, o.project_name, o.title].filter(Boolean).join(" · ");

/**
 * Warning box, or null when there are no conflicts.
 * @param {Array} conflicts EventDetail.conflicts
 * @param {{ onOpen?: (other) => void }} opts  onOpen: open the other intervention (link)
 */
export function conflictBox(conflicts, { onOpen = null } = {}) {
  if (!conflicts?.length) return null;
  const box = el("div", "conflict-box");
  box.setAttribute("role", "note");
  const title = el("strong", "conflict-title");
  title.append(warnIcon(), t("conflicts.title", { n: conflicts.length }));
  box.append(title);
  const list = el("ul");
  for (const c of conflicts) {
    const li = el("li");
    const text = c.kind === "server"
      ? t("conflicts.server", { server: c.name, date: formatShortDate(c.other.event_date) })
      : t("conflicts.technician", { name: c.name, time: when(c.other) });
    if (c.on_check) li.append(el("span", "chip-check-tag", t("conflicts.check_tag")), " ");
    li.append(text, " ");
    const name = c.other.is_check ? t("conflicts.other_check", { name: otherName(c.other) }) : otherName(c.other);
    if (onOpen) {
      const link = el("button", "link-btn", name);
      link.type = "button";
      link.title = t("conflicts.open");
      link.addEventListener("click", () => onOpen(c.other));
      li.append(link);
    } else {
      li.append(el("strong", null, name));
    }
    list.append(li);
  }
  box.append(list);
  return box;
}

/** Clipboard with a tick: the symbol of the pre-check (drawn, not an emoji: same on every PC). */
export function checkIcon() {
  const span = document.createElement("span");
  span.className = "check-icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2.5" width="10" height="12" rx="1.5"/><path d="M6 2.5h4v2H6zM5.8 9.3l1.7 1.7 3-3.2"/></svg>';
  return span;
}

/**
 * An intervention and its pre-check highlight each other when the mouse is over one of them
 * (elements with the same data-event-id inside root, e.g. in different days or months).
 */
export function linkPairHover(root, selector) {
  let lit = [];
  const clear = () => { lit.forEach((n) => n.classList.remove("pair-lit")); lit = []; };
  root.addEventListener("mouseover", (e) => {
    const item = e.target.closest(selector);
    if (!item || lit.includes(item)) return;
    clear();
    const pair = [...root.querySelectorAll(`${selector}[data-event-id="${item.dataset.eventId}"]`)];
    if (pair.length < 2 || !pair.some((n) => n.dataset.kind === "check")) return;
    pair.forEach((n) => n.classList.add("pair-lit"));
    lit = pair;
  });
  root.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest?.(selector)) clear();
  });
}
