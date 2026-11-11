// Condivisione di un intervento via email (Gmail aziendale).
//
// Non serve collegare il portale a Google: si prepara un'email HTML con stili in linea
// (Gmail ignora i fogli di stile), la si copia negli appunti come testo formattato e si apre
// la composizione di Gmail con destinatari e oggetto già scritti. L'utente incolla con Ctrl+V.
// Il portale è in HTTP: l'API moderna degli appunti non è disponibile, quindi si copia una
// selezione del documento (execCommand), che porta con sé la formattazione.

import { fetchEvent } from "./api.js";
import { t } from "./i18n.js";
import { colorFor, textOn } from "./colors.js";
import { formatLongDate, formatShortDate, formatTime } from "./dates.js";
import {
  CHECK_STATUS, EVENT_STATUS, EVENT_TYPE, MIGRATION_STATUS, isConfigEvent, shortOs, stageDone, stageLabel, toneOf,
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
  const subject = t("share.subject", {
    details: [customer, ev.project.name, `${formatShortDate(ev.event_date)}${ev.start_time ? ` ${timeRange(ev)}` : ""}`,
      EVENT_STATUS[ev.status] ?? ev.status].filter(Boolean).join(" · "),
  });

  const config = isConfigEvent(ev);
  const n = ev.servers.length;
  const count = (k, v) => ev.servers.filter((s) => s[k] === v).length;
  const ko = count("check_status", "ko");
  const summary = !n ? t("share.no_servers")
    : config ? [t("share.server_count", { n }), t("share.summary_stage", { stage: stageDone(ev), done: count("migration_status", "completata"), n })].join(" · ")
    : [t("share.server_count", { n }), t("share.summary_check_ok", { ok: count("check_status", "ok"), n }),
      ...(ko ? [t("share.summary_check_ko", { ko })] : []),
      t("share.summary_stage", { stage: stageDone(ev), done: count("migration_status", "completata"), n })].join(" · ");

  const td = "padding:6px 8px;border-bottom:1px solid #e3e6eb;vertical-align:top;font-size:13px";
  const mono = "font-family:Consolas,Menlo,monospace;font-size:12px";
  // [column id, header, cell]
  const allCols = [
    ["hostname", t("share.col_hostname"), (s) => `<span style="${mono};font-weight:bold">${esc(s.hostname)}</span>`],
    ["ip", t("share.col_ip"), (s) => `<span style="${mono}">${esc(s.ip_address ?? "")}</span>`],
    ["os", t("share.col_os"), (s) => esc(shortOs(s.operating_system))],
    ["env", t("share.col_env"), (s) => esc(s.environment ?? "")],
    ["kernel", t("share.col_kernel"), (s) => `<span style="${mono}">${esc(s.current_kernel ?? "")}</span>`],
    ["target_os", t("share.col_target_os"), (s) => esc(shortOs(s.target_operating_system))],
    ["target_kernel", t("share.col_target_kernel"), (s) => `<span style="${mono}">${esc(s.target_kernel ?? "")}</span>`],
    ["check", t("share.col_check"), (s) => badgeHtml(s.check_status, CHECK_STATUS)],
    ["stage", stageLabel(ev), (s) => badgeHtml(s.migration_status, MIGRATION_STATUS)],
    ["executed", t("share.col_executed"), (s) => esc(s.executed_date ? formatShortDate(s.executed_date) : "")],
    ["technician", t("share.col_technician"), (s) => esc(s.assigned_user?.display_name ?? "")],
    ["notes", t("share.col_notes"), (s) => esc(s.notes ?? "")],
  ];
  // Configurazione: colonne ridotte e note in una riga a tutta larghezza sotto ogni server
  const CONFIG_COLS = ["hostname", "ip", "os", "env", "stage", "executed", "technician"];
  const cols = config ? allCols.filter(([id]) => CONFIG_COLS.includes(id)) : allCols;
  const notesRow = (s) => (config
    ? `<tr><td colspan="${cols.length}" style="padding:6px 10px 10px;border-bottom:2px solid #d5d9e0;background:#f8f9fb;font-size:13px;white-space:pre-wrap">${
      s.notes ? esc(s.notes).replace(/\n/g, "<br>") : `<span style="color:#9ca3af">${esc(t("share.no_notes"))}</span>`}</td></tr>`
    : "");
  const facts = [
    [t("share.fact_date"), esc(when)],
    [t("share.fact_type"), esc(EVENT_TYPE[ev.event_type] ?? ev.event_type)],
    [t("share.fact_status"), badgeHtml(ev.status, EVENT_STATUS)],
    ...(ev.title ? [[t("share.fact_title"), esc(ev.title)]] : []),
    ...(ev.participants.length ? [[t("share.fact_participants"), esc(ev.participants.map((p) => p.display_name).join(", "))]] : []),
    ...(ev.notes ? [[t("share.fact_notes"), esc(ev.notes).replace(/\n/g, "<br>")]] : []),
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
    ${facts.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;font-size:13px">${v}</td></tr>`).join("")}
  </table>
  <div style="margin:8px 0;color:#4b5563;font-size:13px">${esc(summary)}</div>
  ${n ? `
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e3e6eb">
    <thead><tr>${cols.map(([, h]) => `<th style="padding:7px 8px;background:#f1f3f6;border-bottom:1px solid #e3e6eb;text-align:left;font-size:12px;color:#4b5563;white-space:nowrap">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${ev.servers.map((s) => `<tr>${cols.map(([id, , f]) => `<td style="${td};${id === "notes" ? "min-width:160px" : "white-space:nowrap"}${config ? ";border-bottom:1px dashed #e3e6eb" : ""}">${f(s)}</td>`).join("")}</tr>${notesRow(s)}`).join("")}</tbody>
  </table>` : ""}
  <p style="margin:16px 0 0;font-size:12px;color:#6b7280">
    ${esc(t("share.open_in_portal"))} <a href="${esc(eventLink(ev.id))}" style="color:#2563eb">${esc(eventLink(ev.id))}</a><br>
    ${esc(t("share.sent_by"))}
  </p>
</div>`;

  const lines = [
    subject, "",
    ...(customer ? [t("share.text_customer", { value: customer })] : []),
    t("share.text_project", { value: ev.project.name }),
    t("share.text_date", { value: when }),
    t("share.text_type", { value: EVENT_TYPE[ev.event_type] ?? ev.event_type }),
    t("share.text_status", { value: EVENT_STATUS[ev.status] ?? ev.status }),
    ...(ev.title ? [t("share.text_title", { value: ev.title })] : []),
    ...(ev.participants.length ? [t("share.text_participants", { value: ev.participants.map((p) => p.display_name).join(", ") })] : []),
    ...(ev.notes ? [t("share.text_notes", { value: ev.notes })] : []),
    "", summary, "",
    ...ev.servers.map((s) => (config ? [
      [s.hostname, s.ip_address, shortOs(s.operating_system), s.environment,
        t("share.text_stage", { stage: stageLabel(ev).toLowerCase(), status: MIGRATION_STATUS[s.migration_status] ?? s.migration_status }),
        s.executed_date && t("share.text_executed", { date: formatShortDate(s.executed_date) }), s.assigned_user?.display_name].filter(Boolean).join(" | "),
      ...(s.notes ? s.notes.split("\n").map((l) => `    ${l}`) : []),
      "",
    ].join("\n") : [
      s.hostname, s.ip_address, shortOs(s.operating_system), s.environment,
      `${s.current_kernel ?? "?"} → ${shortOs(s.target_operating_system) || ""} ${s.target_kernel ?? ""}`.trim(),
      t("share.text_check", { status: CHECK_STATUS[s.check_status] ?? s.check_status }), t("share.text_stage", { stage: stageLabel(ev).toLowerCase(), status: MIGRATION_STATUS[s.migration_status] ?? s.migration_status }),
      s.assigned_user?.display_name, s.notes,
    ].filter(Boolean).join(" | "))),
    "", t("share.text_open", { url: eventLink(ev.id) }),
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
  const h = el("h2", null, t("share.dialog_title"));
  h.id = "share-title";
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", t("share.close"));
  x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);

  // Destinatari: per default le email dei partecipanti (escluso chi condivide)
  const emails = ev.participants
    .map((p) => people.byId(p.id)?.email)
    .filter((e) => e && e !== me?.email);
  const toLabel = el("label", "pf-field");
  toLabel.append(el("span", null, t("share.recipients")));
  const to = el("input");
  Object.assign(to, { type: "text", value: emails.join(", "), placeholder: t("share.recipients_placeholder"), autocomplete: "off" });
  toLabel.append(to);
  const subjLabel = el("label", "pf-field");
  subjLabel.append(el("span", null, t("share.subject_label")));
  const subject = el("input");
  Object.assign(subject, { type: "text", value: mail.subject });
  subjLabel.append(subject);

  const how = el("p", "muted small share-how");
  how.innerHTML = t("share.how_html");

  const previewLabel = el("p", "confirm-label", t("share.preview"));
  // Account Gmail: quello salvato nelle preferenze, altrimenti l'email del profilo nel portale
  const saved = prefs.get();
  const accLabel = el("label", "pf-field");
  accLabel.append(el("span", null, t("share.account")));
  const account = el("input");
  Object.assign(account, {
    type: "email", value: saved.gmail_account || me?.email || "", placeholder: t("share.account_placeholder"), autocomplete: "email",
    title: t("share.account_title"),
  });
  accLabel.append(account);
  const chooseLabel = el("label", "share-choose");
  const choose = el("input");
  Object.assign(choose, { type: "checkbox", checked: saved.gmail_choose_account });
  chooseLabel.append(choose, ` ${t("share.choose_account")}`);
  chooseLabel.title = t("share.choose_account_title");
  const accRow = el("div", "share-account");
  accRow.append(accLabel, chooseLabel);

  const preview = el("div", "share-preview");
  preview.innerHTML = mail.html;

  const body = el("div", "pf-body");
  body.append(toLabel, subjLabel, accRow, how, previewLabel, preview);

  const foot = el("footer", "pf-foot");
  const plain = el("button", "btn", t("share.copy_plain"));
  plain.type = "button";
  plain.title = t("share.copy_plain_title");
  const copyOnly = el("button", "btn", t("share.copy_email"));
  copyOnly.type = "button";
  const go = el("button", "btn btn-primary", t("share.copy_open"));
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
      ? t("share.text_copied") : t("share.copy_failed"));
  });
  copyOnly.addEventListener("click", () => {
    toast(copyRich(preview) ? t("share.email_copied") : t("share.copy_failed"));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const acc = account.value.trim();
    if (acc && !EMAIL_RE.test(acc)) {
      account.classList.add("invalid");
      account.focus();
      toast(t("share.account_invalid"));
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
    toast(ok ? t("share.email_copied_gmail") : t("share.gmail_copy_failed"));
  });

  dialog.showModal();
  go.focus();
}
