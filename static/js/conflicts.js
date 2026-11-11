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
    li.append(text, " ");
    const name = otherName(c.other);
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
