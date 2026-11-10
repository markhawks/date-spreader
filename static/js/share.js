// Condivisione di un intervento via email (Gmail aziendale).
//
// Non serve collegare il portale a Google: si prepara un'email HTML con stili in linea
// (Gmail ignora i fogli di stile), la si copia negli appunti come testo formattato e si apre
// la composizione di Gmail con destinatari e oggetto già scritti. L'utente incolla con Ctrl+V.
// Il portale è in HTTP: l'API moderna degli appunti non è disponibile, quindi si copia una
// selezione del documento (execCommand), che porta con sé la formattazione.

import { fetchEvent } from "./api.js";
import { colorFor, textOn } from "./colors.js";
import { formatLongDate, formatShortDate, formatTime } from "./dates.js";
import {
  CHECK_STATUS, EVENT_STATUS, EVENT_TYPE, MIGRATION_STATUS, shortOs, toneOf,
} from "./labels.js";
import { people } from "./people.js";
import { prefs } from "./prefs.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Colori dei badge in versione "email" (sempre tema chiaro: chi riceve non ha i nostri stili)
const TONES = {
  ok: ["#dcfce7", "#166534"], warn: ["#fef3c7", "#92400e"], bad: ["#fee2e2", "#991b1b"],
  info: ["#dbeafe", "#1e40af"], neutral: ["#eef0f3", "#4b5563"],
};
const badgeHtml = (status, labels) => {
  const [bg, fg] = TONES[toneOf(status)] ?? TONES.neutral;
  return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:${bg};color:${fg};font-weight:bold;font-size:12px;white-space:nowrap">${esc(labels[status] ?? status)}</span>`;
};

/** Link che apre l'intervento nel portale. */
export const eventLink = (id) => `${location.origin}/#intervento-${id}`;

function timeRange(ev) {
  if (!ev.start_time) return "";
  return `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`;
}

