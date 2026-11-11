import { AUTH_REQUIRED, PASSWORD_CHANGE, fetchChanges, fetchEvent, fetchHealth, fetchMe, fetchProjects } from "./api.js";
import { showChangePassword, showChangelog, showLogin, userMenu } from "./auth.js";
import { Calendar, ZOOM_MAX, ZOOM_MIN } from "./calendar.js";
import { chooseEvent } from "./chooser.js";
import { assignColors } from "./colors.js";
import { DetailPanel } from "./detail.js";
import { customers, showCustomersDialog } from "./customers.js";
import { FilterBar } from "./filters.js";
import { Inventory } from "./inventory.js";
import { PeopleDialog, people } from "./people.js";
import { ProjectDialog, duplicateEventFlow, editEvent, newEventOnDate } from "./projectdialog.js";
import { showContextMenu } from "./contextmenu.js";
import { formatMediumDate } from "./dates.js";
import { TopbarClock } from "./clock.js";
import { ProjectForm } from "./projectform.js";
import { showOsDialog } from "./osdialog.js";
import { prefs } from "./prefs.js";
import { showSettings } from "./settings.js";
import { session } from "./session.js";
import { Sheet } from "./sheet.js";
import { showShareDialog } from "./share.js";
import { Sidebar, attachSidebarResizer } from "./sidebar.js";
import { showImportDialog } from "./transfer.js";
import { adoptLanguagePreference, t, translateStatic } from "./i18n.js";

const $ = (id) => document.getElementById(id);

const POLL_MS = 10_000; // ogni quanto controllare le modifiche degli altri utenti

function showError(message) {
  const banner = $("banner");
  banner.textContent = message;
  banner.hidden = false;
}

let toastTimer;
function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3000);
}

async function checkSchema() {
  try {
    const health = await fetchHealth();
    if (!health.database.schema.up_to_date) {
      showError(t("main.schema_outdated", { command: ".venv/bin/python -m app.cli init" }));
      return false;
    }
  } catch (err) {
    showError(t("main.server_unavailable", { message: err.message }));
    return false;
  }
  return true;
}

/**
 * Accesso: restituisce l'utente corrente, oppure mostra il login (o il cambio password
 * obbligatorio) e restituisce null. Dopo l'accesso la pagina si ricarica.
 */
async function authenticate() {
  let me;
  try {
    me = await fetchMe();
  } catch (err) {
    if (err.status === 401) {
      let info = {};
      try { info = await (await fetch("/api/version")).json(); } catch { /* facoltativa */ }
      showLogin({ version: info.version, source: info.source_url, onSuccess: () => location.reload() });
    } else {
      showError(t("main.server_unavailable", { message: err.message }));
    }
    return null;
  }
  if (me.must_change_password) {
    await showChangePassword({ forced: true });
    location.reload();
    return null;
  }
  // Sessione scaduta o password da cambiare mentre si lavora: una sola schermata alla volta.
  let prompting = false;
  window.addEventListener(AUTH_REQUIRED, () => {
    if (prompting) return;
    prompting = true;
    showLogin({ message: t("main.session_expired"), onSuccess: () => location.reload() });
  });
  window.addEventListener(PASSWORD_CHANGE, async () => {
    if (prompting) return;
    prompting = true;
    await showChangePassword({ forced: true });
    location.reload();
  });
  return me;
}

