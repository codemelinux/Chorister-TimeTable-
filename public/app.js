// Developed by Benedict U.
// Frontend application script for Chorister TimeTable.
// Communicates with the FastAPI backend via fetch() (same-origin, cookie-based auth).
// All user-supplied strings rendered into innerHTML are passed through escHtml()
// to prevent XSS. Dynamic content set via textContent needs no escaping.

// ---------------------------------------------------------------------------
// Dark / light theme
// ---------------------------------------------------------------------------

function setTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.remove("dark-theme");
  }
  localStorage.setItem("chorister-theme", theme);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-fill";
}

function toggleTheme() {
  setTheme(document.body.classList.contains("dark-theme") ? "light" : "dark");
}

// Apply saved preference as early as possible to avoid flash
(function () {
  const saved = localStorage.getItem("chorister-theme");
  if (saved === "dark") document.documentElement.classList.add("dark-theme");
})();

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

let choristers = [];       // All choristers from /api/choristers
let rosterEntries = [];    // Current month's roster from /api/roster
let songs = [];            // All songs from /api/songs
let songStats = [];        // Song usage counts from /api/songs/stats
let sortSongsByMostSung = false;
let selectedMonth = new Date();
let isAdmin = false;
let isChorister = false;
let choristerInfo = null;  // {chorister_id, name} when a chorister is logged in
let prayerEntries = [];           // Current month's prayer roster
let prayerSelectedMonth = new Date();
let ratings = {};  // key: `${entry_id}_${role}` → rating object (admin only)

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
// UI helpers — toast notifications, loading state, confirm dialog, XSS escape
// ---------------------------------------------------------------------------

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const id = `toast-${Date.now()}`;
  const iconMap = { success: "bi-check-circle-fill", danger: "bi-x-circle-fill", warning: "bi-exclamation-triangle-fill" };
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
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.show();
  });
}

// ---------------------------------------------------------------------------
// Auth — admin session + chorister session management
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
    pill.textContent = `🎵 ${info.name}`;
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

