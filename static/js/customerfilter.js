// Customer filter, always at hand: a customer menu at the top of the project column and, while a
// customer is chosen, a colored label at the top of the calendar ("Customer: X ✕").
// The filter itself lives in the Filters panel (filters.js): this module only shows and changes it.
// Other ways to pick a customer (group header or customer name in the project column, right click
// on an intervention, customer name in the intervention card) call the same onPick.

import { t } from "./i18n.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const DEFAULT_COLOR = "var(--muted)";
const X_SVG = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

/**
 * @param {{ menuSlot: HTMLElement, pillSlot: HTMLElement, onPick: (customerId: string) => void }} opts
 *   onPick("") = all customers
 * @returns {{ update: (customerId: string, customers: Array, colorOf?: (customer) => string) => void }}
 *   colorOf: color of a customer (its own, or the one of its projects when it has none)
 */
export function customerFilterUI({ menuSlot, pillSlot, onPick }) {
  // --- menu in the project column ---
  const wrap = el("div", "cf-menu");
  const dot = el("span", "cf-dot");
  dot.setAttribute("aria-hidden", "true");
  const select = el("select", "cf-select");
  select.setAttribute("aria-label", t("customerfilter.menu_label"));
  select.title = t("customerfilter.menu_title");
  select.addEventListener("change", () => onPick(select.value));
  const clear = el("button", "cf-clear");
  clear.innerHTML = X_SVG;
  clear.type = "button";
  clear.title = t("customerfilter.clear");
  clear.setAttribute("aria-label", t("customerfilter.clear"));
  clear.addEventListener("click", () => onPick(""));
  wrap.append(dot, select, clear);
  menuSlot.replaceChildren(wrap);

  // --- label at the top of the calendar ---
  const pill = el("div", "cf-pill");
  pill.setAttribute("role", "status");
  const pillDot = el("span", "cf-dot");
  const pillText = el("span", "cf-pill-text");
  const pillClear = el("button", "cf-clear");
  pillClear.innerHTML = X_SVG;
  pillClear.type = "button";
  pillClear.title = t("customerfilter.clear");
  pillClear.setAttribute("aria-label", t("customerfilter.clear"));
  pillClear.addEventListener("click", () => onPick(""));
  pill.append(pillDot, pillText, pillClear);
  pillSlot.replaceChildren(pill);

  function update(customerId, customers, colorOf = (c) => c.color) {
    const id = customerId ? String(customerId) : "";
    select.replaceChildren(new Option(t("customerfilter.all"), ""));
    for (const c of customers) select.append(new Option(c.name, String(c.id)));
    select.value = id;
    const current = customers.find((c) => String(c.id) === id);
    const color = (current && colorOf(current)) || DEFAULT_COLOR;
    wrap.classList.toggle("active", Boolean(current));
    clear.hidden = !current;
    dot.style.background = current ? color : "transparent";
    pillSlot.hidden = !current;
    document.body.classList.toggle("customer-filtered", Boolean(current));
    if (current) {
      pillDot.style.background = color;
      pill.style.setProperty("--cf", color);
      pillText.textContent = t("customerfilter.pill", { name: current.name });
    }
  }
  return { update };
}
