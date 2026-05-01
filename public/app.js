// Developed by Benedict U.
// Frontend application core for Chorister TimeTable.
//
// This file intentionally holds only shared application state, generic helpers,
// home-page rendering, and startup orchestration.
//
// Modal-specific workflows live in:
//   - public/js/modals/auth.js
//   - public/js/modals/choristers.js
//   - public/js/modals/songs.js
//   - public/js/modals/lyrics.js
//   - public/js/modals/ratings.js
//   - public/js/modals/roster.js
//   - public/js/modals/analytics.js
//   - public/js/modals/prayer.js

// ---------------------------------------------------------------------------
// Dark / light theme
// ---------------------------------------------------------------------------

function setTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark-theme");
    document.body.classList.add("dark-theme");
  } else {
    document.documentElement.classList.remove("dark-theme");
    document.body.classList.remove("dark-theme");
  }
  localStorage.setItem("chorister-theme", theme);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-fill";
}

function toggleTheme() {
  setTheme(document.body.classList.contains("dark-theme") ? "light" : "dark");
}

// Apply the saved preference early to reduce theme flashing on load.
(function () {
  const saved = localStorage.getItem("chorister-theme");
  if (saved === "dark") document.documentElement.classList.add("dark-theme");
})();

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

let choristers = [];
let rosterEntries = [];
let songs = [];
let songStats = [];
let sortSongsByMostSung = false;
let selectedMonth = new Date();
let isAdmin = false;
let isChorister = false;
let choristerInfo = null;
let prayerEntries = [];
let prayerSelectedMonth = new Date();
let analyticsMonth = new Date();
let ratings = {};
let activePage = "home";

function openAnalyticsPage(options = {}) {
  setActivePage("analytics", options);
}

function setActivePage(page, options = {}) {
  const { syncAnalyticsMonth = true } = options;
  activePage = page;

  const analyticsView = document.getElementById("analyticsPageView");
  const homeBtn = document.getElementById("btnNavHome");
  const analyticsBtn = document.getElementById("btnNavAnalytics");
  const sections = document.querySelectorAll("[data-page]");

  sections.forEach((section) => {
    section.classList.toggle("d-none", section.dataset.page !== page);
  });
  if (analyticsView && page === "analytics") analyticsView.classList.remove("d-none");

  if (homeBtn) {
    const isActive = page === "home";
    homeBtn.classList.toggle("active", isActive);
    homeBtn.setAttribute("aria-pressed", String(isActive));
  }

  if (analyticsBtn) {
    const isActive = page === "analytics";
    analyticsBtn.classList.toggle("active", isActive);
    analyticsBtn.setAttribute("aria-pressed", String(isActive));
  }

  if (page === "analytics") {
    if (syncAnalyticsMonth) analyticsMonth = new Date(selectedMonth);
    loadAnalyticsMonthStats();
    renderCategoryAnalytics();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.detail || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const id = `toast-${Date.now()}`;
  const iconMap = {
    success: "bi-check-circle-fill",
    danger: "bi-x-circle-fill",
    warning: "bi-exclamation-triangle-fill",
  };
  const icon = iconMap[type] || "bi-info-circle-fill";

  const el = document.createElement("div");
  el.id = id;
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "assertive");
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${icon}"></i> ${escHtml(message)}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;

  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${btn.textContent.trim()}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
  }
}

function confirmAction(message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    document.getElementById("confirmMessage").textContent = message;
    document.getElementById("confirmOk").textContent = confirmLabel;

    const modal = new bootstrap.Modal(document.getElementById("confirmModal"));
    const okBtn = document.getElementById("confirmOk");
    const cancelBtn = document.getElementById("confirmCancel");

    function cleanup() {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.hide();
    }
    function onOk() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.show();
  });
}

// ---------------------------------------------------------------------------
// Session and shell state
// ---------------------------------------------------------------------------

function setAdminMode(authenticated) {
  isAdmin = authenticated;
  document.getElementById("authStatus").textContent = authenticated ? "Admin mode" : "Public view";
  document.getElementById("btnAddRoster").classList.toggle("d-none", !authenticated);
  document.getElementById("btnManageChoristers").classList.toggle("d-none", !authenticated);
  document.getElementById("btnLogin").classList.toggle("d-none", authenticated);
  document.getElementById("btnLogout").classList.toggle("d-none", !authenticated);
  document.getElementById("actionsHeader").classList.toggle("d-none", !authenticated);

  const adminDivider = document.getElementById("adminDivider");
  if (adminDivider) adminDivider.classList.toggle("d-none", !authenticated);

  const syncAllSection = document.getElementById("syncAllSection");
  if (syncAllSection) syncAllSection.classList.toggle("d-none", !authenticated);

  const prayerActionsHeader = document.getElementById("prayerActionsHeader");
  if (prayerActionsHeader) prayerActionsHeader.classList.toggle("d-none", !authenticated);

  const btnAddPrayerEntry = document.getElementById("btnAddPrayerEntry");
  if (btnAddPrayerEntry) btnAddPrayerEntry.classList.toggle("d-none", !authenticated);

  const prayerAddForm = document.getElementById("prayerAddForm");
  if (prayerAddForm && !authenticated) prayerAddForm.classList.add("d-none");

  updateSongFormVisibility();
}

