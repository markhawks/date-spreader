// Accesso: schermata di login, cambio password, menu utente, changelog.

import { changePassword, fetchChangelog, login, logout } from "./api.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const LOGO = `<svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
  <rect x="3" y="5" width="26" height="24" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/>
  <path d="M3 12h26M10 3v5M22 3v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="16" cy="20.5" r="3.2" fill="currentColor"/></svg>`;

function field(label, input) {
  const wrap = el("label", "pf-field");
  wrap.append(el("span", null, label), input);
  return wrap;
}

function input(name, type, attrs = {}) {
  const i = el("input");
  Object.assign(i, { name, type, required: true, ...attrs });
  return i;
}

/** Schermata a tutta pagina sopra l'app (login, cambio password obbligatorio). */
function screen(title, subtitle) {
  document.getElementById("auth-screen")?.remove();
  const root = el("div", "auth-screen");
  root.id = "auth-screen";
  const card = el("div", "auth-card");
  const brand = el("div", "auth-brand");
  brand.innerHTML = LOGO;
  brand.append(el("span", null, "Date Spreader"));
  card.append(brand, el("h1", "auth-title", title));
  if (subtitle) card.append(el("p", "muted auth-sub", subtitle));
  root.append(card);
  document.body.append(root);
  document.body.classList.add("auth-open");
  return card;
}

/** Login. `onSuccess(me)` dopo l'accesso (di solito: ricarica la pagina). */
export function showLogin({ onSuccess, message = null, version = "", source = "" } = {}) {
  const card = screen("Accedi", message ?? "Usa la tua email o il nome utente.");
  const form = el("form", "auth-form");
  form.noValidate = true;
  const user = input("login", "text", { autocomplete: "username", autocapitalize: "none", spellcheck: false });
  const pw = input("password", "password", { autocomplete: "current-password" });
  const err = el("p", "pf-error");
  err.hidden = true;
  err.setAttribute("role", "alert");
  const btn = el("button", "btn btn-primary auth-submit", "Accedi");
  btn.type = "submit";
  form.append(field("Email o nome utente", user), field("Password", pw), err, btn);
  card.append(form);
  if (version) {
    const v = el("p", "muted auth-version", `Versione ${version}`);
    if (source) v.append(" · ", sourceLink(source));
    card.append(v);
  }
  user.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user.value.trim() || !pw.value) {
      err.textContent = "Inserisci nome utente (o email) e password.";
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = "Accesso…";
    try {
      const me = await login(user.value.trim(), pw.value);
      onSuccess?.(me);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      pw.value = "";
      pw.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = "Accedi";
    }
  });
}

/**
 * Cambio password. `forced`: schermata obbligatoria (password temporanea), senza "Annulla".
 * @returns {Promise<boolean>} true se cambiata
 */
