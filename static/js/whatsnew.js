// What's new: after an update, the first time a user opens the portal, a window shows the changes of the
// new version(s) (from the changelog, in the user's language). A "> " line at the top of a version is its
// message, shown highlighted. "Don't show again" turns it off (back on in Settings → Appearance).

import { fetchChangelog } from "./api.js";
import { renderMarkdown, showChangelog } from "./auth.js";
import { formatMediumDate } from "./dates.js";
import { t } from "./i18n.js";
import { prefs } from "./prefs.js";

const MAX_VERSIONS = 5;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const parts = (v) => v.split(".").map(Number);
/** -1, 0, 1 like a comparison of version numbers "x.y.z". */
export function compareVersions(a, b) {
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/**
 * The sections of the changelog newer than `seen`, up to `current` (newest first).
 * @returns {{ version: string, date: string|null, markdown: string }[]}
 */
export function newSections(markdown, current, seen) {
  const re = /^## \[(\d+\.\d+\.\d+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?.*$/gm;
  const heads = [...markdown.matchAll(re)];
  const out = [];
  heads.forEach((m, i) => {
    const version = m[1];
    if (compareVersions(version, current) > 0) return;
    if (seen ? compareVersions(version, seen) <= 0 : version !== current) return;
    const end = i + 1 < heads.length ? heads[i + 1].index : markdown.length;
    out.push({ version, date: m[2] ?? null, markdown: markdown.slice(m.index + m[0].length, end).trim() });
  });
  return out.slice(0, MAX_VERSIONS);
}

/** Shows the window if the user has not seen this version yet (and has not turned it off). */
export async function maybeShowWhatsNew(version) {
  const p = prefs.get();
  if (!p.whats_new || !/^\d+\.\d+\.\d+$/.test(version ?? "") || p.whats_new_seen === version) return;
  if (p.whats_new_seen && compareVersions(p.whats_new_seen, version) > 0) return; // older version installed again
  let sections;
  try {
    sections = newSections((await fetchChangelog()).markdown, version, p.whats_new_seen);
  } catch {
    return; // not essential: it will be proposed next time
  }
  if (!sections.length) {
    prefs.set({ whats_new_seen: version }).catch(() => {});
    return;
  }
  showWhatsNew(version, sections);
}

function showWhatsNew(version, sections) {
  const dialog = el("dialog", "pf-dialog changelog-dialog whatsnew-dialog");
  dialog.setAttribute("aria-labelledby", "wn-title");
  const head = el("header", "pf-head");
  const h = el("h2", null, t("whatsnew.title", { version }));
  h.id = "wn-title";
  head.append(h);
  const body = el("div", "pf-body changelog");
  body.append(el("p", "muted", t("whatsnew.intro", { version })));
  for (const s of sections) {
    if (sections.length > 1 || s.date) {
      body.append(el("h3", "whatsnew-version", s.date
        ? t("whatsnew.version_date", { version: s.version, date: formatMediumDate(s.date) })
        : t("whatsnew.version", { version: s.version })));
    }
    const box = el("div");
    box.innerHTML = renderMarkdown(s.markdown);
    body.append(box);
  }
  const foot = el("footer", "pf-foot whatsnew-foot");
  const off = el("label", "share-choose");
  const cb = el("input");
  cb.type = "checkbox";
  off.append(cb, " ", t("whatsnew.dont_show"));
  const all = el("button", "btn", t("whatsnew.all"));
  all.type = "button";
  const ok = el("button", "btn btn-primary", t("whatsnew.ok"));
  ok.type = "button";
  foot.append(off, all, ok);
  const wrap = el("div", "pf");
  wrap.append(head, body, foot);
  dialog.append(wrap);
  document.body.append(dialog);

  let openAll = false;
  all.addEventListener("click", () => { openAll = true; dialog.close(); });
  ok.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialog.remove();
    prefs.set(cb.checked ? { whats_new_seen: version, whats_new: false } : { whats_new_seen: version }).catch(() => {});
    if (openAll) showChangelog();
  });
  dialog.showModal();
  ok.focus();
}