function setChoristerMode(authenticated, info) {
  isChorister = authenticated;
  choristerInfo = info || null;

  const pill = document.getElementById("choristerStatus");
  const loginBtn = document.getElementById("btnChoristerLogin");
  const logoutBtn = document.getElementById("btnChoristerLogout");
  const myRatingsBtn = document.getElementById("btnMyRatings");

  if (authenticated && info) {
    pill.textContent = `Chorister: ${info.name}`;
    pill.classList.remove("d-none");
    loginBtn.classList.add("d-none");
    logoutBtn.classList.remove("d-none");
    if (myRatingsBtn) myRatingsBtn.classList.remove("d-none");
  } else {
    pill.classList.add("d-none");
    loginBtn.classList.remove("d-none");
    logoutBtn.classList.add("d-none");
    if (myRatingsBtn) myRatingsBtn.classList.add("d-none");
  }

  updateSongFormVisibility();
}

function updateSongFormVisibility() {
  const songForm = document.getElementById("songFormSection");
  if (songForm) songForm.classList.toggle("d-none", !(isAdmin || isChorister));
}

async function loadSession() {
  const session = await api("GET", "/api/auth/session");
  setAdminMode(Boolean(session.authenticated));
}

async function loadChoristerSession() {
  const session = await api("GET", "/api/auth/chorister-session");
  if (session.authenticated) {
    setChoristerMode(true, { chorister_id: session.chorister_id, name: session.name });
  } else {
    setChoristerMode(false, null);
  }
}

// ---------------------------------------------------------------------------
// Home roster view
// ---------------------------------------------------------------------------

function setMonthPickerValue() {
  const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
  document.getElementById("monthPicker").value = `${selectedMonth.getFullYear()}-${month}`;
}

function renderMonthTitle() {
  document.getElementById("monthTitle").textContent = selectedMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

async function loadRoster() {
  renderMonthTitle();
  setMonthPickerValue();

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;
  rosterEntries = await api("GET", `/api/roster?year=${year}&month=${month}`);

  if (isAdmin) {
    try {
      const list = await api("GET", `/api/ratings?year=${year}&month=${month}`);
      ratings = {};
      list.forEach((r) => {
        ratings[`${r.roster_entry_id}_${r.role}`] = r;
      });
    } catch (_) {
      ratings = {};
    }
  }

  renderRosterTable();
  renderMonthlyStats();
  if (typeof syncHomeLyricsMonthToSelectedMonth === "function") {
    syncHomeLyricsMonthToSelectedMonth();
  }
}

// ---------------------------------------------------------------------------
// Roster table rendering
// ---------------------------------------------------------------------------

function renderRosterTable() {
  const tbody = document.getElementById("rosterTableBody");
  tbody.innerHTML = "";

  if (rosterEntries.length === 0) {
    const colspan = isAdmin ? 5 : 4;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-5">No service dates planned for this month yet.</td></tr>`;
    return;
  }

  rosterEntries.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.appendChild(cellWithHtml(formatDate(entry.service_date), "date-cell"));

    const hymnCell = cellWithHtml(formatHymn(entry));
    const praiseCell = cellWithHtml(
      formatFunction(
        entry.praise_worship_chorister_name,
        entry.praise_worship_musical_key,
        entry.praise_worship_loop_bitrate,
        entry.praise_worship_song_title
      )
    );
    const thanksCell = cellWithHtml(
      formatFunction(
        entry.thanksgiving_chorister_name,
        entry.thanksgiving_musical_key,
        entry.thanksgiving_loop_bitrate,
        entry.thanksgiving_song_title
      )
    );

    if (isAdmin) {
      [
        ["hymn", hymnCell, entry.hymn_chorister_name, entry.hymn_chorister_id],
        ["praise_worship", praiseCell, entry.praise_worship_chorister_name, entry.praise_worship_chorister_id],
        ["thanksgiving", thanksCell, entry.thanksgiving_chorister_name, entry.thanksgiving_chorister_id],
      ].forEach(([role, cell, name, cid]) => {
        if (cid) cell.appendChild(ratingButton(entry, role, name));
      });
    }

    tr.appendChild(hymnCell);
    tr.appendChild(praiseCell);
    tr.appendChild(thanksCell);

    if (isAdmin) {
      const actionsCell = document.createElement("td");
      actionsCell.className = "text-end";

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-outline-primary me-1";
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editBtn.addEventListener("click", () => openRosterModal(entry));

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-sm btn-outline-danger";
      delBtn.innerHTML = '<i class="bi bi-trash"></i>';
      delBtn.addEventListener("click", () => deleteRosterEntry(entry.id, delBtn));

      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(delBtn);
      tr.appendChild(actionsCell);
    }

    tbody.appendChild(tr);

    if (entry.notes) {
      const notesTr = document.createElement("tr");
      notesTr.className = "roster-notes-row";

      const notesTd = document.createElement("td");
      notesTd.colSpan = isAdmin ? 5 : 4;

      const noteContent = document.createElement("span");
      noteContent.innerHTML = `<i class="bi bi-sticky me-1 text-muted"></i><em class="text-muted small">${escHtml(entry.notes)}</em>`;
      notesTd.appendChild(noteContent);

      if (isAdmin) {
        const clearBtn = document.createElement("button");
        clearBtn.className = "btn btn-link btn-sm p-0 ms-2 text-danger";
        clearBtn.style.fontSize = "0.75rem";
        clearBtn.title = "Remove note";
        clearBtn.innerHTML = '<i class="bi bi-x-circle"></i>';
        clearBtn.addEventListener("click", async () => {
          await api("PUT", `/api/roster/${entry.id}`, { notes: null });
          await loadRoster();
        });
        notesTd.appendChild(clearBtn);
      }

      notesTr.appendChild(notesTd);
      tbody.appendChild(notesTr);
    }
  });
}

