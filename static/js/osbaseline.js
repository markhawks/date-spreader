// Up-to-date versions of the operating systems (Settings → Administration → Operating systems):
// for each family and major, the minor considered up to date. A server with the same family and
// major and an OLDER minor is outdated: its OS is highlighted in yellow in the server lists.

import { fetchOsBaselines } from "./api.js";
import { t } from "./i18n.js";

let baselines = [];
let loading = null;
const listeners = new Set();

/** Loads the versions (once; force = again, e.g. after an administrator changed them). */
export function loadBaselines(force = false) {
  if (loading && !force) return loading;
  loading = fetchOsBaselines()
    .then((res) => { baselines = res.baselines; listeners.forEach((fn) => fn()); return baselines; })
    .catch(() => baselines);
  return loading;
}

export function setBaselines(list) {
  baselines = list;
  loading = Promise.resolve(list);
  listeners.forEach((fn) => fn());
}

export function onBaselinesChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** "Red Hat Enterprise Linux 9.6" → { family, major: 9, minor: 6 } (null without a minor). */
export function parseOs(name) {
  const m = /^(.*\S)\s+(\d+)\.(\d+)$/.exec((name ?? "").trim());
  return m ? { family: m[1], major: Number(m[2]), minor: Number(m[3]) } : null;
}

/** The up-to-date version for this OS if the OS is older than it, otherwise null. */
export function outdatedBy(name) {
  const os = parseOs(name);
  if (!os) return null;
  const b = baselines.find((x) => x.major === os.major && x.family.toLowerCase() === os.family.toLowerCase());
  return b && os.minor < b.minor ? b : null;
}

/** Marks an element showing an OS: yellow + tooltip when it is outdated. */
export function markOutdated(node, name) {
  const b = outdatedBy(name);
  node.classList.toggle("os-outdated", Boolean(b));
  if (b) {
    const hint = t("osbaseline.outdated", { version: `${b.major}.${b.minor}` });
    node.title = name ? `${name} — ${hint}` : hint;
  }
  return node;
}
