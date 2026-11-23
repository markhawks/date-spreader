// Order of the server rows of an intervention: saved on the intervention (server_sort), the same for
// everybody, applied by the server (app/server_sort.py). A click on a column header sorts by that column,
// a second click reverses it. Used by the full-screen table, the preview below and the compact table.

import { patchEvent } from "./api.js";
import { t } from "./i18n.js";

/** Column of the tables → sort field of the server. */
export const SORT_FIELD = {
  hostname: "hostname", ip_address: "ip_address", operating_system: "operating_system", environment: "environment",
  location: "location", steamroller_inventory: "steamroller_inventory", current_kernel: "current_kernel",
  target_operating_system: "target_operating_system", target_kernel: "target_kernel", check_status: "check_status",
  migration_status: "migration_status", executed_date: "executed_date", assigned_user_id: "assigned_user",
  notes: "notes",
};

/** The next order after a click on `field`: ascending, then descending. */
export const nextSort = (current, field) => (current === field ? `-${field}` : field);

/** ▲/▼ and aria-sort on a header cell. */
export function markHeader(th, current, field) {
  th.querySelector(".th-sort-mark")?.remove();
  th.removeAttribute("aria-sort");
  if (!current || current.replace(/^-/, "") !== field) return;
  const desc = current.startsWith("-");
  th.setAttribute("aria-sort", desc ? "descending" : "ascending");
  const mark = document.createElement("span");
  mark.className = "th-sort-mark";
  mark.textContent = desc ? " ▼" : " ▲";
  th.firstChild ? th.insertBefore(mark, th.querySelector(".col-resizer")) : th.append(mark);
}

/** Makes a header cell clickable (not its resize handle): click or Enter sorts by `field`. */
export function sortableHeader(th, field, onSort) {
  th.classList.add("th-sortable");
  th.tabIndex = 0;
  const base = th.title ? `${th.title}\n` : "";
  th.title = `${base}${t("serversort.hint")}`;
  th.addEventListener("click", (e) => { if (!e.target.closest(".col-resizer")) onSort(field); });
  th.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === th) { e.preventDefault(); onSort(field); }
  });
}

/** Saves the order on the intervention; returns the intervention with its rows in the new order. */
export async function saveSort(ev, spec, fetchFresh) {
  try {
    return await patchEvent(ev.id, { version: ev.version, server_sort: spec });
  } catch (err) {
    if (!err.isConflict || !fetchFresh) throw err;
    const fresh = await fetchFresh();   // someone changed the intervention meanwhile: once more
    return patchEvent(ev.id, { version: fresh.version, server_sort: spec });
  }
}