async function main() {
  translateStatic(); // texts of index.html in the page language
  if (!(await checkSchema())) return;
  const me = await authenticate();
  if (!me) return;
  session.me = me;
  await prefs.load(); // tema e posizione dell'anteprima prima di disegnare
  // The user's language (saved preference) differs from the one the page was built with: reload once
  if (adoptLanguagePreference(prefs.get().language)) return;
  document.body.classList.add("signed-in");
  let projects = [];

  /** Nuovo intervento in una data: scelta del progetto, poi modulo con la data già compilata. */
  async function addEventOnDate(iso) {
    if (!projects.length) return toast(t("main.no_projects_yet"));
    const ev = await newEventOnDate(projects, iso);
    if (!ev) return;
    await reloadProjects();
    await calendar.refreshDate(ev.event_date);
    sidebar.setActive(ev.project.id);
    await showProjectEvent(ev);
    toast(t("main.event_created"));
  }

  const calendar = new Calendar($("calendar-scroll"), $("months"), {
    onError: (err) => showError(err.message),
    // Tasto destro (o pressione prolungata) su un giorno: crea un progetto o un intervento in quella data
    onDayContext: (iso, { x, y, hasEvents, done }) => {
      showContextMenu(x, y, {
        title: formatMediumDate(iso),
        onClose: done,
        items: [
          { label: t("main.ctx_new_project"), hint: t("main.ctx_new_project_hint"), onSelect: () => projectForm.open({ date: iso }) },
          {
            label: t("main.ctx_new_event"),
            disabled: !projects.length,
            onSelect: () => addEventOnDate(iso),
          },
          ...(hasEvents ? [{ label: t("main.ctx_open_day"), onSelect: () => {
            calendar.setSelected(iso);
            detail.openDay(iso);
          } }] : []),
        ],
      });
    },
    onDayClick: (iso, eventId) => {
      sidebar.setActive(null);
      calendar.setSelected(iso);
      detail.openDay(iso, eventId);
    },
  });

  const share = (eventId) => showShareDialog(eventId, { me, toast }).catch((err) => toast(err.message));
  const sheet = new Sheet($("sheet"), {
    toast,
    onShare: share,
    onClose: async (changed) => {
      if (!changed) return;
      // Dopo le modifiche: aggiorna la scheda laterale e i conteggi nel calendario.
      const iso = sheet.event?.event_date;
      await Promise.all([detail.reload(), iso ? calendar.refreshDate(iso) : null]);
      if (iso && calendar.selected) calendar.setSelected(calendar.selected);
    },
  });

  let rowsTimer;
  const detail = new DetailPanel($("detail"), {
    projectById: (id) => projects.find((p) => p.id === id),
    onExpand: (eventId) => sheet.open(eventId),
    onShare: share,
    toast,
    // Stato dell'intervento cambiato dalla scheda: aggiorna il calendario (stile della chip).
    onEventChanged: (ev) => calendar.refreshDate(ev.event_date),
    onNewEvent: (iso) => addEventOnDate(iso),
    onNewProject: (iso) => projectForm.open({ date: iso }),
    onDuplicate: async (ev) => {
      let copy;
      try {
        copy = await duplicateEventFlow(ev.id);
      } catch (err) {
        return toast(err.message);
      }
      if (!copy) return;
      await reloadProjects();
      await calendar.refreshDate(copy.event_date);
      await showProjectEvent(copy);
      toast(t("main.event_duplicated", { date: formatMediumDate(copy.event_date) }));
    },
    onEditEvent: async (ev) => {
      const res = await editEvent(ev.id);
      if (!res) return;
      await reloadProjects();
      if (res.deleted) {
        await calendar.refreshDate(res.deleted.event_date);
        detail.close();
        toast(t("main.event_deleted"));
        return;
      }
      if (res.previousDate && res.previousDate !== res.saved.event_date) await calendar.refreshDate(res.previousDate);
      await showProjectEvent(res.saved);
      await calendar.refreshDate(res.saved.event_date);
      calendar.setSelected(res.saved.event_date);
    },
    // Anteprima in basso: dopo le modifiche nella tabella aggiorna il calendario (numero di server)
    onRowsChanged: (ev) => {
      clearTimeout(rowsTimer);
      rowsTimer = setTimeout(() => calendar.refreshDate(ev.event_date).then(() => {
        if (calendar.selected) calendar.setSelected(calendar.selected);
      }), 800);
    },
    onResizeEnd: (pct) => prefs.set({ bottom_panel_height: pct }).catch((err) => toast(err.message)),
    onEditProject: (projectId) => {
      const p = projects.find((x) => x.id === projectId);
      if (p) projectDialog.open(p);
    },
    onPickEvent: (projectEvent) => showProjectEvent(projectEvent),
    onClose: () => {
      calendar.setSelected(null);
      sidebar.setActive(null);
    },
  });

  /** Apre la scheda di un intervento e porta il calendario sulla sua data. */
  async function showProjectEvent(projectEvent, { highlightRowId = null } = {}) {
    calendar.setSelected(projectEvent.event_date);
    await detail.openEvent(projectEvent.id, { highlightRowId });
    // Dopo l'apertura del pannello il calendario può aver cambiato larghezza: ricentra ora.
    await calendar.goToDate(projectEvent.event_date);
  }

  const sidebar = new Sidebar({
    listEl: $("project-list"),
    searchEl: $("project-search"),
    emptyEl: $("project-empty"),
    countEl: $("project-count"),
    serversEl: $("server-hits"),
    // Risultato della ricerca server: apre l'intervento ed evidenzia la riga.
    onServerHit: (hit) => {
      sidebar.setActive(hit.project_id);
      showProjectEvent({ id: hit.event_id, event_date: hit.event_date }, { highlightRowId: hit.row_id });
    },
    onCreate: () => projectForm.open(),
    onEdit: (project) => projectDialog.open(project),
    onSelect: async (project, tile) => {
      if (!project.events.length) {
        projectDialog.open(project); // da qui si aggiunge il primo intervento
        return;
      }
      sidebar.setActive(project.id);
      const chosen = project.events.length === 1
        ? project.events[0]
        : await chooseEvent(tile, project);
      if (!chosen) {
        if (!detail.isOpen) sidebar.setActive(null);
        return;
      }
      sidebar.setActive(project.id);
      await showProjectEvent(chosen);
    },
  });

  $("btn-today").addEventListener("click", () => calendar.scrollToToday());

  // Zoom del calendario: tasto centrale + mouse avanti/indietro, pizzico sul touchpad, pulsanti − % +.
  // Il livello è una preferenza personale.
  const zoomValue = $("zoom-reset");
  const showZoom = (z) => {
    zoomValue.textContent = `${Math.round(z * 100)}%`;
    $("zoom-out").disabled = z <= ZOOM_MIN;
    $("zoom-in").disabled = z >= ZOOM_MAX;
  };
  const saveZoom = (z) => {
    if (z !== prefs.get().calendar_zoom) prefs.set({ calendar_zoom: z }).catch(() => {});
  };
  calendar.onZoom = showZoom;
  calendar.onZoomEnd = saveZoom;
  const stepZoom = (factor) => { calendar.setZoom(calendar.zoom * factor); saveZoom(calendar.zoom); };
  $("zoom-in").addEventListener("click", () => stepZoom(1.25));
  $("zoom-out").addEventListener("click", () => stepZoom(1 / 1.25));
  zoomValue.addEventListener("click", () => stepZoom(1 / calendar.zoom));
  calendar.setZoom(prefs.get().calendar_zoom);

  // Vista del calendario: Mese | Settimana (preferenza personale)
  const viewSwitch = [...document.querySelectorAll(".view-switch-btn")];
  const showView = (view) => viewSwitch.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  const applyView = async (view) => {
    showView(view);
    await calendar.setView(view);
    if (calendar.selected) calendar.setSelected(calendar.selected);
  };
  viewSwitch.forEach((b) => b.addEventListener("click", () => {
    const view = b.dataset.view;
    if (view === calendar.view) return;
    applyView(view);
    prefs.set({ calendar_view: view }).catch((err) => toast(t("main.pref_not_saved", { message: err.message })));
  }));
  prefs.onChange((p, changes) => {
    if ("calendar_view" in changes && p.calendar_view !== calendar.view) applyView(p.calendar_view);
  });
  calendar.useView(prefs.get().calendar_view);
  showView(calendar.view);

  // Colonna progetti: vista (quadrati/rettangoli), ordinamento, larghezza — preferenze personali.
  const viewBtns = [...document.querySelectorAll(".view-btn")];
  const syncSidebarControls = (p) => {
    $("project-sort").value = `${p.project_sort}|${p.project_group}`;
    viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === p.project_view)));
  };
  const savePref = (changes) => prefs.set(changes).catch((err) => toast(t("main.pref_not_saved", { message: err.message })));
  $("project-sort").addEventListener("change", (e) => {
    const [sort, group] = e.target.value.split("|");
    savePref({ project_sort: sort, project_group: group });
  });
  viewBtns.forEach((b) => b.addEventListener("click", () => savePref({ project_view: b.dataset.view })));
  attachSidebarResizer(document.querySelector(".sidebar-resizer"), document.querySelector(".sidebar"), {
    onEnd: (px) => savePref({ sidebar_width: px }),
  });
  sidebar.setDisplay({ view: prefs.get().project_view, sort: prefs.get().project_sort, group: prefs.get().project_group });
  syncSidebarControls(prefs.get());
  prefs.onChange((p, changes) => {
    if ("project_view" in changes || "project_sort" in changes || "project_group" in changes) {
      sidebar.setDisplay({ view: p.project_view, sort: p.project_sort, group: p.project_group });
      syncSidebarControls(p);
    }
  });

  /** Ricarica l'elenco progetti (colori stabili: assegnati per id, i nuovi prendono il successivo). */
  let lastColors = "";
  async function reloadProjects() {
    const active = Number($("project-list").querySelector(".project-tile.active")?.dataset.projectId) || null;
    [projects] = await Promise.all([fetchProjects(), customers.load(true)]);
    const before = projects.map((p) => `${p.id}:${p.customer_color ?? ""}`).join();
    assignColors(projects);
    if (before !== lastColors) {
      lastColors = before;
      calendar.rerender(); // i colori dei clienti sono cambiati: ridisegna le chip
    }
    sidebar.setProjects(projects);
    if (active) sidebar.setActive(active);
  }

  // Anagrafica server: dallo storico si apre l'intervento con la riga del server evidenziata.
  const inventory = new Inventory($("inventory"), {
    onOpenEvent: (h) => {
      sidebar.setActive(h.project_id);
      showProjectEvent({ id: h.event_id, event_date: h.event_date }, { highlightRowId: h.row_id });
    },
  });
  $("btn-servers").addEventListener("click", () => inventory.open());

  const peopleDialog = new PeopleDialog({ toast });
  // Gestione utenti: solo amministratori.
  if (me.is_admin) $("btn-people").addEventListener("click", () => peopleDialog.open());
  else $("btn-people").remove();
  // Impostazioni: personali per tutti, amministrazione per gli admin.
  $("btn-settings").addEventListener("click", () => showSettings({
    me,
    toast,
    adminActions: [
      [t("main.admin_users"), t("main.admin_users_hint"), () => peopleDialog.open()],
      [t("main.admin_os"), t("main.admin_os_hint"), () => showOsDialog({ toast })],
      [t("main.admin_customers"), t("main.admin_customers_hint"), () => showCustomersDialog({ toast, onChanged: () => reloadProjects() })],
      [t("main.admin_import"), t("main.admin_import_hint"), () => showImportDialog({
        toast,
        onImported: async () => {
          await Promise.all([reloadProjects(), people.load(true)]);
          await calendar.reload();
        },
      })],
    ],
  }));
  // Pulsante nella barra dell'anteprima: in basso ↔ a destra (stessa preferenza delle Impostazioni)
  // «+ Intervento» nella barra dell'anteprima: nuovo intervento nel giorno mostrato
  $("btn-detail-new-event").addEventListener("click", () => {
    if (detail.currentDate) addEventOnDate(detail.currentDate);
  });
  const positionBtn = $("btn-detail-position");
  const syncPositionBtn = (p) => {
    const label = p.detail_position === "bottom" ? t("main.preview_to_right") : t("main.preview_to_bottom");
    positionBtn.title = label;
    positionBtn.setAttribute("aria-label", label);
  };
  syncPositionBtn(prefs.get());
  positionBtn.addEventListener("click", () => {
    const next = prefs.get().detail_position === "bottom" ? "right" : "bottom";
    prefs.set({ detail_position: next }).catch((err) => toast(t("main.pref_not_saved", { message: err.message })));
  });
  prefs.onChange((p, changes) => { if ("detail_position" in changes) syncPositionBtn(p); });

  // Cambio di posizione dell'anteprima: ridisegna subito quella aperta.
  prefs.onChange((_, changes) => {
    if ("time_format" in changes) {
      calendar.rerender();
      if (detail.isOpen) detail.reload();
    }
    if ("detail_position" in changes && detail.isOpen) {
      detail.reload().then(() => { if (calendar.selected) calendar.goToDate(calendar.selected, { flash: false }); });
    }
  });
  $("version-link").textContent = `v${me.version}`;

  // Data e orologio nella barra in alto (preferenza personale)
  const clock = new TopbarClock($("topbar-clock"));
  clock.setMode(prefs.get().topbar_clock);
  prefs.onChange((p, changes) => {
    if ("topbar_clock" in changes) clock.setMode(p.topbar_clock);
    if ("time_format" in changes) clock.refresh();
  });
  $("version-link").addEventListener("click", () => showChangelog());
  $("topbar-actions").append(userMenu(me, {
    onLogout: () => location.reload(),
    adminItems: [[t("main.admin_os"), () => showOsDialog({ toast })]],
  }));
  // Menu del filtro per tecnico: tutti, anche i disattivati (per rivedere interventi passati).
  people.onChange((users) => filters.setUsers(users));
  customers.onChange((list) => filters.setCustomers(list));

  const projectDialog = new ProjectDialog({
    onSaved: async (p) => {
      await reloadProjects();
      // Il nome compare nelle chip: ridisegna i mesi dei suoi interventi
      await Promise.all(p.events.map((e) => calendar.refreshDate(e.event_date)));
      if (detail.isOpen) await detail.reload();
      toast(t("main.project_saved", { name: p.name }));
    },
    onOpenEvent: (pe) => showProjectEvent(pe),
    toast,
    onEventDeleted: async (ev) => {
      await reloadProjects();
      await calendar.refreshDate(ev.event_date);
      if (detail.showsAnyEvent([ev.id])) detail.close();
      toast(t("main.event_deleted"));
    },
    onProjectDeleted: async (p) => {
      await reloadProjects();
      await Promise.all(p.events.map((e) => calendar.refreshDate(e.event_date)));
      if (detail.showsAnyEvent(p.events.map((e) => e.id))) detail.close();
      sidebar.setActive(null);
      toast(t("main.project_deleted", { name: p.name }));
    },
    onEventCreated: async (ev) => {
      await reloadProjects();
      await calendar.refreshDate(ev.event_date);
      sidebar.setActive(ev.project.id);
      await showProjectEvent(ev);
      toast(t("main.event_created"));
    },
  });

  const projectForm = new ProjectForm({
    onCreated: async (project) => {
      await reloadProjects();
      sidebar.setActive(project.id);
      const first = project.events[0];
      if (first) {
        await calendar.refreshDate(first.event_date);
        await showProjectEvent(first);
        toast(t("main.project_created", { name: project.name }));
      } else {
        toast(t("main.project_created_empty", { name: project.name }));
      }
    },
  });

  const filters = new FilterBar({
    barEl: $("filter-bar"),
    toggleBtn: $("btn-filters"),
    // Il filtro per cliente vale per il calendario e per la colonna progetti
    onChange: (predicate) => {
      calendar.setFilter(predicate);
      sidebar.setCustomerFilter(filters.state.customerId);
    },
  });

  /** Controlla periodicamente le modifiche degli altri utenti e aggiorna ciò che è a video. */
  async function startLiveUpdates() {
    let since;
    try {
      since = (await fetchChanges()).last_id;
    } catch {
      return; // senza feed l'app funziona comunque: si aggiorna ricaricando la pagina
    }
    let busy = false;
    const poll = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const res = await fetchChanges(since);
        since = res.last_id;
        if (res.projects_changed) await reloadProjects();
        if (res.users_changed) await people.load(true);
        if (inventory.isOpen && (res.events.length || res.projects_changed)) await inventory.refresh();
        if (!res.events.length && !(res.dates ?? []).length) return;
        const ids = res.events.map((e) => e.id);
        // Mesi da ridisegnare: date attuali degli interventi toccati + vecchie date (spostati/eliminati)
        const months = new Map([...res.events.map((e) => e.event_date), ...(res.dates ?? [])].map((d) => [d.slice(0, 7), d]));
        await Promise.all([...months.values()].map((iso) => calendar.refreshDate(iso)));
        if (calendar.selected) calendar.setSelected(calendar.selected);
        if (sheet.isOpen && ids.includes(sheet.event?.id)) await sheet.syncFromServer();
        else if (!sheet.isOpen && detail.showsAnyEvent(ids)) await detail.sync(ids);
      } catch {
        /* rete momentaneamente assente: riprova al prossimo giro */
      } finally {
        busy = false;
      }
    };
    setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  }

  // I colori servono anche al calendario: prima i progetti, poi il calendario.
  try {
    await reloadProjects();
  } catch (err) {
    showError(t("main.load_projects_error", { message: err.message }));
  }
  try {
    await people.load(); // avvisa i filtri, che applicano subito quelli salvati
  } catch (err) {
    showError(t("main.load_people_error", { message: err.message }));
  }
  await calendar.init();
  startLiveUpdates();

  // Link diretto a un intervento (es. dall'email condivisa): #intervento-123
  const openFromHash = async () => {
    const m = /^#intervento-(\d+)$/.exec(location.hash);
    if (!m) return;
    try {
      const ev = await fetchEvent(Number(m[1]));
      sidebar.setActive(ev.project.id);
      await showProjectEvent(ev);
    } catch {
      toast(t("main.link_event_missing"));
    }
    history.replaceState(null, "", location.pathname); // il link non si riapre a ogni ricarica
  };
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
}

main();
