// Scelta della data quando un progetto ha più interventi.
// Popover sotto il riquadro del progetto; preseleziona il prossimo intervento futuro.

import { colorFor } from "./colors.js";
import { formatMediumDate, todayIso } from "./dates.js";
import { EVENT_STATUS, toneOf } from "./labels.js";
import { t } from "./i18n.js";

let active = null; // popover aperto: { close(value) }

/**
 * @param {HTMLElement} anchor elemento sotto cui mostrare la lista
 * @param {{id:number, name:string, events:Array}} project
 * @returns {Promise<object|null>} l'evento scelto, o null se annullato
 */
export function chooseEvent(anchor, project) {
  active?.close(null);
  return new Promise((resolve) => {
    const today = todayIso();
    const upcomingIdx = project.events.findIndex((e) => e.event_date >= today);
    const preselect = upcomingIdx >= 0 ? upcomingIdx : project.events.length - 1;

    const pop = document.createElement("div");
    pop.className = "chooser";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", t("chooser.aria", { name: project.name }));
    pop.style.setProperty("--c", colorFor(project.id));

    const head = document.createElement("div");
    head.className = "chooser-head";
    head.textContent = t("chooser.head", { name: project.name, n: project.events.length });
    const list = document.createElement("ul");
    list.className = "chooser-list";

    const buttons = project.events.map((ev, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chooser-item";
      if (ev.event_date < today) btn.classList.add("past");
      if (i === upcomingIdx) btn.classList.add("next");

      const date = document.createElement("span");
      date.className = "chooser-date";
      date.textContent = formatMediumDate(ev.event_date);
      const title = document.createElement("span");
      title.className = "chooser-title";
      title.textContent = ev.title ?? "";
      const status = document.createElement("span");
      status.className = `badge tone-${toneOf(ev.status)}`;
      status.textContent = EVENT_STATUS[ev.status] ?? ev.status;

      btn.append(date, status, title);
      btn.addEventListener("click", () => close(ev));
      li.append(btn);
      list.append(li);
      return btn;
    });

    pop.append(head, list);
    document.body.append(pop);
    position(pop, anchor);

    const onKey = (e) => {
      const idx = buttons.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      else if (e.key === "ArrowDown") { e.preventDefault(); buttons[(idx + 1) % buttons.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); buttons[(idx - 1 + buttons.length) % buttons.length].focus(); }
    };
    const onOutside = (e) => {
      if (!pop.contains(e.target) && !anchor.contains(e.target)) close(null);
    };
    const onResize = () => close(null);

    function close(value) {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("resize", onResize);
      pop.remove();
      active = null;
      if (value === null) anchor.focus();
      resolve(value);
    }

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("resize", onResize);
    active = { close };
    buttons[preselect].focus();
  });
}

/** Sotto l'ancora se c'è spazio, altrimenti sopra; sempre dentro la finestra. */
function position(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const margin = 8;
  let top = a.bottom + 6;
  if (top + p.height > innerHeight - margin) top = Math.max(margin, a.top - p.height - 6);
  const left = Math.min(Math.max(margin, a.left), innerWidth - p.width - margin);
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}
