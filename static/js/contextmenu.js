// Menu contestuale (tasto destro / pressione prolungata): navigabile da tastiera, si chiude con Esc o clic fuori.

let open = null;

/**
 * @param {number} x @param {number} y  posizione (coordinate della finestra)
 * @param {{ title?: string, items: Array<{label: string, hint?: string, onSelect: () => void, disabled?: boolean}>,
 *           onClose?: () => void }} opts
 */
export function showContextMenu(x, y, { title = "", items, onClose = () => {} }) {
  open?.close();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  if (title) {
    const h = document.createElement("div");
    h.className = "ctx-title";
    h.textContent = title;
    menu.append(h);
  }
  const buttons = items.map((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctx-item";
    b.setAttribute("role", "menuitem");
    b.disabled = Boolean(it.disabled);
    const label = document.createElement("span");
    label.textContent = it.label;
    b.append(label);
    if (it.hint) {
      const hint = document.createElement("span");
      hint.className = "ctx-hint";
      hint.textContent = it.hint;
      b.append(hint);
    }
    b.addEventListener("click", () => { close(); it.onSelect(); });
    menu.append(b);
    return b;
  });
  document.body.append(menu);

  // Dentro la finestra, anche vicino ai bordi
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;

  const enabled = buttons.filter((b) => !b.disabled);
  const onKey = (e) => {
    const i = enabled.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); enabled[(i + 1) % enabled.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); enabled[(i - 1 + enabled.length) % enabled.length]?.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); }
  };
  const onOutside = (e) => { if (!menu.contains(e.target)) close(); };
  const onScroll = () => close();

  function close() {
    if (!menu.isConnected) return;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("resize", onScroll);
    document.removeEventListener("scroll", onScroll, true);
    menu.remove();
    open = null;
    onClose();
  }
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("resize", onScroll);
  document.addEventListener("scroll", onScroll, true);
  open = { close };
  enabled[0]?.focus();
  return { close };
}
