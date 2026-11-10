// Colonne ridimensionabili: si trascina il bordo destro dell'intestazione.
// Doppio clic sul bordo: larghezza predefinita. Da tastiera: Tab sul bordo, frecce ←/→.
// Le larghezze sono salvate nel browser (localStorage) per ogni tabella.
//
// Requisiti: le <th> hanno data-col; l'ultima colonna (di solito "Note") resta elastica
// e prende lo spazio libero, quindi non ha maniglia.

const PREFIX = "datespreader.colwidths.";
const MIN_LAST = 140; // spazio minimo lasciato alla colonna elastica
const STEP = 16;

function load(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)) ?? {}; } catch { return {}; }
}
function store(key, widths) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(PREFIX + key, JSON.stringify(widths));
    else localStorage.removeItem(PREFIX + key);
  } catch { /* archiviazione non disponibile: le larghezze valgono solo per questa sessione */ }
}

/**
 * @param {HTMLTableElement} table
 * @param {{ key: string, min?: number, skip?: string[] }} opts
 * @returns {{ reset: () => void }}
 */
export function makeResizable(table, { key, min = 56, skip = [] }) {
  const ths = [...table.tHead.rows[0].cells];
  let colgroup = table.querySelector("colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    ths.forEach(() => colgroup.append(document.createElement("col")));
    table.prepend(colgroup);
  }
  const cols = [...colgroup.children];
  const defaults = cols.map((c) => c.style.width); // larghezze iniziali dichiarate ("" = automatica)
  const lastIdx = ths.length - 1 - [...ths].reverse().findIndex((th) => !skip.includes(th.dataset.col) && th.dataset.col);
  let widths = load(key);

  /** Passa al layout fisso fissando le larghezze attuali (serve per le tabelle a layout automatico). */
  function freeze() {
    if (table.classList.contains("cols-fixed")) return;
    const measured = ths.map((th) => Math.round(th.getBoundingClientRect().width));
    cols.forEach((c, i) => { if (i !== lastIdx && !c.style.width) c.style.width = `${measured[i]}px`; });
    table.classList.add("cols-fixed");
  }

  function updateMinWidth() {
    const sum = cols.reduce((acc, c, i) => (i === lastIdx ? acc : acc + (parseFloat(getComputedStyle(c).width) || 0)), 0);
    table.style.minWidth = `${Math.round(sum + MIN_LAST)}px`;
  }

  function setWidth(i, px) {
    cols[i].style.width = `${Math.max(min, Math.round(px))}px`;
    widths[ths[i].dataset.col] = parseInt(cols[i].style.width, 10);
  }

  function resetColumn(i) {
    delete widths[ths[i].dataset.col];
    cols[i].style.width = defaults[i] || `${Math.round(ths[i].getBoundingClientRect().width)}px`;
    store(key, widths);
    updateMinWidth();
  }

  // Larghezze salvate
  if (ths.some((th) => widths[th.dataset.col])) {
    freeze();
    ths.forEach((th, i) => { if (widths[th.dataset.col] && i !== lastIdx) cols[i].style.width = `${widths[th.dataset.col]}px`; });
    requestAnimationFrame(updateMinWidth);
  }

  ths.forEach((th, i) => {
    if (i === lastIdx || !th.dataset.col || skip.includes(th.dataset.col)) return;
    const handle = document.createElement("span");
    handle.className = "col-resizer";
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", `Larghezza colonna ${th.textContent.trim()}`);
    handle.title = "Trascina per allargare o restringere · doppio clic: larghezza predefinita";
    th.append(handle);

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      freeze();
      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add("col-resizing");
      const move = (ev) => { setWidth(i, startW + ev.clientX - startX); updateMinWidth(); };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        document.body.classList.remove("col-resizing");
        store(key, widths);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
    handle.addEventListener("dblclick", (e) => { e.stopPropagation(); resetColumn(i); });
    handle.addEventListener("click", (e) => e.stopPropagation());
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      freeze();
      setWidth(i, th.getBoundingClientRect().width + (e.key === "ArrowRight" ? STEP : -STEP));
      updateMinWidth();
      store(key, widths);
    });
  });

  return {
    /** Tutte le colonne alle larghezze predefinite. */
    reset() {
      widths = {};
      store(key, widths);
      cols.forEach((c, i) => { c.style.width = defaults[i]; });
      table.style.minWidth = "";
      if (!defaults.some(Boolean)) table.classList.remove("cols-fixed");
    },
  };
}

export const hasCustomWidths = (key) => Object.keys(load(key)).length > 0;
