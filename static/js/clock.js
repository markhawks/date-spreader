// Data e orologio nella barra in alto. Cosa mostrare è una preferenza personale (topbar_clock):
// data e ora, data e ora con i secondi, solo data, solo ora, niente. L'ora segue il formato 24h/12h.

import { getTimeFormat } from "./dates.js";
import { locale } from "./i18n.js";

const fmtDate = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const fmtFull = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const pad = (n) => String(n).padStart(2, "0");

function formatClock(d, seconds) {
  const s = seconds ? `:${pad(d.getSeconds())}` : "";
  if (getTimeFormat() === "12h") {
    const h = d.getHours();
    return `${h % 12 || 12}:${pad(d.getMinutes())}${s} ${h < 12 ? "AM" : "PM"}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${s}`;
}

export class TopbarClock {
  /** @param {HTMLElement} root contenitore con .clock-date e .clock-time */
  constructor(root) {
    this.root = root;
    this.dateEl = root.querySelector(".clock-date");
    this.timeEl = root.querySelector(".clock-time");
    this.mode = "date_time";
    this.timer = null;
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.#tick(); });
  }

  setMode(mode) {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.root.hidden = mode === "off";
    this.dateEl.hidden = mode === "time";
    this.timeEl.hidden = mode === "date";
    this.#tick();
  }

  /** Ridisegna (es. dopo un cambio del formato degli orari). */
  refresh() {
    this.#tick();
  }

  #tick() {
    clearTimeout(this.timer);
    if (this.mode === "off") return;
    const now = new Date();
    const seconds = this.mode === "date_time_seconds";
    const date = fmtDate.format(now);
    this.dateEl.textContent = date.charAt(0).toUpperCase() + date.slice(1); // «Mer 11 novembre 2026» / «Wed 11 November 2026»
    this.timeEl.textContent = formatClock(now, seconds);
    this.root.title = `${fmtFull.format(now)}, ${formatClock(now, true)}`;
    this.root.setAttribute("datetime", now.toISOString());
    // Prossimo aggiornamento allo scoccare del secondo o del minuto (la data cambia a mezzanotte)
    const wait = seconds ? 1000 - now.getMilliseconds()
      : (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    this.timer = setTimeout(() => this.#tick(), wait + 20);
  }
}