/** Oggetto, HTML e testo semplice dell'email per un intervento (EventDetail). */
export function buildEmail(ev) {
  const color = colorFor(ev.project.id);
  const customer = ev.project.customer_name;
  const when = [formatLongDate(ev.event_date), timeRange(ev)].filter(Boolean).join(", ");
  const subject = ["Intervento", customer, ev.project.name, `${formatShortDate(ev.event_date)}${ev.start_time ? ` ${timeRange(ev)}` : ""}`]
    .filter(Boolean).join(" · ").replace("Intervento · ", "Intervento: ");

  const n = ev.servers.length;
  const count = (k, v) => ev.servers.filter((s) => s[k] === v).length;
  const summary = n
    ? `${n} server · check OK ${count("check_status", "ok")}/${n}${count("check_status", "ko") ? ` · check KO ${count("check_status", "ko")}` : ""} · migrati ${count("migration_status", "completata")}/${n}`
    : "Nessun server associato";

  const td = "padding:6px 8px;border-bottom:1px solid #e3e6eb;vertical-align:top;font-size:13px";
  const mono = "font-family:Consolas,Menlo,monospace;font-size:12px";
  const cols = [
    ["Hostname", (s) => `<span style="${mono};font-weight:bold">${esc(s.hostname)}</span>`],
    ["IP", (s) => `<span style="${mono}">${esc(s.ip_address ?? "")}</span>`],
    ["SO", (s) => esc(shortOs(s.operating_system))],
    ["Amb.", (s) => esc(s.environment ?? "")],
    ["Kernel attuale", (s) => `<span style="${mono}">${esc(s.current_kernel ?? "")}</span>`],
    ["SO target", (s) => esc(shortOs(s.target_operating_system))],
    ["Kernel target", (s) => `<span style="${mono}">${esc(s.target_kernel ?? "")}</span>`],
    ["Check", (s) => badgeHtml(s.check_status, CHECK_STATUS)],
    ["Migrazione", (s) => badgeHtml(s.migration_status, MIGRATION_STATUS)],
    ["Eseguito il", (s) => esc(s.executed_date ? formatShortDate(s.executed_date) : "")],
    ["Tecnico", (s) => esc(s.assigned_user?.display_name ?? "")],
    ["Note", (s) => esc(s.notes ?? "")],
  ];
  const facts = [
    ["Data", esc(when)],
    ["Tipo", esc(EVENT_TYPE[ev.event_type] ?? ev.event_type)],
    ["Stato", badgeHtml(ev.status, EVENT_STATUS)],
    ...(ev.title ? [["Titolo", esc(ev.title)]] : []),
    ...(ev.participants.length ? [["Partecipanti", esc(ev.participants.map((p) => p.display_name).join(", "))]] : []),
    ...(ev.notes ? [["Note", esc(ev.notes).replace(/\n/g, "<br>")]] : []),
  ];

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2330;font-size:14px;line-height:1.4">
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:1100px;border-left:5px solid ${color}">
    <tr><td style="padding:10px 14px;background:#f6f7f9">
      ${customer ? `<div style="font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">${esc(customer)}</div>` : ""}
      <div style="font-size:18px;font-weight:bold">${esc(ev.project.name)}</div>
      <div style="color:#4b5563">${esc(when)}</div>
    </td></tr>
  </table>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0">
    ${facts.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:3px 0;font-size:13px">${v}</td></tr>`).join("")}
  </table>
  <div style="margin:8px 0;color:#4b5563;font-size:13px">${esc(summary)}</div>
  ${n ? `
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e3e6eb">
    <thead><tr>${cols.map(([h]) => `<th style="padding:7px 8px;background:#f1f3f6;border-bottom:1px solid #e3e6eb;text-align:left;font-size:12px;color:#4b5563;white-space:nowrap">${h}</th>`).join("")}</tr></thead>
    <tbody>${ev.servers.map((s) => `<tr>${cols.map(([h, f]) => `<td style="${td};${h === "Note" ? "min-width:160px" : "white-space:nowrap"}">${f(s)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` : ""}
  <p style="margin:16px 0 0;font-size:12px;color:#6b7280">
    Apri l'intervento nel portale: <a href="${esc(eventLink(ev.id))}" style="color:#2563eb">${esc(eventLink(ev.id))}</a><br>
    Inviato da Date Spreader
  </p>
</div>`;

  const lines = [
    subject, "",
    ...(customer ? [`Cliente: ${customer}`] : []),
    `Progetto: ${ev.project.name}`,
    `Data: ${when}`,
    `Tipo: ${EVENT_TYPE[ev.event_type] ?? ev.event_type}`,
    `Stato: ${EVENT_STATUS[ev.status] ?? ev.status}`,
    ...(ev.title ? [`Titolo: ${ev.title}`] : []),
    ...(ev.participants.length ? [`Partecipanti: ${ev.participants.map((p) => p.display_name).join(", ")}`] : []),
    ...(ev.notes ? [`Note: ${ev.notes}`] : []),
    "", summary, "",
    ...ev.servers.map((s) => [
      s.hostname, s.ip_address, shortOs(s.operating_system), s.environment,
      `${s.current_kernel ?? "?"} → ${shortOs(s.target_operating_system) || ""} ${s.target_kernel ?? ""}`.trim(),
      `check ${CHECK_STATUS[s.check_status] ?? s.check_status}`, `migrazione ${MIGRATION_STATUS[s.migration_status] ?? s.migration_status}`,
      s.assigned_user?.display_name, s.notes,
    ].filter(Boolean).join(" | ")),
    "", `Apri nel portale: ${eventLink(ev.id)}`,
  ];
  return { subject, html, text: lines.join("\n"), accent: color };
}

/** Copia un elemento come testo formattato (funziona anche in HTTP, dove navigator.clipboard non c'è). */
function copyRich(node) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  sel.removeAllRanges();
  return ok;
}

function copyText(text) {
  const ta = el("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

/**
 * URL di composizione di Gmail.
 * - account: l'indirizzo Google con cui aprire Gmail (authuser). Se quell'account non è collegato nel
 *   browser, Gmail ignora la richiesta e usa quello predefinito (spesso il personale della sincronizzazione).
 * - choose: passa prima dalla scelta dell'account di Google (con l'indirizzo già proposto): si può
 *   selezionare l'account aziendale o accedervi se nel browser non c'è ancora.
 */
export function gmailComposeUrl({ to, subject, account, choose = false }) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: to.join(","), su: subject });
  if (account) params.set("authuser", account);
  const compose = `https://mail.google.com/mail/?${params}`;
  if (!choose) return compose;
  const chooser = new URLSearchParams({ continue: compose, service: "mail" });
  if (account) chooser.set("Email", account);
  return `https://accounts.google.com/AccountChooser?${chooser}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Finestra «Condividi intervento».
 * @param {number} eventId
 * @param {{ me: {email?: string}, toast?: (m: string) => void }} opts
 */
export async function showShareDialog(eventId, { me, toast = () => {} } = {}) {
  const [ev] = await Promise.all([fetchEvent(eventId), people.load()]);
  const mail = buildEmail(ev);

  const dialog = el("dialog", "pf-dialog share-dialog");
  dialog.setAttribute("aria-labelledby", "share-title");
  dialog.style.borderTopColor = mail.accent;
  const form = el("form", "pf");
  form.noValidate = true;
  const head = el("header", "pf-head");
  const h = el("h2", null, "Condividi intervento via email");
  h.id = "share-title";
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", "Chiudi");
  x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);

  // Destinatari: per default le email dei partecipanti (escluso chi condivide)
  const emails = ev.participants
    .map((p) => people.byId(p.id)?.email)
    .filter((e) => e && e !== me?.email);
  const toLabel = el("label", "pf-field");
  toLabel.append(el("span", null, "Destinatari"));
  const to = el("input");
  Object.assign(to, { type: "text", value: emails.join(", "), placeholder: "nome@azienda.it, altro@azienda.it", autocomplete: "off" });
  toLabel.append(to);
  const subjLabel = el("label", "pf-field");
  subjLabel.append(el("span", null, "Oggetto"));
  const subject = el("input");
  Object.assign(subject, { type: "text", value: mail.subject });
  subjLabel.append(subject);

  const how = el("p", "muted small share-how");
  how.innerHTML = "<strong>Copia e apri Gmail</strong>: si apre un nuovo messaggio con destinatari e oggetto; nel corpo premi <kbd>Ctrl</kbd>+<kbd>V</kbd> per incollare l'email formattata qui sotto.";

  const previewLabel = el("p", "confirm-label", "Anteprima dell'email");
  // Account Gmail: quello salvato nelle preferenze, altrimenti l'email del profilo nel portale
  const saved = prefs.get();
  const accLabel = el("label", "pf-field");
  accLabel.append(el("span", null, "Account Gmail (mittente)"));
  const account = el("input");
  Object.assign(account, {
    type: "email", value: saved.gmail_account || me?.email || "", placeholder: "nome@azienda.it", autocomplete: "email",
    title: "L'account Google con cui aprire Gmail: deve essere collegato nel browser (anche insieme a quello personale)",
  });
  accLabel.append(account);
  const chooseLabel = el("label", "share-choose");
  const choose = el("input");
  Object.assign(choose, { type: "checkbox", checked: saved.gmail_choose_account });
  chooseLabel.append(choose, " Fammi scegliere l'account Google a ogni invio");
  chooseLabel.title = "Prima di Gmail si apre la scelta dell'account di Google: utile se l'account aziendale non è ancora collegato nel browser";
  const accRow = el("div", "share-account");
  accRow.append(accLabel, chooseLabel);

  const preview = el("div", "share-preview");
  preview.innerHTML = mail.html;

  const body = el("div", "pf-body");
  body.append(toLabel, subjLabel, accRow, how, previewLabel, preview);

  const foot = el("footer", "pf-foot");
  const plain = el("button", "btn", "Copia come testo semplice");
  plain.type = "button";
  plain.title = "Per programmi che non accettano il testo formattato";
  const copyOnly = el("button", "btn", "Copia email");
  copyOnly.type = "button";
  const go = el("button", "btn btn-primary", "Copia e apri Gmail");
  go.type = "submit";
  foot.append(plain, el("span", "spacer"), copyOnly, go);
  form.append(head, body, foot);
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  const recipients = () => to.value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  plain.addEventListener("click", () => {
    toast(copyText(`${subject.value}\n\n${mail.text.split("\n").slice(2).join("\n")}`)
      ? "Testo copiato." : "Copia non riuscita: seleziona l'anteprima e copiala a mano.");
  });
  copyOnly.addEventListener("click", () => {
    toast(copyRich(preview) ? "Email copiata: incollala nel corpo del messaggio con Ctrl+V." : "Copia non riuscita: seleziona l'anteprima e copiala a mano.");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const acc = account.value.trim();
    if (acc && !EMAIL_RE.test(acc)) {
      account.classList.add("invalid");
      account.focus();
      toast("Account Gmail: scrivi un indirizzo email valido (oppure lascia vuoto).");
      return;
    }
    account.classList.remove("invalid");
    // Ricorda la scelta (vuoto = email del profilo nel portale)
    const store = acc === (me?.email ?? "") ? "" : acc;
    if (store !== saved.gmail_account || choose.checked !== saved.gmail_choose_account) {
      prefs.set({ gmail_account: store, gmail_choose_account: choose.checked }).catch(() => {});
    }
    const ok = copyRich(preview);
    window.open(gmailComposeUrl({ to: recipients(), subject: subject.value, account: acc, choose: choose.checked }), "_blank", "noopener");
    toast(ok ? "Email copiata: nel nuovo messaggio di Gmail premi Ctrl+V nel corpo." : "Gmail aperto, ma la copia non è riuscita: copia l'anteprima a mano.");
  });

  dialog.showModal();
  go.focus();
}
