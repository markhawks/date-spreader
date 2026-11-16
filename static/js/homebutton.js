// «Calendar» button in the middle of the header of the full-screen views (Gantt, server inventory):
// same look as «Today» / «Month» of the home page, it closes the view and goes back to the calendar.

import { t } from "./i18n.js";

const ICON = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.8" y="2.8" width="12.4" height="11.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.8 6.2h12.4M5 1.5v2.6M11 1.5v2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="10.2" r="1.7" fill="currentColor"/></svg>';

/** The button; `header` gets the three-column layout (info · button · actions). */
export function homeButton(header, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-today sheet-home";
  b.title = t("homebutton.title");
  b.innerHTML = ICON;
  b.append(Object.assign(document.createElement("span"), { textContent: t("homebutton.label") }));
  b.addEventListener("click", onClick);
  header.classList.add("has-home");
  return b;
}
