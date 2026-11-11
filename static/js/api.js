// Chiamate al backend. Gli errori sono ApiError con `status` e il corpo della risposta.

import { getLanguage, t } from "./i18n.js";

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }

  get isConflict() { return this.status === 409; }

  /** Valori attuali restituiti con un 409, se presenti. */
  get current() { return this.body?.detail?.current ?? null; }
}

/** Messaggio leggibile dal `detail` di FastAPI (stringa, oggetto o lista di errori di validazione). */
function detailMessage(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (detail?.message) return detail.message;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => (d.msg ?? "").replace(/^Value error, /, "")).join(" ");
  }
  return fallback;
}

/** Eventi globali: la sessione è scaduta / serve cambiare la password. */
export const AUTH_REQUIRED = "datespreader:auth-required";
export const PASSWORD_CHANGE = "datespreader:password-change";
const AUTH_PATHS = ["/api/auth/login", "/api/auth/me", "/api/auth/change-password"];

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        // Intestazione anti-CSRF: richiesta dal server per ogni modifica.
        "X-Requested-With": "datespreader",
        // Language of the server's messages (errors, changelog)
        "Accept-Language": getLanguage(),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(t("api.unreachable"), 0, null);
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* risposta non JSON */ }
  if (!res.ok) {
    const code = data?.detail?.code;
    if (!AUTH_PATHS.some((p) => url.startsWith(p))) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent(AUTH_REQUIRED));
      if (code === "password_change_required") window.dispatchEvent(new CustomEvent(PASSWORD_CHANGE));
    }
    throw new ApiError(detailMessage(data?.detail, `HTTP ${res.status}`), res.status, data);
  }
  return data;
}

const getJSON = (url) => request("GET", url);

/** Scarica un file prodotto dal server (export) con il nome che indica il server. */
async function downloadFile(url) {
  let res;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      headers: { "X-Requested-With": "datespreader", "Accept-Language": getLanguage() },
    });
  } catch {
    throw new ApiError(t("api.unreachable"), 0, null);
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* risposta non JSON */ }
    if (res.status === 401) window.dispatchEvent(new CustomEvent(AUTH_REQUIRED));
    throw new ApiError(detailMessage(data?.detail, `HTTP ${res.status}`), res.status, data);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "datespreader-export.json";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await res.blob());
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  return name;
}

// --- export / import tra installazioni di Date Spreader -----------------------------------
export const exportProject = (id) => downloadFile(`/api/export/projects/${encodeURIComponent(id)}`);
export const exportCustomer = (id) => downloadFile(`/api/export/customers/${encodeURIComponent(id)}`);
export const importPreview = (data, onConflict) => request("POST", "/api/import/preview", { data, on_conflict: onConflict });
// --- database backups (administrators) ---------------------------------------------------
export const fetchBackups = () => getJSON("/api/backups");
export const createBackup = () => request("POST", "/api/backups");
export const downloadBackup = (name) => downloadFile(`/api/backups/${encodeURIComponent(name)}`);
export const importRun = (data, onConflict) => request("POST", "/api/import", { data, on_conflict: onConflict });
const q = encodeURIComponent;

export const fetchHealth = () => getJSON("/api/health");
export const fetchProjects = () => getJSON("/api/projects");
export const fetchEvents = (start, end) => getJSON(`/api/events?start=${q(start)}&end=${q(end)}`);
export const fetchEvent = (id) => getJSON(`/api/events/${q(id)}`);
export const fetchDay = (iso) => getJSON(`/api/days/${q(iso)}`);
/** Tecnici; con `all` anche quelli disattivati. */
export const fetchUsers = (all = false) => getJSON(all ? "/api/users?all=true" : "/api/users");
export const createUser = (data) => request("POST", "/api/users", data);
/** Tecnico al volo (tutti gli utenti): riusa quello con lo stesso nome o lo crea. */
export const addTechnician = (displayName) => request("POST", "/api/users/technicians", { display_name: displayName });
export const patchUser = (id, changes) => request("PATCH", `/api/users/${q(id)}`, changes);
export const setParticipants = (eventId, userIds) =>
  request("PUT", `/api/events/${q(eventId)}/participants`, { user_ids: userIds });