export function showChangePassword({ forced = false } = {}) {
  return new Promise((resolve) => {
    let container;
    let close;
    if (forced) {
      container = screen("Scegli una nuova password", "Stai usando una password temporanea: per continuare scegline una tua.");
      close = () => {};
    } else {
      const dialog = el("dialog", "pf-dialog");
      dialog.setAttribute("aria-label", "Cambia password");
      container = el("div", "pf-body pw-body");
      container.append(el("h2", null, "Cambia password"));
      dialog.append(container);
      document.body.append(dialog);
      dialog.addEventListener("close", () => { dialog.remove(); resolve(false); });
      dialog.showModal();
      close = () => dialog.close();
    }

    const form = el("form", "auth-form");
    form.noValidate = true;
    const cur = input("current", "password", { autocomplete: "current-password" });
    const pw1 = input("new", "password", { autocomplete: "new-password", minLength: 10 });
    const pw2 = input("repeat", "password", { autocomplete: "new-password" });
    const err = el("p", "pf-error");
    err.hidden = true;
    err.setAttribute("role", "alert");
    const hint = el("p", "muted small", "Almeno 10 caratteri; non deve contenere il tuo nome utente o la tua email.");
    const actions = el("div", "pf-foot auth-actions");
    if (!forced) {
      const cancel = el("button", "btn", "Annulla");
      cancel.type = "button";
      cancel.addEventListener("click", close);
      actions.append(cancel);
    }
    const ok = el("button", "btn btn-primary", "Salva password");
    ok.type = "submit";
    actions.append(ok);
    form.append(field(forced ? "Password temporanea" : "Password attuale", cur), field("Nuova password", pw1),
      field("Ripeti la nuova password", pw2), hint, err, actions);
    container.append(form);
    cur.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fail = (m, f) => { err.textContent = m; err.hidden = false; f?.focus(); };
      if (!cur.value) return fail("Inserisci la password attuale.", cur);
      if (pw1.value.length < 10) return fail("La nuova password deve avere almeno 10 caratteri.", pw1);
      if (pw1.value !== pw2.value) return fail("Le due password non coincidono.", pw2);
      ok.disabled = true;
      try {
        await changePassword(cur.value, pw1.value);
        if (!forced) {
          resolve(true);
          close();
        } else {
          resolve(true);
        }
      } catch (ex) {
        fail(ex.message, ex.message.includes("attuale") ? cur : pw1);
      } finally {
        ok.disabled = false;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Changelog: Markdown minimo (titoli, elenchi, grassetto, codice, link), sempre con testo escapato.
// ---------------------------------------------------------------------------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(md) {
  const out = [];
  let list = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (list && !line.startsWith("- ")) { out.push("</ul>"); list = false; }
    if (m) {
      const level = Math.min(m[1].length + 1, 5);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (line.startsWith("- ")) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line) {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (list) out.push("</ul>");
  return out.join("");
}

/** Link al codice sorgente (licenza AGPL-3.0: va offerto a chi usa il portale). */
function sourceLink(url) {
  const a = el("a", null, "Codice sorgente (AGPL-3.0)");
  Object.assign(a, { href: url, target: "_blank", rel: "noopener" });
  return a;
}

export async function showChangelog() {
  const dialog = el("dialog", "pf-dialog changelog-dialog");
  dialog.setAttribute("aria-labelledby", "cl-title");
  const head = el("header", "pf-head");
  const h = el("h2", null, "Novità del portale");
  h.id = "cl-title";
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", "Chiudi");
  x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);
  const body = el("div", "pf-body changelog");
  body.append(el("p", "muted", "Caricamento…"));
  const foot = el("p", "muted small changelog-license");
  foot.append("Date Spreader è software libero, rilasciato sotto licenza GNU AGPL-3.0-only.");
  dialog.append(head, body, foot);
  fetch("/api/version").then((r) => r.json()).then((info) => {
    if (info.source_url) foot.append(" ", sourceLink(info.source_url));
  }).catch(() => {});
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.showModal();
  try {
    const { markdown } = await fetchChangelog();
    body.innerHTML = renderMarkdown(markdown);
  } catch (err) {
    body.replaceChildren(el("p", "error", `Impossibile caricare il changelog: ${err.message}`));
  }
}

// ---------------------------------------------------------------------------
// Menu utente (in alto a destra)
// ---------------------------------------------------------------------------
const ROLE_LABEL = { tecnico: "Tecnico", coordinatore: "Coordinatore", admin: "Amministratore" };

export function userMenu(me, { onLogout, adminItems = [] }) {
  const wrap = el("div", "user-menu");
  const btn = el("button", "btn user-btn");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  const initials = me.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  btn.append(el("span", "user-avatar", initials), el("span", "user-name", me.display_name));
  const menu = el("div", "user-dropdown");
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  const who = el("div", "user-who");
  who.append(el("strong", null, me.display_name), el("span", "muted", [ROLE_LABEL[me.role] ?? me.role, me.username ?? me.email].filter(Boolean).join(" · ")));
  const item = (label, fn) => {
    const b = el("button", "user-item", label);
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.addEventListener("click", () => { toggle(false); fn(); });
    return b;
  };
  menu.append(
    who,
    ...(me.is_admin ? adminItems.map(([label, fn]) => item(label, fn)) : []),
    item("Cambia password", () => showChangePassword()),
    item(`Novità · versione ${me.version}`, () => showChangelog()),
    item("Esci", async () => {
      try { await logout(); } finally { onLogout(); }
    }),
  );
  const toggle = (open = menu.hidden) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => toggle());
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { toggle(false); btn.focus(); } });
  wrap.append(btn, menu);
  return wrap;
}
