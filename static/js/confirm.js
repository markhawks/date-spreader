// Conferma per operazioni irreversibili: elenca le conseguenze e, se richiesto,
// fa scrivere un testo (es. il nome del progetto) prima di abilitare il pulsante.

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * @param {{ title: string, intro?: string, items?: string[], keep?: string[],
 *           confirmLabel?: string, requireText?: string }} opts
 *   items: cosa verrà eliminato · keep: cosa resta · requireText: testo da digitare per confermare
 * @returns {Promise<boolean>}
 */
export function confirmDanger({ title, intro = "", items = [], keep = [], confirmLabel = "Elimina", requireText = null }) {
  return new Promise((resolve) => {
    const dialog = el("dialog", "pf-dialog confirm-dialog");
    dialog.setAttribute("role", "alertdialog");
    const form = el("form", "pf");
    form.noValidate = true;
    const head = el("header", "pf-head");
    const h = el("h2", null, title);
    h.id = `cf-${Math.random().toString(36).slice(2)}`;
    dialog.setAttribute("aria-labelledby", h.id);
    head.append(h);
    const body = el("div", "pf-body");
    if (intro) body.append(el("p", null, intro));
    if (items.length) {
      body.append(el("p", "confirm-label", "Verrà eliminato:"));
      const ul = el("ul", "confirm-list danger");
      items.forEach((t) => ul.append(el("li", null, t)));
      body.append(ul);
    }
    if (keep.length) {
      body.append(el("p", "confirm-label", "Resta:"));
      const ul = el("ul", "confirm-list keep");
      keep.forEach((t) => ul.append(el("li", null, t)));
      body.append(ul);
    }
    body.append(el("p", "confirm-warn", "L'operazione non si può annullare."));
    let input = null;
    if (requireText) {
      const lab = el("label", "pf-field");
      lab.append(el("span", null, `Per confermare scrivi: ${requireText}`));
      input = el("input");
      input.autocomplete = "off";
      input.spellcheck = false;
      lab.append(input);
      body.append(lab);
    }
    const foot = el("footer", "pf-foot");
    const cancel = el("button", "btn", "Annulla");
    cancel.type = "button";
    const ok = el("button", "btn btn-danger", confirmLabel);
    ok.type = "submit";
    const norm = (v) => v.trim().replace(/\s+/g, " ").toLowerCase();
    const sync = () => { ok.disabled = Boolean(input) && norm(input.value) !== norm(requireText); };
    input?.addEventListener("input", sync);
    sync();
    foot.append(cancel, ok);
    form.append(head, body, foot);
    dialog.append(form);
    document.body.append(dialog);

    let result = false;
    cancel.addEventListener("click", () => dialog.close());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      result = true;
      dialog.close();
    });
    dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
    dialog.showModal();
    (input ?? cancel).focus(); // il fuoco NON parte sul pulsante di eliminazione
  });
}
