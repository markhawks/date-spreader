// Database backups (Settings → Administration → "Database backups", administrators only):
// list of the backups in data/backups/, "Back up now", download. Restoring is done from the
// command line with the service stopped (python -m app.cli restore FILE): shown as a hint.

import { createBackup, downloadBackup, fetchBackups } from "./api.js";
import { locale, t } from "./i18n.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const KINDS = ["daily", "manual", "pre-migration", "pre-restore", "other"];

const size = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export async function showBackupsDialog({ toast = () => {} } = {}) {
  const dialog = el("dialog", "pf-dialog backups-dialog");
  dialog.setAttribute("aria-labelledby", "bk-title");
  const wrap = el("div", "pf");
  const head = el("header", "pf-head");
  const h = el("h2", null, t("backups.title"));
  h.id = "bk-title";
  const x = el("button", "icon-btn");
  x.type = "button";
  x.setAttribute("aria-label", t("backups.close"));
  x.innerHTML = CLOSE_SVG;
  x.addEventListener("click", () => dialog.close());
  head.append(h, x);

  const body = el("div", "pf-body");
  const intro = el("p", "muted pf-note");
  const actions = el("div", "bk-actions");
  const now = el("button", "btn btn-primary", t("backups.now"));
  now.type = "button";
  actions.append(now);
  const list = el("div", "bk-list");
  const restore = el("details", "bk-restore");
  restore.append(el("summary", null, t("backups.restore_title")));
  const steps = el("ol", "small");
  for (const key of ["backups.restore_step1", "backups.restore_step2", "backups.restore_step3"]) {
    const li = el("li");
    const text = t(key);
    // commands between `backticks` are shown as code
    text.split(/(`[^`]+`)/).forEach((part) => li.append(part.startsWith("`") ? el("code", null, part.slice(1, -1)) : part));
    steps.append(li);
  }
  restore.append(steps);
  body.append(intro, actions, list, restore);
  wrap.append(head, body);
  dialog.append(wrap);
  document.body.append(dialog);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());

  const fmt = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  async function render(highlight = null) {
    let data;
    try {
      data = await fetchBackups();
    } catch (err) {
      list.replaceChildren(el("p", "pf-error", err.message));
      return;
    }
    intro.textContent = t("backups.intro", {
      daily: data.keep_daily, weekly: data.keep_weekly, monthly: data.keep_monthly, folder: data.folder,
    });
    if (!data.backups.length) {
      list.replaceChildren(el("p", "muted", t("backups.empty")));
      return;
    }
    list.replaceChildren(...data.backups.map((b) => {
      const row = el("div", `bk-row${b.name === highlight ? " bk-new" : ""}`);
      const when = el("div", "bk-when");
      const date = fmt.format(new Date(b.created));
      when.append(el("strong", null, date.charAt(0).toUpperCase() + date.slice(1)), el("span", "muted small bk-name", b.name));
      const kind = el("span", `badge tone-${b.kind === "daily" ? "info" : b.kind === "manual" ? "ok" : "neutral"}`,
        t(`backups.kind.${KINDS.includes(b.kind) ? b.kind : "other"}`));
      kind.title = t(`backups.kind_hint.${KINDS.includes(b.kind) ? b.kind : "other"}`);
      const dl = el("button", "btn btn-small", t("backups.download"));
      dl.type = "button";
      dl.title = t("backups.download_hint");
      dl.addEventListener("click", async () => {
        dl.disabled = true;
        try {
          await downloadBackup(b.name);
        } catch (err) {
          toast(err.message);
        } finally {
          dl.disabled = false;
        }
      });
      row.append(when, kind, el("span", "muted small bk-size", size(b.size)), dl);
      return row;
    }));
  }

  now.addEventListener("click", async () => {
    now.disabled = true;
    try {
      const b = await createBackup();
      toast(t("backups.created", { name: b.name }));
      await render(b.name);
    } catch (err) {
      toast(t("backups.failed", { message: err.message }));
    } finally {
      now.disabled = false;
    }
  });

  dialog.showModal();
  await render();
}