function cellWithHtml(html, className = "") {
  const td = document.createElement("td");
  td.innerHTML = html;
  if (className) td.className = className;
  return td;
}

function formatHymn(entry) {
  const parts = [];
  if (entry.hymn_chorister_name) parts.push(`<span class="member-name">${escHtml(entry.hymn_chorister_name)}</span>`);

  const details = [];
  const songTitle = entry.hymn_song_title_linked || entry.hymn_song_title;
  if (songTitle) details.push(`Title: ${escHtml(songTitle)}`);
  if (entry.hymn_musical_key) details.push(`Key: ${escHtml(entry.hymn_musical_key)}`);
  if (details.length) parts.push(`<span class="function-meta">(${details.join("; ")})</span>`);

  return parts.length ? parts.join(" ") : '<span class="text-muted">Unassigned</span>';
}

function formatFunction(name, musicalKey, loopBitrate, songTitle = null) {
  const parts = [];
  if (name) parts.push(`<span class="member-name">${escHtml(name)}</span>`);

  const details = [];
  if (songTitle) details.push(`Title: ${escHtml(songTitle)}`);
  if (musicalKey) details.push(`Key: ${escHtml(musicalKey)}`);
  if (loopBitrate) details.push(`Loop Bitrate: ${escHtml(loopBitrate)}`);
  if (details.length) parts.push(`<span class="function-meta">(${details.join("; ")})</span>`);

  return parts.length ? parts.join(" ") : '<span class="text-muted">Unassigned</span>';
}

function shiftMonth(delta) {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + delta, 1);
  loadRoster();
}

function onMonthChange() {
  const [year, month] = document.getElementById("monthPicker").value.split("-").map(Number);
  selectedMonth = new Date(year, month - 1, 1);
  loadRoster();
}

function handleMutationError(error) {
  showToast(error.message, error.status === 401 ? "warning" : "danger");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);

  document.getElementById("monthPicker").addEventListener("change", onMonthChange);
  document.getElementById("btnPrevMonth").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("btnNextMonth").addEventListener("click", () => shiftMonth(1));
  document.getElementById("btnPrint").addEventListener("click", () => window.print());
  document.getElementById("btnThemeToggle").addEventListener("click", toggleTheme);
  document.getElementById("btnNavHome").addEventListener("click", () => setActivePage("home", { syncAnalyticsMonth: false }));
  document.getElementById("btnNavAnalytics").addEventListener("click", () => openAnalyticsPage());
  setTheme(localStorage.getItem("chorister-theme") || "light");

  // Wire analytics navigation before async startup work so the page switcher
  // still functions even if one of the initial data requests stalls or fails.
  registerAnalyticsModalEventHandlers();

  await Promise.all([loadSession(), loadChoristerSession()]);
  await loadChoristers();
  await loadSongs();
  await loadRoster();

  try {
    songStats = await api("GET", "/api/songs/stats");
    renderCategoryAnalytics();
    renderSongsLibraries();
  } catch (_) {}

  // Home-page and shell controls stay registered centrally because they are not
  // owned by any single modal workflow.
  // Register modal modules after the DOM and shared state are ready.
  registerAuthModalEventHandlers();
  registerChoristersModalEventHandlers();
  registerSongsModalEventHandlers();
  registerLyricsModalEventHandlers();
  registerRatingsModalEventHandlers();
  registerRosterModalEventHandlers();
  registerPrayerModalEventHandlers();
});