async function login() {
  const passwordInput = document.getElementById("adminPassword");
  const btn = document.getElementById("btnSubmitLogin");
  setLoading(btn, true);
  try {
    await api("POST", "/api/auth/login", { password: passwordInput.value });
    passwordInput.value = "";
    bootstrap.Modal.getInstance(document.getElementById("loginModal")).hide();
    await loadSession();
    await loadRoster();
    showToast("Logged in as admin.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

async function logout() {
  await api("POST", "/api/auth/logout", {});
  await loadSession();
  await loadRoster();
  showToast("Logged out.", "success");
}

async function openChoristerLoginModal() {
  // Populate dropdown with portal-enabled choristers
  try {
    const portalChoristers = await api("GET", "/api/choristers/portal");
    const sel = document.getElementById("choristerSelectLogin");
    sel.innerHTML = '<option value="">— Select your name —</option>' +
      portalChoristers.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`).join("");
  } catch (_) {
    // fall through with empty list
  }
  document.getElementById("choristerPinInput").value = "";
  new bootstrap.Modal(document.getElementById("choristerLoginModal")).show();
}

async function choristerLogin() {
  const chorister_id = parseInt(document.getElementById("choristerSelectLogin").value, 10);
  const pin = document.getElementById("choristerPinInput").value;
  if (!chorister_id) { showToast("Please select your name.", "warning"); return; }
  if (!pin) { showToast("Please enter your PIN.", "warning"); return; }
  const btn = document.getElementById("btnSubmitChoristerLogin");
  setLoading(btn, true);
  try {
    const result = await api("POST", "/api/auth/chorister-login", { chorister_id, pin });
    document.getElementById("choristerPinInput").value = "";
    bootstrap.Modal.getInstance(document.getElementById("choristerLoginModal")).hide();
    setChoristerMode(true, { chorister_id: result.chorister_id, name: result.name });
    showToast(`Welcome, ${result.name}!`, "success");
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

async function choristerLogout() {
  await api("POST", "/api/auth/chorister-logout", {});
  setChoristerMode(false, null);
  showToast("Signed out.", "success");
}

// ---------------------------------------------------------------------------
// Choristers — list, add, delete, PIN management
// ---------------------------------------------------------------------------

async function loadChoristers() {
  choristers = await api("GET", "/api/choristers");
  renderChoristersList();
  populateChoristerSelects();
}

function renderChoristersList() {
  const list = document.getElementById("choristersList");
  list.innerHTML = "";
  if (choristers.length === 0) {
    list.innerHTML = '<li class="list-group-item text-muted">No choristers yet.</li>';
    return;
  }
  choristers.forEach((chorister) => {
    const item = document.createElement("li");
    item.className = "list-group-item d-flex justify-content-between align-items-center gap-2";

    const left = document.createElement("div");
    left.className = "d-flex align-items-center gap-2 flex-grow-1";

    const label = document.createElement("span");
    label.textContent = chorister.name;
    left.appendChild(label);

    if (chorister.has_portal_access) {
      const badge = document.createElement("span");
      badge.className = "badge portal-badge";
      badge.innerHTML = '<i class="bi bi-person-check-fill me-1"></i>Portal';
      left.appendChild(badge);
    }
    item.appendChild(left);

    if (isAdmin) {
      const btnGroup = document.createElement("div");
      btnGroup.className = "d-flex gap-1";

      // Set / change PIN button
      const pinBtn = document.createElement("button");
      pinBtn.className = "btn btn-sm btn-outline-secondary";
      pinBtn.title = chorister.has_portal_access ? "Change PIN" : "Grant portal access";
      pinBtn.innerHTML = '<i class="bi bi-key"></i>';
      pinBtn.addEventListener("click", () => openSetPinModal(chorister));
      btnGroup.appendChild(pinBtn);

      // Revoke access button
      if (chorister.has_portal_access) {
        const revokeBtn = document.createElement("button");
        revokeBtn.className = "btn btn-sm btn-outline-warning";
        revokeBtn.title = "Revoke portal access";
        revokeBtn.innerHTML = '<i class="bi bi-person-x"></i>';
        revokeBtn.addEventListener("click", () => revokePortalAccess(chorister.id, revokeBtn));
        btnGroup.appendChild(revokeBtn);
      }

      // Delete chorister button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-outline-danger";
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.addEventListener("click", () => removeChorister(chorister.id, deleteBtn));
      btnGroup.appendChild(deleteBtn);

      item.appendChild(btnGroup);
    }
    list.appendChild(item);
  });
}

function openSetPinModal(chorister) {
  document.getElementById("setPinChoristerId").value = chorister.id;
  document.getElementById("setPinChoristerName").textContent = chorister.name;
  document.getElementById("setPinValue").value = "";
  new bootstrap.Modal(document.getElementById("setPinModal")).show();
}

async function confirmSetPin() {
  const chorister_id = parseInt(document.getElementById("setPinChoristerId").value, 10);
  const pin = document.getElementById("setPinValue").value.trim();
  if (!pin || pin.length < 4) { showToast("PIN must be at least 4 characters.", "warning"); return; }
  const btn = document.getElementById("btnConfirmSetPin");
  setLoading(btn, true);
  try {
    await api("POST", `/api/choristers/${chorister_id}/set-pin`, { pin });
    bootstrap.Modal.getInstance(document.getElementById("setPinModal")).hide();
    await loadChoristers();
    showToast("PIN set. Chorister can now log in.", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function revokePortalAccess(id, btn) {
  const confirmed = await confirmAction("Revoke this chorister's portal access?", "Revoke");
  if (!confirmed) return;
  setLoading(btn, true);
  try {
    await api("DELETE", `/api/choristers/${id}/pin`);
    await loadChoristers();
    showToast("Portal access revoked.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

function populateChoristerSelects() {
  const options = ['<option value="">Unassigned</option>']
    .concat(choristers.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`))
    .join("");
  ["hymnChorister", "praiseWorshipChorister", "thanksgivingChorister"].forEach((id) => {
    document.getElementById(id).innerHTML = options;
  });
  populatePrayerChoristerSelect();
}

async function addChorister() {
  const input = document.getElementById("newChoristerName");
  const btn = document.getElementById("btnAddChorister");
  const name = input.value.trim();
  if (!name) { showToast("Chorister name cannot be empty.", "warning"); return; }
  setLoading(btn, true);
  try {
    await api("POST", "/api/choristers", { name });
    input.value = "";
    await loadChoristers();
    await loadRoster();
    showToast(`"${name}" added to choristers.`, "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function removeChorister(id, btn) {
  const confirmed = await confirmAction("Remove this chorister from the roster list?", "Remove");
  if (!confirmed) return;
  setLoading(btn, true);
  try {
    await api("DELETE", `/api/choristers/${id}`);
    await loadChoristers();
    await loadRoster();
    showToast("Chorister removed.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

// ---------------------------------------------------------------------------
// Songs — library CRUD, song dropdowns, Drive sync buttons
// ---------------------------------------------------------------------------

async function loadSongs() {
  songs = await api("GET", "/api/songs");
  populateSongSelects();
}

function populateSongSelects() {
  // Called on initial load — no chorister selected yet, show all songs by category
  refreshSongDropdown("hymnSongSelect", ["hymn", "general"], null);
  refreshSongDropdown("praiseWorshipSongSelect", ["praise_worship", "general"], null);
  refreshSongDropdown("thanksgivingSongSelect", ["thanksgiving", "general"], null);
}

function refreshSongDropdown(selectId, categoryFilter, choristerId) {
  const el = document.getElementById(selectId);
  const currentVal = el.value;

  // Songs visible to this chorister slot:
  // - correct category
  // - AND (no chorister selected → all) OR (submitted by this chorister OR assigned to this chorister by admin)
  const visible = songs.filter((s) => {
    if (!categoryFilter.includes(s.category)) return false;
    if (!choristerId) return true; // no chorister selected — show all in category
    const isSubmitter = s.submitted_by_chorister_id === choristerId;
    const isAssigned = Array.isArray(s.assigned_choristers) &&
      s.assigned_choristers.some((a) => a.chorister_id === choristerId);
    return isSubmitter || isAssigned;
  });

  // Sort by most sung first so popular songs appear at the top
  visible.sort((a, b) => {
    const countA = songStats.find((st) => st.song_id === a.id)?.count || 0;
    const countB = songStats.find((st) => st.song_id === b.id)?.count || 0;
    return countB - countA || a.title.localeCompare(b.title);
  });

  el.innerHTML = ['<option value="">-- Select song --</option>']
    .concat(visible.map((s) => {
      const stat = songStats.find((st) => st.song_id === s.id);
      const count = stat ? stat.count : 0;
      const label = count > 0 ? `${s.title}  (${count}×)` : s.title;
      return `<option value="${s.id}">${escHtml(label)}</option>`;
    }))
    .join("");

  // Restore previous selection only if it's still in the visible list
  if (currentVal && visible.find((s) => String(s.id) === currentVal)) {
    el.value = currentVal;
  } else if (currentVal) {
    // Previously selected song is not allowed for this chorister — clear it
    el.value = "";
    // Also hide lyrics preview
    const previewMap = {
      hymnSongSelect: "hymnSongLyrics",
      praiseWorshipSongSelect: "praiseWorshipSongLyrics",
      thanksgivingSongSelect: "thanksgivingSongLyrics",
    };
    const previewId = previewMap[selectId];
    if (previewId) {
      const preview = document.getElementById(previewId);
      if (preview) { preview.textContent = ""; preview.style.display = "none"; }
    }
  }
}

function bindChoristerSongFilter(choristerSelectId, songSelectId, categoryFilter) {
  document.getElementById(choristerSelectId).addEventListener("change", (e) => {
    const choristerId = parseInt(e.target.value, 10) || null;
    refreshSongDropdown(songSelectId, categoryFilter, choristerId);
  });
}

function bindSongSelectPreview(selectId, previewId) {
  document.getElementById(selectId).addEventListener("change", (e) => {
    const song = songs.find((s) => s.id === parseInt(e.target.value, 10));
    const preview = document.getElementById(previewId);
    if (song && song.lyrics) {
      preview.textContent = song.lyrics;
      preview.style.display = "block";
    } else {
      preview.textContent = "";
      preview.style.display = "none";
    }
  });
}

async function openSongsModal() {
  resetSongForm();
  updateSongFormVisibility();
  try {
    songStats = await api("GET", "/api/songs/stats");
  } catch (_) {
    songStats = [];
  }
  renderSongsList();
  new bootstrap.Modal(document.getElementById("songsModal")).show();
}

function openLyricsViewer(song) {
  const categoryLabels = { hymn: "Hymn", praise_worship: "Praise Worship", thanksgiving: "Thanksgiving", general: "General" };
  const categoryClasses = { hymn: "cat-hymn", praise_worship: "cat-praise", thanksgiving: "cat-thanks", general: "cat-general" };

  document.getElementById("lyricsViewerTitle").textContent = song.title;

  const catBadge = document.getElementById("lyricsViewerCategory");
  catBadge.textContent = categoryLabels[song.category] || song.category;
  catBadge.className = `badge song-cat-badge ${categoryClasses[song.category] || ""}`;

  document.getElementById("lyricsViewerBody").textContent = song.lyrics || "(No lyrics stored)";

  const linksEl = document.getElementById("lyricsViewerLinks");
  linksEl.innerHTML = "";
  if (song.hyperlink) {
    const a = document.createElement("a");
    a.href = song.hyperlink; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.className = "btn btn-sm btn-outline-secondary";
    a.innerHTML = '<i class="bi bi-link-45deg me-1"></i>External link';
    linksEl.appendChild(a);
  }
  if (song.google_doc_url) {
    const a = document.createElement("a");
    a.href = song.google_doc_url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.className = "btn btn-sm btn-outline-success";
    a.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>View in Google Docs';
    linksEl.appendChild(a);
  }

  new bootstrap.Modal(document.getElementById("lyricsViewerModal")).show();
}

async function syncSongToDrive(id, btn) {
  setLoading(btn, true);
  try {
    const updated = await api("POST", `/api/songs/${id}/sync-to-drive`);
    const idx = songs.findIndex((s) => s.id === id);
    if (idx !== -1) songs[idx] = updated;
    renderSongsList();
    showToast("Synced to Google Drive.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

async function syncAllToDrive(btn) {
  setLoading(btn, true);
  try {
    const result = await api("POST", "/api/songs/sync-all-to-drive");
    await loadSongs();
    renderSongsList();
    const errDetail = result.errors && result.errors.length ? ` Error: ${result.errors[0]}` : "";
    const msg = `Synced ${result.synced} song(s) to Drive.${result.failed ? ` ${result.failed} failed.${errDetail}` : ""}`;
    showToast(msg, result.failed ? "warning" : "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

function renderSongsList() {
  const list = document.getElementById("songsList");
  const query = document.getElementById("songSearchInput").value.toLowerCase().trim();

  let source = songs.map((s) => {
    const stat = songStats.find((st) => st.song_id === s.id);
    return { ...s, count: stat ? stat.count : 0 };
  });

  if (sortSongsByMostSung) {
    source = [...songStats].map((st) => {
      const song = songs.find((s) => s.id === st.song_id);
      return song ? { ...song, count: st.count } : null;
    }).filter(Boolean);
    const statIds = new Set(songStats.map((st) => st.song_id));
    songs.forEach((s) => { if (!statIds.has(s.id)) source.push({ ...s, count: 0 }); });
  }

  if (query) {
    source = source.filter((s) => s.title.toLowerCase().includes(query) || (s.lyrics && s.lyrics.toLowerCase().includes(query)));
  }

  list.innerHTML = "";
  if (source.length === 0) {
    list.innerHTML = '<li class="list-group-item text-muted">No songs found.</li>';
    return;
  }

  const categoryLabels = { hymn: "Hymn", praise_worship: "Praise Worship", thanksgiving: "Thanksgiving", general: "General" };
  const categoryClasses = { hymn: "cat-hymn", praise_worship: "cat-praise", thanksgiving: "cat-thanks", general: "cat-general" };

  source.forEach((s) => {
    const canEdit = isAdmin || (isChorister && choristerInfo && s.submitted_by_chorister_id === choristerInfo.chorister_id);

    const item = document.createElement("li");
    item.className = "list-group-item";

    const top = document.createElement("div");
    top.className = "d-flex justify-content-between align-items-start gap-2";

    const info = document.createElement("div");
    info.className = "flex-grow-1";

    const titleLine = document.createElement("div");
    titleLine.className = "d-flex align-items-center flex-wrap gap-1 mb-1";

    const titleSpan = document.createElement("span");
    titleSpan.className = "fw-semibold";
    titleSpan.textContent = s.title;
    titleLine.appendChild(titleSpan);

    const catBadge = document.createElement("span");
    catBadge.className = `badge song-cat-badge ${categoryClasses[s.category] || ""}`;
    catBadge.textContent = categoryLabels[s.category] || s.category;
    titleLine.appendChild(catBadge);

    if (s.count > 0) {
      const useBadge = document.createElement("span");
      useBadge.className = "badge bg-primary-subtle text-primary-emphasis";
      useBadge.textContent = `${s.count} ${s.count === 1 ? "use" : "uses"}`;
      titleLine.appendChild(useBadge);
    }

    if (s.submitted_by_chorister_name) {
      const subBadge = document.createElement("span");
      subBadge.className = "badge bg-light text-secondary border";
      subBadge.innerHTML = `<i class="bi bi-person-fill me-1"></i>${escHtml(s.submitted_by_chorister_name)}`;
      titleLine.appendChild(subBadge);
    }

    info.appendChild(titleLine);

    // Hyperlink
    if (s.hyperlink) {
      const linkWrap = document.createElement("div");
      linkWrap.className = "mb-1";
      const link = document.createElement("a");
      link.href = s.hyperlink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "small text-decoration-none";
      link.innerHTML = '<i class="bi bi-link-45deg me-1"></i>External link';
      linkWrap.appendChild(link);
      info.appendChild(linkWrap);
    }

    // Google Doc link
    if (s.google_doc_url) {
      const docWrap = document.createElement("div");
      docWrap.className = "mb-1";
      const docLink = document.createElement("a");
      docLink.href = s.google_doc_url;
      docLink.target = "_blank";
      docLink.rel = "noopener noreferrer";
      docLink.className = "small text-decoration-none text-success";
      docLink.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>View in Google Docs';
      docWrap.appendChild(docLink);
      info.appendChild(docWrap);
    }

    if (s.lyrics) {
      const lyricsToggle = document.createElement("button");
      lyricsToggle.className = "btn btn-link btn-sm p-0 text-muted";
      lyricsToggle.style.fontSize = "0.8rem";
      lyricsToggle.textContent = "Show lyrics";
      lyricsToggle.addEventListener("click", () => openLyricsViewer(s));
      info.appendChild(lyricsToggle);
    }

    top.appendChild(info);

    if (canEdit) {
      const actions = document.createElement("div");
      actions.className = "d-flex gap-1 flex-shrink-0";
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-outline-primary";
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editBtn.addEventListener("click", () => openSongEditForm(s));
      actions.appendChild(editBtn);
      if (isAdmin) {
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-outline-danger";
        delBtn.innerHTML = '<i class="bi bi-trash"></i>';
        delBtn.addEventListener("click", () => deleteSong(s.id, delBtn));
        actions.appendChild(delBtn);

        // Show cloud-upload button only for songs missing a Google Doc
        if (!s.google_doc_url) {
          const syncBtn = document.createElement("button");
          syncBtn.className = "btn btn-sm btn-outline-secondary";
          syncBtn.title = "Sync lyrics to Google Drive";
          syncBtn.innerHTML = '<i class="bi bi-cloud-upload"></i>';
          syncBtn.addEventListener("click", () => syncSongToDrive(s.id, syncBtn));
          actions.appendChild(syncBtn);
        }
      }
      top.appendChild(actions);
    }

    item.appendChild(top);

    // Admin-only: assignment controls (assign/unassign song to choristers)
    if (isAdmin) {
      const assigned = s.assigned_choristers || [];
      const assignSection = document.createElement("div");
      assignSection.className = "mt-2 pt-2 border-top d-flex flex-wrap gap-1 align-items-center";

      const assignLabel = document.createElement("span");
      assignLabel.className = "text-muted small me-1";
      assignLabel.textContent = "Assigned to:";
      assignSection.appendChild(assignLabel);

      if (assigned.length > 0) {
        assigned.forEach((a) => {
          const badge = document.createElement("span");
          badge.className = "badge bg-info-subtle text-info-emphasis d-inline-flex align-items-center gap-1";
          const nameSpan = document.createElement("span");
          nameSpan.textContent = a.chorister_name;
          badge.appendChild(nameSpan);
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "btn-close ms-1";
          removeBtn.style.cssText = "font-size:0.5rem;filter:none;opacity:0.6;";
          removeBtn.title = "Remove assignment";
          removeBtn.addEventListener("click", () => unassignSong(s.id, a.chorister_id));
          badge.appendChild(removeBtn);
          assignSection.appendChild(badge);
        });
      } else {
        const none = document.createElement("span");
        none.className = "text-muted small fst-italic me-1";
        none.textContent = "none";
        assignSection.appendChild(none);
      }

      // Dropdown of unassigned choristers
      const assignSelect = document.createElement("select");
      assignSelect.className = "form-select form-select-sm d-inline w-auto";
      assignSelect.style.maxWidth = "170px";
      const unassigned = choristers.filter((c) => !assigned.some((a) => a.chorister_id === c.id));
      assignSelect.innerHTML = '<option value="">+ Assign chorister</option>' +
        unassigned.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`).join("");
      assignSection.appendChild(assignSelect);

      const assignBtn = document.createElement("button");
      assignBtn.className = "btn btn-sm btn-outline-info flex-shrink-0";
      assignBtn.title = "Assign selected chorister to this song";
      assignBtn.innerHTML = '<i class="bi bi-person-plus"></i>';
      assignBtn.addEventListener("click", () => {
        const choristerId = parseInt(assignSelect.value, 10) || null;
        assignSong(s.id, choristerId, assignBtn);
      });
      assignSection.appendChild(assignBtn);

      item.appendChild(assignSection);
    }

    list.appendChild(item);
  });
}

function openSongEditForm(song) {
  document.getElementById("editSongId").value = song.id;
  document.getElementById("songTitleInput").value = song.title;
  document.getElementById("songCategoryInput").value = song.category || "general";
  document.getElementById("songLyricsInput").value = song.lyrics || "";
  document.getElementById("songHyperlinkInput").value = song.hyperlink || "";
  document.getElementById("songFormTitle").textContent = "Edit Song";
  document.getElementById("btnSaveSong").textContent = "Update Song";
  document.getElementById("songFormSection").scrollIntoView({ behavior: "smooth" });
}

function resetSongForm() {
  document.getElementById("editSongId").value = "";
  document.getElementById("songTitleInput").value = "";
  document.getElementById("songCategoryInput").value = "general";
  document.getElementById("songLyricsInput").value = "";
  document.getElementById("songHyperlinkInput").value = "";
  document.getElementById("songFormTitle").textContent = "Add New Song";
  document.getElementById("btnSaveSong").textContent = "Save Song";
}

async function saveSong() {
  const id = document.getElementById("editSongId").value;
  const title = document.getElementById("songTitleInput").value.trim();
  const category = document.getElementById("songCategoryInput").value;
  const lyrics = document.getElementById("songLyricsInput").value.trim();
  const hyperlink = document.getElementById("songHyperlinkInput").value.trim() || null;

  if (!title) { showToast("Song title cannot be empty.", "warning"); return; }

  const btn = document.getElementById("btnSaveSong");
  setLoading(btn, true);
  try {
    if (id) {
      await api("PUT", `/api/songs/${id}`, { title, category, lyrics, hyperlink });
    } else {
      await api("POST", "/api/songs", { title, category, lyrics, hyperlink });
    }
    resetSongForm();
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsList();
    renderCategoryAnalytics();
    showToast(id ? "Song updated." : "Song added to library!", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function deleteSong(id, btn) {
  const confirmed = await confirmAction("Delete this song from the library? Roster entries referencing it will be unlinked.", "Delete");
  if (!confirmed) return;
  setLoading(btn, true);
  try {
    await api("DELETE", `/api/songs/${id}`);
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsList();
    renderCategoryAnalytics();
    showToast("Song deleted.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

// ---------------------------------------------------------------------------
// Song assignments — admin assigns library songs to specific choristers
// ---------------------------------------------------------------------------

async function assignSong(songId, choristerId, btn) {
  if (!choristerId) { showToast("Select a chorister to assign.", "warning"); return; }
  setLoading(btn, true);
  try {
    await api("POST", `/api/songs/${songId}/assign`, { chorister_id: choristerId });
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsList();
    showToast("Song assigned to chorister.", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function unassignSong(songId, choristerId) {
  try {
    await api("DELETE", `/api/songs/${songId}/assign/${choristerId}`);
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsList();
    showToast("Assignment removed.", "success");
  } catch (error) {
    handleMutationError(error);
  }
}

// ---------------------------------------------------------------------------
// Lyrics modal — monthly catalogue + all-songs library with search/filter
// ---------------------------------------------------------------------------

async function openLyricsModal() {
  // Pre-set month picker to current month
  const picker = document.getElementById("lyricsMonthPicker");
  const m = String(selectedMonth.getMonth() + 1).padStart(2, "0");
  picker.value = `${selectedMonth.getFullYear()}-${m}`;

  // Reset search and filter to defaults each time modal opens
  const searchEl = document.getElementById("allSongsSearch");
  if (searchEl) searchEl.value = "";
  document.querySelectorAll(".all-songs-filter-btn").forEach((btn) => btn.classList.remove("active"));
  const allBtn = document.querySelector(".all-songs-filter-btn[data-cat='all']");
  if (allBtn) allBtn.classList.add("active");

  renderAllSongsCatalogue();
  new bootstrap.Modal(document.getElementById("lyricsModal")).show();
  await loadLyricsByMonth();
}

function renderAllSongsCatalogue() {
  const container = document.getElementById("allSongsCatalogue");
  if (!songs || songs.length === 0) {
    container.innerHTML = '<p class="text-muted small">No songs in the library yet.</p>';
    return;
  }

  const categoryLabels = { hymn: "Hymn", praise_worship: "Praise Worship", thanksgiving: "Thanksgiving", general: "General" };
  const categoryClasses = { hymn: "cat-hymn", praise_worship: "cat-praise", thanksgiving: "cat-thanks", general: "cat-general" };

  // Read active filter + search query
  const activeCat = document.querySelector(".all-songs-filter-btn.active")?.dataset.cat || "all";
  const query = (document.getElementById("allSongsSearch")?.value || "").toLowerCase().trim();

  let sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));

  if (activeCat !== "all") sorted = sorted.filter((s) => s.category === activeCat);
  if (query) sorted = sorted.filter((s) => s.title.toLowerCase().includes(query) ||
    (s.submitted_by_chorister_name && s.submitted_by_chorister_name.toLowerCase().includes(query)));

  container.innerHTML = "";
  if (sorted.length === 0) {
    container.innerHTML = '<p class="text-muted small mt-1">No songs match your search.</p>';
    return;
  }

  sorted.forEach((s) => {
    const card = document.createElement("div");
    card.className = "all-song-card d-flex align-items-center gap-2 flex-wrap";

    const title = document.createElement("span");
    title.className = "all-song-card__title flex-grow-1";
    title.textContent = s.title;
    card.appendChild(title);

    const catBadge = document.createElement("span");
    catBadge.className = `badge song-cat-badge flex-shrink-0 ${categoryClasses[s.category] || ""}`;
    catBadge.textContent = categoryLabels[s.category] || s.category;
    card.appendChild(catBadge);

    if (s.submitted_by_chorister_name) {
      const chorBadge = document.createElement("span");
      chorBadge.className = "badge bg-light text-secondary border flex-shrink-0";
      chorBadge.style.fontSize = "0.7rem";
      chorBadge.innerHTML = `<i class="bi bi-person-fill me-1"></i>${escHtml(s.submitted_by_chorister_name)}`;
      card.appendChild(chorBadge);
    }

    if (s.lyrics) {
      const showBtn = document.createElement("button");
      showBtn.className = "btn btn-sm btn-outline-secondary flex-shrink-0";
      showBtn.style.fontSize = "0.72rem";
      showBtn.innerHTML = '<i class="bi bi-eye me-1"></i>Show lyrics';
      showBtn.addEventListener("click", () => openLyricsViewer(s));
      card.appendChild(showBtn);
    }

    if (s.google_doc_url) {
      const docLink = document.createElement("a");
      docLink.href = s.google_doc_url;
      docLink.target = "_blank";
      docLink.rel = "noopener noreferrer";
      docLink.className = "btn btn-sm btn-outline-success flex-shrink-0";
      docLink.style.fontSize = "0.72rem";
      docLink.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>Google Docs';
      card.appendChild(docLink);
    }

    container.appendChild(card);
  });
}

async function loadLyricsByMonth() {
  const picker = document.getElementById("lyricsMonthPicker");
  if (!picker.value) { showToast("Please select a month.", "warning"); return; }
  const [year, month] = picker.value.split("-").map(Number);
  const btn = document.getElementById("btnLoadLyrics");
  setLoading(btn, true);
  try {
    const lyricsData = await api("GET", `/api/songs/monthly?year=${year}&month=${month}`);
    renderLyricsModal(lyricsData);
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

function renderLyricsModal(songs) {
  const categories = { hymn: [], praise_worship: [], thanksgiving: [], general: [] };
  songs.forEach((s) => {
    const cat = s.category in categories ? s.category : "general";
    categories[cat].push(s);
  });

  // general songs can appear under any category column — add to all
  ["hymn", "praise_worship", "thanksgiving"].forEach((cat) => {
    categories[cat] = [...categories[cat], ...categories.general];
  });

  renderLyricsColumn("lyricsHymn", categories.hymn);
  renderLyricsColumn("lyricsPraise", categories.praise_worship);
  renderLyricsColumn("lyricsThanksgiving", categories.thanksgiving);
}

function renderLyricsColumn(containerId, songs) {
  const container = document.getElementById(containerId);
  if (!songs || songs.length === 0) {
    container.innerHTML = '<p class="text-muted small">No songs used this month.</p>';
    return;
  }
  container.innerHTML = "";
  songs.forEach((s) => {
    const card = document.createElement("div");
    card.className = "lyrics-song-card";

    const titleRow = document.createElement("div");
    titleRow.className = "lyrics-song-title";
    titleRow.textContent = s.title;
    card.appendChild(titleRow);

    if (s.submitted_by_chorister_name) {
      const sub = document.createElement("div");
      sub.className = "lyrics-song-sub";
      sub.innerHTML = `<i class="bi bi-person-fill me-1"></i>${escHtml(s.submitted_by_chorister_name)}`;
      card.appendChild(sub);
    }

    const links = document.createElement("div");
    links.className = "d-flex gap-2 flex-wrap mt-1";
    if (s.hyperlink) {
      const a = document.createElement("a");
      a.href = s.hyperlink; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.className = "lyrics-link";
      a.innerHTML = '<i class="bi bi-link-45deg me-1"></i>Link';
      links.appendChild(a);
    }
    if (s.google_doc_url) {
      const a = document.createElement("a");
      a.href = s.google_doc_url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.className = "lyrics-link lyrics-link--gdoc";
      a.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>Google Doc';
      links.appendChild(a);
    }
    if (links.children.length) card.appendChild(links);

    if (s.lyrics) {
      const toggle = document.createElement("button");
      toggle.className = "btn btn-link btn-sm p-0 lyrics-toggle";
      toggle.textContent = "Show lyrics ▾";
      const lyricsBlock = document.createElement("pre");
      lyricsBlock.className = "lyrics-block";
      lyricsBlock.style.display = "none";
      lyricsBlock.textContent = s.lyrics;
      toggle.addEventListener("click", () => {
        const shown = lyricsBlock.style.display !== "none";
        lyricsBlock.style.display = shown ? "none" : "block";
        toggle.textContent = shown ? "Show lyrics ▾" : "Hide lyrics ▴";
      });
      card.appendChild(toggle);
      card.appendChild(lyricsBlock);
    }

    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Month navigation — picker, prev/next controls, roster reload
// ---------------------------------------------------------------------------

function setMonthPickerValue() {
  const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
  document.getElementById("monthPicker").value = `${selectedMonth.getFullYear()}-${month}`;
}

function renderMonthTitle() {
  document.getElementById("monthTitle").textContent = selectedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
      list.forEach(r => { ratings[`${r.roster_entry_id}_${r.role}`] = r; });
    } catch (_) { ratings = {}; }
  }
  renderRosterTable();
  renderMonthlyStats();
}

// ---------------------------------------------------------------------------
// Roster table — render service dates with chorister/song assignments
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
    const praiseCell = cellWithHtml(formatFunction(entry.praise_worship_chorister_name, entry.praise_worship_musical_key, entry.praise_worship_loop_bitrate, entry.praise_worship_song_title));
    const thanksCell = cellWithHtml(formatFunction(entry.thanksgiving_chorister_name, entry.thanksgiving_musical_key, entry.thanksgiving_loop_bitrate, entry.thanksgiving_song_title));

    if (isAdmin) {
      [["hymn", hymnCell, entry.hymn_chorister_name, entry.hymn_chorister_id],
       ["praise_worship", praiseCell, entry.praise_worship_chorister_name, entry.praise_worship_chorister_id],
       ["thanksgiving", thanksCell, entry.thanksgiving_chorister_name, entry.thanksgiving_chorister_id]
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

// ---------------------------------------------------------------------------
// Performance ratings — star buttons + modal
// ---------------------------------------------------------------------------

function ratingButton(entry, role, choristerName) {
  const key = `${entry.id}_${role}`;
  const existing = ratings[key];
  const btn = document.createElement("button");
  btn.className = "rating-btn";
  btn.title = existing ? `Rated ${existing.rating}★ — click to edit` : "Add rating";
  btn.innerHTML = existing
    ? `${"★".repeat(existing.rating)}<span style="color:#ccc">${"★".repeat(5 - existing.rating)}</span>`
    : "☆";
  btn.style.display = "block";
  btn.style.marginTop = "0.25rem";
  btn.addEventListener("click", () => openRatingModal(entry, role, choristerName, existing || null));
  return btn;
}

let _ratingModalState = {};  // holds context while modal is open

function openRatingModal(entry, role, choristerName, existing) {
  const roleLabel = { hymn: "Hymn", praise_worship: "Praise Worship", thanksgiving: "Thanksgiving" }[role] || role;
  document.getElementById("ratingModalContext").textContent =
    `${choristerName} — ${roleLabel} on ${formatDate(entry.service_date)}`;

  const stars = document.getElementById("starRatingGroup");
  stars.innerHTML = "";
  const currentRating = existing ? existing.rating : 0;
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement("button");
    s.type = "button";
    s.textContent = "★";
    s.dataset.val = i;
    if (i <= currentRating) s.classList.add("lit");
    s.addEventListener("mouseover", () => {
      [...stars.querySelectorAll("button")].forEach(b => b.classList.toggle("lit", +b.dataset.val <= i));
    });
    s.addEventListener("mouseleave", () => {
      const sel = +stars.dataset.selected || 0;
      [...stars.querySelectorAll("button")].forEach(b => b.classList.toggle("lit", +b.dataset.val <= sel));
    });
    s.addEventListener("click", () => {
      stars.dataset.selected = i;
      [...stars.querySelectorAll("button")].forEach(b => b.classList.toggle("lit", +b.dataset.val <= i));
    });
    stars.appendChild(s);
  }
  stars.dataset.selected = currentRating;

  document.getElementById("ratingComment").value = existing ? (existing.comment || "") : "";
  document.getElementById("btnClearRating").classList.toggle("d-none", !existing);

  _ratingModalState = { entry, role, choristerName, existing };
  new bootstrap.Modal(document.getElementById("ratingModal")).show();
}

async function saveRating() {
  const { entry, role, existing } = _ratingModalState;
  const stars = document.getElementById("starRatingGroup");
  const ratingVal = +stars.dataset.selected;
  if (!ratingVal) { showToast("Please select a star rating.", "warning"); return; }
  const comment = document.getElementById("ratingComment").value.trim() || null;
  const chorister_id = existing ? existing.chorister_id
    : (entry[`${role}_chorister_id`]);
  const btn = document.getElementById("btnSaveRating");
  setLoading(btn, true);
  try {
    const saved = await api("POST", "/api/ratings", {
      roster_entry_id: entry.id, role, chorister_id, rating: ratingVal, comment,
    });
    ratings[`${entry.id}_${role}`] = saved;
    bootstrap.Modal.getInstance(document.getElementById("ratingModal")).hide();
    renderRosterTable();
    showToast("Rating saved.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

async function clearRating() {
  const { entry, role, existing } = _ratingModalState;
  if (!existing) return;
  try {
    await api("DELETE", `/api/ratings/${existing.id}`);
    delete ratings[`${entry.id}_${role}`];
    bootstrap.Modal.getInstance(document.getElementById("ratingModal")).hide();
    renderRosterTable();
    showToast("Rating removed.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

async function openMyRatings() {
  const modal = new bootstrap.Modal(document.getElementById("myRatingsModal"));
  const body = document.getElementById("myRatingsBody");
  body.innerHTML = '<p class="text-muted small">Loading…</p>';
  modal.show();
  try {
    const list = await api("GET", "/api/ratings/me");
    if (!list.length) {
      body.innerHTML = '<p class="text-muted small mb-0">No ratings yet.</p>';
      return;
    }
    const roleLabel = { hymn: "Hymn", praise_worship: "Praise Worship", thanksgiving: "Thanksgiving" };
    body.innerHTML = list.map(r => `
      <div class="my-rating-card">
        <div class="d-flex justify-content-between align-items-start">
          <span class="my-rating-role">${escHtml(roleLabel[r.role] || r.role)}</span>
          <span class="my-rating-date">${r.service_date ? formatDate(r.service_date) : ""}</span>
        </div>
        <div class="my-rating-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
        ${r.comment ? `<div class="my-rating-comment"><i class="bi bi-chat-left-text me-1 text-muted"></i>${escHtml(r.comment)}</div>` : ""}
      </div>`).join("");
  } catch (error) {
    body.innerHTML = `<p class="text-danger small">${escHtml(error.message)}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Roster modal — add/edit service dates, chorister/song assignment
// ---------------------------------------------------------------------------

async function openRosterModal(entry = null) {
  if (!isAdmin) return;
  // Refresh stats so use-counts in dropdowns are current
  try { songStats = await api("GET", "/api/songs/stats"); } catch (_) {}
  document.getElementById("rosterModalTitle").textContent = entry ? "Edit Service Date" : "Add Service Date";
  document.getElementById("rosterEntryId").value = entry ? entry.id : "";
  document.getElementById("serviceDate").value = entry ? entry.service_date : monthAlignedDate();

  const hymnChorId = entry?.hymn_chorister_id || null;
  const pwChorId = entry?.praise_worship_chorister_id || null;
  const thanksChorId = entry?.thanksgiving_chorister_id || null;

  document.getElementById("hymnChorister").value = hymnChorId || "";
  document.getElementById("hymnSongTitle").value = entry?.hymn_song_title || "";
  document.getElementById("hymnMusicalKey").value = entry?.hymn_musical_key || "";

  document.getElementById("praiseWorshipChorister").value = pwChorId || "";
  document.getElementById("praiseWorshipMusicalKey").value = entry?.praise_worship_musical_key || "";
  document.getElementById("praiseWorshipLoopBitrate").value = entry?.praise_worship_loop_bitrate || "";

  document.getElementById("thanksgivingChorister").value = thanksChorId || "";
  document.getElementById("thanksgivingMusicalKey").value = entry?.thanksgiving_musical_key || "";
  document.getElementById("thanksgivingLoopBitrate").value = entry?.thanksgiving_loop_bitrate || "";

  document.getElementById("serviceNotes").value = entry?.notes || "";

  // Filter song dropdowns to only songs submitted by the assigned chorister (or admin songs)
  refreshSongDropdown("hymnSongSelect", ["hymn", "general"], hymnChorId);
  refreshSongDropdown("praiseWorshipSongSelect", ["praise_worship", "general"], pwChorId);
  refreshSongDropdown("thanksgivingSongSelect", ["thanksgiving", "general"], thanksChorId);

  // Restore saved song selection after filtering
  document.getElementById("hymnSongSelect").value = entry?.hymn_song_id || "";
  document.getElementById("praiseWorshipSongSelect").value = entry?.praise_worship_song_id || "";
  document.getElementById("thanksgivingSongSelect").value = entry?.thanksgiving_song_id || "";

  ["hymnSongLyrics", "praiseWorshipSongLyrics", "thanksgivingSongLyrics"].forEach((id) => {
    const el = document.getElementById(id);
    el.textContent = ""; el.style.display = "none";
  });
  new bootstrap.Modal(document.getElementById("rosterModal")).show();
}

function monthAlignedDate() {
  const dt = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  return dt.toISOString().slice(0, 10);
}

async function saveRosterEntry() {
  const id = document.getElementById("rosterEntryId").value;
  const hymnSongId = parseInt(document.getElementById("hymnSongSelect").value, 10) || null;
  const praiseWorshipSongId = parseInt(document.getElementById("praiseWorshipSongSelect").value, 10) || null;
  const thanksgivingSongId = parseInt(document.getElementById("thanksgivingSongSelect").value, 10) || null;
  const payload = {
    service_date: document.getElementById("serviceDate").value,
    hymn_chorister_id: parseInt(document.getElementById("hymnChorister").value, 10) || null,
    hymn_song_id: hymnSongId,
    hymn_song_title: hymnSongId ? "" : document.getElementById("hymnSongTitle").value.trim(),
    hymn_musical_key: document.getElementById("hymnMusicalKey").value.trim(),
    praise_worship_chorister_id: parseInt(document.getElementById("praiseWorshipChorister").value, 10) || null,
    praise_worship_song_id: praiseWorshipSongId,
    praise_worship_musical_key: document.getElementById("praiseWorshipMusicalKey").value.trim(),
    praise_worship_loop_bitrate: document.getElementById("praiseWorshipLoopBitrate").value.trim(),
    thanksgiving_chorister_id: parseInt(document.getElementById("thanksgivingChorister").value, 10) || null,
    thanksgiving_song_id: thanksgivingSongId,
    thanksgiving_musical_key: document.getElementById("thanksgivingMusicalKey").value.trim(),
    thanksgiving_loop_bitrate: document.getElementById("thanksgivingLoopBitrate").value.trim(),
    notes: document.getElementById("serviceNotes").value.trim() || null,
  };
  if (!payload.service_date) { showToast("Service date is required.", "warning"); return; }
  const btn = document.getElementById("btnSaveRoster");
  setLoading(btn, true);
  try {
    if (id) { await api("PUT", `/api/roster/${id}`, payload); }
    else { await api("POST", "/api/roster", payload); }
    bootstrap.Modal.getInstance(document.getElementById("rosterModal")).hide();
    await loadRoster();
    showToast("Roster entry saved.", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function deleteRosterEntry(id, btn) {
  const confirmed = await confirmAction("Delete this service date from the monthly roster?");
  if (!confirmed) return;
  setLoading(btn, true);
  try {
    await api("DELETE", `/api/roster/${id}`);
    await loadRoster();
    showToast("Service date deleted.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
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
  if (error.status === 401) {
    setAdminMode(false);
    renderRosterTable();
    renderChoristersList();
    showToast("Session expired. Please log in again.", "warning");
    new bootstrap.Modal(document.getElementById("loginModal")).show();
    return;
  }
  showToast(error.message, "danger");
}

// ---------------------------------------------------------------------------
// Analytics — chorister stats, color category cards, date-range stats
// ---------------------------------------------------------------------------

function renderStatsList(stats, container) {
  if (!stats || stats.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No data for this period.</p>';
    return;
  }
  const dash = `<span style="color:#bbb;font-size:.85rem">—</span>`;
  const badge = (count, bg, color, border) => count > 0
    ? `<span style="display:inline-block;min-width:26px;padding:.15rem .5rem;border-radius:999px;font-size:.8rem;font-weight:700;background:${bg};color:${color};border:1px solid ${border};text-align:center">${count}</span>`
    : dash;
  const rows = stats.map((s, i) => {
    const h = s.hymn_count || 0;
    const p = s.praise_worship_count || 0;
    const t = s.thanksgiving_count || 0;
    const total = s.total ?? (h + p + t);
    const isTop = i === 0;
    const rowBg = isTop ? "#edf7e4" : (i % 2 === 0 ? "#fff" : "#f9fdf7");
    const rankHtml = isTop
      ? `<i class="bi bi-star-fill" style="color:#c8a84b;font-size:.75rem;margin-right:5px"></i>`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#eee;color:#888;font-size:.68rem;font-weight:700;margin-right:5px;flex-shrink:0">${i + 1}</span>`;
    return `<tr style="background:${rowBg}">
      <td style="padding:.45rem .7rem;border-bottom:1px solid #eef0eb;font-weight:${isTop ? "700" : "600"};color:#1c3a27;display:flex;align-items:center;gap:0">${rankHtml}${escHtml(s.name)}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center">${badge(h, "#fdf8e8", "#8a6c1a", "#f0d880")}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center">${badge(p, "#edf4e8", "#2a5a38", "#bdd4b4")}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center">${badge(t, "#fdf0ee", "#b84a3a", "#f5c9c5")}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center"><span style="display:inline-block;min-width:28px;padding:.18rem .55rem;border-radius:999px;background:#1c3a27;color:#fff;font-size:.82rem;font-weight:800;text-align:center">${total}</span></td>
    </tr>`;
  }).join("");
  container.innerHTML = `
    <div style="border-radius:10px;overflow:hidden;border:1px solid #d9d2c3">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:inherit">
        <colgroup>
          <col style="width:38%">
          <col style="width:15.5%"><col style="width:15.5%"><col style="width:15.5%">
          <col style="width:15.5%">
        </colgroup>
        <thead>
          <tr style="background:#1c3a27">
            <th style="padding:.55rem .7rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#a8c9b0;border:none;text-align:left">Chorister</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#c8a84b;border:none;text-align:center"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#c8a84b;margin-right:4px;vertical-align:middle;position:relative;top:-1px"></span>Hymn</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7ec8a0;border:none;text-align:center"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4a7c59;margin-right:4px;vertical-align:middle;position:relative;top:-1px"></span>Praise</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#f5a89e;border:none;text-align:center"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#e87b6e;margin-right:4px;vertical-align:middle;position:relative;top:-1px"></span>Thanks</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#fff;border:none;text-align:center">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderMonthlyStats() {
  const container = document.getElementById("analyticsMonthOutput");
  const counts = {};
  rosterEntries.forEach((entry) => {
    [
      [entry.hymn_chorister_id, entry.hymn_chorister_name, "hymn"],
      [entry.praise_worship_chorister_id, entry.praise_worship_chorister_name, "praise_worship"],
      [entry.thanksgiving_chorister_id, entry.thanksgiving_chorister_name, "thanksgiving"],
    ].forEach(([id, name, role]) => {
      if (id && name) {
        if (!counts[id]) counts[id] = { chorister_id: id, name, hymn_count: 0, praise_worship_count: 0, thanksgiving_count: 0, total: 0 };
        counts[id][`${role}_count`] += 1;
        counts[id].total += 1;
      }
    });
  });
  const stats = Object.values(counts).sort((a, b) => b.total - a.total);
  renderStatsList(stats, container);
  renderCategoryAnalytics();
}

function renderCategoryAnalytics() {
  renderOneCategoryCard("analyticsHymn", "hymn_count", "#c8a84b");
  renderOneCategoryCard("analyticsPraise", "praise_worship_count", "#4a7c59");
  renderOneCategoryCard("analyticsThanksgiving", "thanksgiving_count", "#e87b6e");
}

function renderOneCategoryCard(containerId, countKey, barColor) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const relevant = songStats.filter((s) => s[countKey] > 0).sort((a, b) => b[countKey] - a[countKey]);
  if (relevant.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No usage data yet.</p>';
    return;
  }
  const max = relevant[0][countKey];
  container.innerHTML = relevant.slice(0, 8).map((s, i) => {
    const pct = Math.round((s[countKey] / max) * 100);
    return `
      <div class="cat-stat-row ${i === 0 ? "cat-stat-top" : ""}">
        <div class="cat-stat-name" title="${escHtml(s.title)}">${i + 1}. ${escHtml(s.title)}</div>
        <div class="cat-stat-bar-wrap">
          <div class="cat-stat-bar" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <span class="cat-stat-count">${s[countKey]}×</span>
      </div>`;
  }).join("");
}

function renderRangeChart(stats, container) {
  if (!stats || stats.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No data for this period.</p>';
    return;
  }

  const cats = [
    { key: 'hymn_count',           label: 'Hymn',           color: '#c8a84b', grad: '#e8c96a', track: '#fff', text: '#5a3e00' },
    { key: 'praise_worship_count', label: 'Praise Worship', color: '#4a7c59', grad: '#6aad84', track: '#fff', text: '#fff'    },
    { key: 'thanksgiving_count',   label: 'Thanksgiving',   color: '#e87b6e', grad: '#f4a89e', track: '#fff', text: '#fff'    },
  ];

  // Fixed 0-12 scale for growth measurement; expands if data exceeds 12
  const dataMax = Math.max(...stats.flatMap(s => cats.map(c => s[c.key] || 0)), 1);
  const maxVal = Math.max(12, dataMax);

  // X-axis ticks every 3 (0, 3, 6, 9, 12 …)
  const tickStep = 3;
  const ticks = [];
  for (let v = 0; v <= maxVal; v += tickStep) ticks.push(v);
  if (ticks[ticks.length - 1] < maxVal) ticks.push(maxVal);

  const uid = `rc${Date.now()}`;

  const keyframes = stats.flatMap((s, ri) =>
    cats.map((c, ci) => {
      const pct = Math.round(((s[c.key] || 0) / maxVal) * 100);
      return `@keyframes ${uid}_${ri}_${ci}{from{width:0}to{width:${pct}%}}`;
    })
  ).join('');

  const legend = `
    <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.5rem;padding-bottom:.4rem;border-bottom:1px solid #f0ece6">
      ${cats.map(c => `
        <div style="display:flex;align-items:center;gap:.3rem">
          <span style="width:14px;height:8px;border-radius:2px;background:linear-gradient(90deg,${c.color},${c.grad});display:inline-block"></span>
          <span style="font-size:.7rem;font-weight:700;color:#3a4a3a;font-family:inherit">${c.label}</span>
        </div>`).join('')}
      <span style="margin-left:auto;font-size:.65rem;color:#aaa;font-weight:600;font-family:inherit">Count →</span>
    </div>`;

  const rows = stats.map((s, ri) => {
    const isTop = ri === 0;
    const total = s.total ?? cats.reduce((a, c) => a + (s[c.key] || 0), 0);

    const nameBadge = isTop
      ? `<div style="font-size:.55rem;font-weight:900;letter-spacing:.08em;color:#c8a84b;text-transform:uppercase;line-height:1;margin-bottom:1px">★ Top</div>`
      : `<div style="font-size:.6rem;font-weight:700;color:#ccc;line-height:1;margin-bottom:1px">#${ri + 1}</div>`;

    const nameEl = `
      <div style="width:95px;flex-shrink:0;padding-right:.4rem;border-right:1.5px solid ${isTop ? '#c5dfc9' : '#eee'}">
        ${nameBadge}
        <div style="font-size:.78rem;font-weight:${isTop ? 800 : 700};color:#1c3a27;font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2" title="${escHtml(s.name)}">${escHtml(s.name)}</div>
      </div>`;

    const bars = cats.map((c, ci) => {
      const count = s[c.key] || 0;
      const pct = Math.round((count / maxVal) * 100);
      const delay = (ri * cats.length + ci) * 40;
      const anim = `${uid}_${ri}_${ci}`;
      return `
        <div style="display:flex;align-items:center;gap:.25rem;line-height:1;margin-bottom:1px">
          <div style="flex:1;height:9px;background:${c.track};border-radius:0 3px 3px 0;border:1px solid #e8e2d8;overflow:hidden">
            <div style="height:100%;background:linear-gradient(90deg,${c.color},${c.grad});border-radius:0 3px 3px 0;animation:${anim} .55s cubic-bezier(.22,1,.36,1) ${delay}ms both;min-width:${count > 0 ? '3px' : '0'}"></div>
          </div>
          <span style="min-width:13px;height:9px;font-size:.63rem;font-weight:${count > 0 ? 800 : 400};color:${count > 0 ? c.color : '#ddd'};line-height:9px;display:inline-block">${count > 0 ? count : '—'}</span>
        </div>`;
    }).join('');

    const rowBg = isTop ? 'linear-gradient(135deg,#f2fbec,#e6f5dc)' : ri % 2 === 0 ? '#fff' : '#fafaf8';

    return `
      <div style="display:flex;align-items:center;gap:.4rem;padding:.25rem .45rem;border-radius:6px;margin-bottom:2px;background:${rowBg};border:1px solid ${isTop ? '#c5dfc9' : 'transparent'}">
        ${nameEl}
        <div style="flex:1;padding:0 .1rem">${bars}</div>
        <div style="flex-shrink:0;margin-left:.15rem">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1c3a27;color:#fff;font-size:.68rem;font-weight:900;font-family:inherit;${isTop ? 'box-shadow:0 0 0 2px #c8a84b80' : ''}">${total}</span>
        </div>
      </div>`;
  }).join('');

  const axisBar = `
    <div style="display:flex;align-items:flex-start;gap:.4rem;margin-top:.2rem;padding:0 .45rem">
      <div style="width:95px;flex-shrink:0;padding-right:.4rem;border-right:1.5px solid #eee"></div>
      <div style="flex:1;position:relative;border-top:1.5px solid #d8d0c4;height:14px">
        ${ticks.map(v => `<span style="position:absolute;left:${Math.round((v/maxVal)*100)}%;transform:translateX(-50%);font-size:.6rem;color:#bbb;font-weight:700;top:2px;font-family:inherit">${v}</span>`).join('')}
      </div>
      <div style="width:22px;flex-shrink:0;margin-left:.15rem"></div>
    </div>`;

  container.innerHTML = `<style>${keyframes}</style><div style="border:1.5px solid #d4cfc7;border-radius:10px;padding:.55rem .65rem .35rem;background:#fff">${legend}<div>${rows}</div>${axisBar}</div>`;
}

async function loadRangeStats() {
  const from = document.getElementById("analyticsFrom").value;
  const to = document.getElementById("analyticsTo").value;
  const container = document.getElementById("analyticsRangeOutput");
  if (!from || !to) { showToast("Select both From and To months.", "warning"); return; }
  if (from > to) { showToast("From month must be before To month.", "warning"); return; }
  const btn = document.getElementById("btnShowStats");
  setLoading(btn, true);
  container.innerHTML = '<p class="text-muted small">Loading…</p>';
  try {
    const stats = await api("GET", `/api/analytics?from=${from}&to=${to}`);
    renderRangeChart(stats, container);
  } catch (error) {
    showToast(error.message, "danger");
    container.innerHTML = "";
  } finally {
    setLoading(btn, false);
  }
}

// ---------------------------------------------------------------------------
// Utilities — date formatting, HTML escaping
// ---------------------------------------------------------------------------

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Prayer Roster
// ---------------------------------------------------------------------------

function setPrayerMonthPickerValue() {
  const month = String(prayerSelectedMonth.getMonth() + 1).padStart(2, "0");
  document.getElementById("prayerMonthPicker").value =
    `${prayerSelectedMonth.getFullYear()}-${month}`;
}

async function loadPrayerRoster() {
  setPrayerMonthPickerValue();
  const year  = prayerSelectedMonth.getFullYear();
  const month = prayerSelectedMonth.getMonth() + 1;
  try {
    prayerEntries = await api("GET", `/api/prayer-roster?year=${year}&month=${month}`);
  } catch (_) {
    prayerEntries = [];
  }
  await renderPrayerRosterTable();
}

async function renderPrayerRosterTable() {
  const tbody = document.getElementById("prayerRosterTableBody");
  tbody.innerHTML = "";
  const colspan = isAdmin ? 3 : 2;

  if (prayerEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">No prayer dates planned for this month.</td></tr>`;
  } else {
    prayerEntries.forEach((entry) => {
      const tr = document.createElement("tr");

      const dateTd = document.createElement("td");
      dateTd.className = "date-cell";
      dateTd.textContent = formatDate(entry.date);
      tr.appendChild(dateTd);

      const nameTd = document.createElement("td");
      nameTd.innerHTML = entry.chorister_name
        ? `<span class="member-name">${escHtml(entry.chorister_name)}</span>`
        : '<span class="text-muted fst-italic">Unassigned</span>';
      tr.appendChild(nameTd);

      if (isAdmin) {
        const actTd = document.createElement("td");
        actTd.className = "text-end";

        const editBtn = document.createElement("button");
        editBtn.className = "btn btn-sm btn-outline-primary me-1";
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.addEventListener("click", () => openPrayerEditForm(entry));

        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-outline-danger";
        delBtn.innerHTML = '<i class="bi bi-trash"></i>';
        delBtn.addEventListener("click", () => deletePrayerEntry(entry.id, delBtn));

        actTd.appendChild(editBtn);
        actTd.appendChild(delBtn);
        tr.appendChild(actTd);
      }

      tbody.appendChild(tr);
    });
  }

  // "Next Up" row — always appended at the bottom
  try {
    const next = await api("GET", "/api/prayer-roster/next");
    if (next && next.chorister_name) {
      const nextTr = document.createElement("tr");
      nextTr.className = "prayer-next-up-row";

      const labelTd = document.createElement("td");
      labelTd.innerHTML = `<span class="prayer-next-badge">Next Up</span>
        <span class="text-muted small ms-2">${escHtml(formatDate(next.date))}</span>`;

      const nameTd2 = document.createElement("td");
      nameTd2.innerHTML = `<span class="member-name prayer-next-name">${escHtml(next.chorister_name)}</span>`;

      nextTr.appendChild(labelTd);
      nextTr.appendChild(nameTd2);
      if (isAdmin) nextTr.appendChild(document.createElement("td"));

      tbody.appendChild(nextTr);
    }
  } catch (_) {
    // No upcoming entries — omit row silently
  }
}

function openPrayerRosterModal() {
  prayerSelectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  resetPrayerForm();
  loadPrayerRoster();
  new bootstrap.Modal(document.getElementById("prayerRosterModal")).show();
}

function openPrayerEditForm(entry) {
  const form = document.getElementById("prayerAddForm");
  form.classList.remove("d-none");
  document.getElementById("prayerEntryId").value = entry ? entry.id : "";
  document.getElementById("prayerDate").value = entry ? entry.date : "";
  document.getElementById("prayerChoristerSelect").value = entry ? (entry.chorister_id || "") : "";
  form.scrollIntoView({ behavior: "smooth" });
}

function resetPrayerForm() {
  document.getElementById("prayerEntryId").value = "";
  document.getElementById("prayerDate").value = "";
  document.getElementById("prayerChoristerSelect").value = "";
  document.getElementById("prayerAddForm").classList.add("d-none");
}

function populatePrayerChoristerSelect() {
  const sel = document.getElementById("prayerChoristerSelect");
  if (!sel) return;
  const options = ['<option value="">— Unassigned —</option>']
    .concat(choristers.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`))
    .join("");
  sel.innerHTML = options;
}

async function savePrayerEntry() {
  const id         = document.getElementById("prayerEntryId").value;
  const dateVal    = document.getElementById("prayerDate").value;
  const choristerId = parseInt(document.getElementById("prayerChoristerSelect").value, 10) || null;

  if (!dateVal) { showToast("Date is required.", "warning"); return; }

  const payload = { date: dateVal, chorister_id: choristerId };
  const btn = document.getElementById("btnSavePrayerEntry");
  setLoading(btn, true);
  try {
    if (id) {
      await api("PUT", `/api/prayer-roster/${id}`, payload);
    } else {
      await api("POST", "/api/prayer-roster", payload);
    }
    resetPrayerForm();
    await loadPrayerRoster();
    showToast("Prayer roster entry saved.", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function deletePrayerEntry(id, btn) {
  const confirmed = await confirmAction("Remove this prayer date from the roster?");
  if (!confirmed) return;
  setLoading(btn, true);
  try {
    await api("DELETE", `/api/prayer-roster/${id}`);
    await loadPrayerRoster();
    showToast("Prayer entry deleted.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

function shiftPrayerMonth(delta) {
  prayerSelectedMonth = new Date(
    prayerSelectedMonth.getFullYear(),
    prayerSelectedMonth.getMonth() + delta,
    1
  );
  loadPrayerRoster();
}

function onPrayerMonthChange() {
  const [year, month] = document.getElementById("prayerMonthPicker").value.split("-").map(Number);
  if (!year || !month) return;
  prayerSelectedMonth = new Date(year, month - 1, 1);
  loadPrayerRoster();
}

// ---------------------------------------------------------------------------
// Initialisation — wire all event listeners after DOM is ready
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  await Promise.all([loadSession(), loadChoristerSession()]);
  await loadChoristers();
  await loadSongs();
  await loadRoster();

  // Also load songStats on start so analytics are populated
  try {
    songStats = await api("GET", "/api/songs/stats");
    renderCategoryAnalytics();
  } catch (_) {}

  // Login modal focus
  document.getElementById("loginModal").addEventListener("shown.bs.modal", () => {
    document.getElementById("adminPassword").focus();
  });
  document.getElementById("choristerLoginModal").addEventListener("shown.bs.modal", () => {
    document.getElementById("choristerPinInput").focus();
  });

  // Admin auth
  document.getElementById("btnLogin").addEventListener("click", () => new bootstrap.Modal(document.getElementById("loginModal")).show());
  document.getElementById("btnSubmitLogin").addEventListener("click", login);
  document.getElementById("adminPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  document.getElementById("btnLogout").addEventListener("click", logout);

  // Chorister auth
  document.getElementById("btnChoristerLogin").addEventListener("click", openChoristerLoginModal);
  document.getElementById("btnSubmitChoristerLogin").addEventListener("click", choristerLogin);
  document.getElementById("choristerPinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") choristerLogin(); });
  document.getElementById("btnChoristerLogout").addEventListener("click", choristerLogout);

  // Roster
  document.getElementById("btnAddRoster").addEventListener("click", () => openRosterModal());
  document.getElementById("btnSaveRoster").addEventListener("click", saveRosterEntry);
  document.getElementById("monthPicker").addEventListener("change", onMonthChange);
  document.getElementById("btnPrevMonth").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("btnNextMonth").addEventListener("click", () => shiftMonth(1));

  // Choristers modal
  document.getElementById("btnManageChoristers").addEventListener("click", () => {
    renderChoristersList();
    new bootstrap.Modal(document.getElementById("choristersModal")).show();
  });
  document.getElementById("btnAddChorister").addEventListener("click", addChorister);
  document.getElementById("newChoristerName").addEventListener("keydown", (e) => { if (e.key === "Enter") addChorister(); });
  document.getElementById("btnConfirmSetPin").addEventListener("click", confirmSetPin);
  document.getElementById("setPinValue").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmSetPin(); });

  // Songs library
  document.getElementById("btnSongsLibrary").addEventListener("click", openSongsModal);
  document.getElementById("btnSyncAllToDrive").addEventListener("click", (e) => syncAllToDrive(e.currentTarget));
  document.getElementById("btnSaveSong").addEventListener("click", saveSong);
  document.getElementById("btnCancelSongEdit").addEventListener("click", resetSongForm);
  document.getElementById("songSearchInput").addEventListener("input", renderSongsList);
  document.getElementById("sortByMostSung").addEventListener("change", (e) => {
    sortSongsByMostSung = e.target.checked;
    renderSongsList();
  });

  // View Lyrics
  document.getElementById("btnViewLyrics").addEventListener("click", openLyricsModal);
  document.getElementById("btnLoadLyrics").addEventListener("click", loadLyricsByMonth);

  // All Songs search + category filter
  document.getElementById("allSongsSearch").addEventListener("input", renderAllSongsCatalogue);
  document.getElementById("allSongsCatFilter").addEventListener("click", (e) => {
    const btn = e.target.closest(".all-songs-filter-btn");
    if (!btn) return;
    document.querySelectorAll(".all-songs-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderAllSongsCatalogue();
  });

  // Print
  document.getElementById("btnPrint").addEventListener("click", () => window.print());

  // Analytics page
  document.getElementById("btnAnalytics").addEventListener("click", () => {
    renderMonthlyStats();
    renderCategoryAnalytics();
    new bootstrap.Modal(document.getElementById("analyticsModal")).show();
  });

  // Prayer Roster
  document.getElementById("btnPrayerRoster").addEventListener("click", openPrayerRosterModal);
  document.getElementById("btnPrayerPrevMonth").addEventListener("click", () => shiftPrayerMonth(-1));
  document.getElementById("btnPrayerNextMonth").addEventListener("click", () => shiftPrayerMonth(1));
  document.getElementById("prayerMonthPicker").addEventListener("change", onPrayerMonthChange);
  document.getElementById("btnAddPrayerEntry").addEventListener("click", () => openPrayerEditForm(null));
  document.getElementById("btnSavePrayerEntry").addEventListener("click", savePrayerEntry);
  document.getElementById("btnCancelPrayerEdit").addEventListener("click", resetPrayerForm);

  // Performance ratings
  document.getElementById("btnSaveRating").addEventListener("click", saveRating);
  document.getElementById("btnClearRating").addEventListener("click", clearRating);
  document.getElementById("btnMyRatings").addEventListener("click", openMyRatings);

  // Dark / light theme toggle
  document.getElementById("btnThemeToggle").addEventListener("click", toggleTheme);
  // Sync icon to match whatever the early IIFE applied
  setTheme(localStorage.getItem("chorister-theme") || "light");

  // Analytics
  document.getElementById("btnShowStats").addEventListener("click", loadRangeStats);

  // Chorister → song dropdown filters (live re-filter when chorister changes)
  bindChoristerSongFilter("hymnChorister", "hymnSongSelect", ["hymn", "general"]);
  bindChoristerSongFilter("praiseWorshipChorister", "praiseWorshipSongSelect", ["praise_worship", "general"]);
  bindChoristerSongFilter("thanksgivingChorister", "thanksgivingSongSelect", ["thanksgiving", "general"]);

  // Song select lyrics preview
  bindSongSelectPreview("hymnSongSelect", "hymnSongLyrics");
  bindSongSelectPreview("praiseWorshipSongSelect", "praiseWorshipSongLyrics");
  bindSongSelectPreview("thanksgivingSongSelect", "thanksgivingSongLyrics");
});