export const fetchOptions = () => getJSON("/api/options");

/** Modifica parziale di una riga server. `changes` contiene solo i campi cambiati. */
export const patchServerRow = (rowId, changes) => request("PATCH", `/api/event-servers/${q(rowId)}`, changes);
export const importServers = (eventId, data) => request("POST", `/api/events/${q(eventId)}/servers/import`, data);
export const addServerRow = (eventId, data) => request("POST", `/api/events/${q(eventId)}/servers`, data);
export const deleteServerRow = (rowId, version) =>
  request("DELETE", `/api/event-servers/${q(rowId)}?version=${q(version)}`);
export const patchEvent = (eventId, changes) => request("PATCH", `/api/events/${q(eventId)}`, changes);
export const search = (text) => getJSON(`/api/search?q=${q(text)}`);
/** Senza `since`: solo il punto di partenza. Con `since`: interventi modificati dopo quell'id. */
export const fetchChanges = (since) => getJSON(since == null ? "/api/changes" : `/api/changes?since=${q(since)}`);
export const createProject = (data) => request("POST", "/api/projects", data);
/** Anagrafica server: ricerca su tutti i server (anche quelli non più in interventi). */
export const listServers = (text = "", limit = 500) =>
  getJSON(`/api/servers?limit=${limit}${text ? `&q=${q(text)}` : ""}`);
export const fetchServer = (id) => getJSON(`/api/servers/${q(id)}`);

// --- accesso, versione, utenti ---------------------------------------------------------
export const fetchMe = () => getJSON("/api/auth/me");
export const login = (loginName, password) => request("POST", "/api/auth/login", { login: loginName, password });
export const logout = () => request("POST", "/api/auth/logout");
export const changePassword = (currentPassword, newPassword) =>
  request("POST", "/api/auth/change-password", { current_password: currentPassword, new_password: newPassword });
export const fetchChangelog = () => getJSON("/api/changelog");
export const temporaryPassword = (userId) => request("POST", `/api/users/${q(userId)}/temporary-password`);
export const patchProject = (projectId, changes) => request("PATCH", `/api/projects/${q(projectId)}`, changes);
export const addEvent = (projectId, data) => request("POST", `/api/projects/${q(projectId)}/events`, data);
export const duplicateEvent = (eventId, data) => request("POST", `/api/events/${q(eventId)}/duplicate`, data);
export const deleteEvent = (eventId, version) => request("DELETE", `/api/events/${q(eventId)}?version=${q(version)}`);
// --- elenco sistemi operativi -----------------------------------------------------------
export const fetchOperatingSystems = (all = false) => getJSON(all ? "/api/operating-systems?all=true" : "/api/operating-systems");
export const createOperatingSystem = (data) => request("POST", "/api/operating-systems", data);
export const setOperatingSystemActive = (id, active) => request("PATCH", `/api/operating-systems/${q(id)}`, { is_active: active });
export const deleteOperatingSystem = (id) => request("DELETE", `/api/operating-systems/${q(id)}`);
// --- preferenze personali ------------------------------------------------------------------
export const fetchPreferences = () => getJSON("/api/me/preferences");
export const savePreferences = (changes) => request("PATCH", "/api/me/preferences", changes);
// --- clienti --------------------------------------------------------------------------------
export const fetchCustomers = () => getJSON("/api/customers");
export const createCustomer = (name) => request("POST", "/api/customers", { name });
export const renameCustomer = (id, version, name) => request("PATCH", `/api/customers/${q(id)}`, { version, name });
export const deleteCustomer = (id) => request("DELETE", `/api/customers/${q(id)}`);
export const deleteProject = (projectId, version) => request("DELETE", `/api/projects/${q(projectId)}?version=${q(version)}`);
export const patchCustomer = (id, version, changes) => request("PATCH", `/api/customers/${q(id)}`, { version, ...changes });
