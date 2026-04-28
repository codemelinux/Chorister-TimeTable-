// Developed by Benedict U.
let choristers = [];
let rosterEntries = [];
let songs = [];
let songStats = [];
let sortSongsByMostSung = false;
let selectedMonth = new Date();
let isAdmin = false;
let isChorister = false;
let choristerInfo = null; // {chorister_id, name}

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

// --- UI helpers ---

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

// --- Auth ---

function setAdminMode(authenticated) {
  isAdmin = authenticated;
  document.getElementById("authStatus").textContent = authenticated ? "Admin mode" : "Public view";
  document.getElementById("btnAddRoster").classList.toggle("d-none", !authenticated);
  document.getElementById("btnManageChoristers").classList.toggle("d-none", !authenticated);
  document.getElementById("btnLogin").classList.toggle("d-none", authenticated);
  document.getElementById("btnLogout").classList.toggle("d-none", !authenticated);
  document.getElementById("actionsHeader").classList.toggle("d-none", !authenticated);
  updateSongFormVisibility();
}

function setChoristerMode(authenticated, info) {
  isChorister = authenticated;
  choristerInfo = info || null;
  const pill = document.getElementById("choristerStatus");
  const loginBtn = document.getElementById("btnChoristerLogin");
  const logoutBtn = document.getElementById("btnChoristerLogout");
  if (authenticated && info) {
    pill.textContent = `🎵 ${info.name}`;
    pill.classList.remove("d-none");
    loginBtn.classList.add("d-none");
    logoutBtn.classList.remove("d-none");
  } else {
    pill.classList.add("d-none");
    loginBtn.classList.remove("d-none");
    logoutBtn.classList.add("d-none");
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

// --- Choristers ---

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

// --- Songs ---

async function loadSongs() {
  songs = await api("GET", "/api/songs");
  populateSongSelects();
}

function populateSongSelects() {
  const makeOptions = (filter) =>
    ['<option value="">-- Select song --</option>']
      .concat(songs.filter((s) => filter.includes(s.category)).map((s) => `<option value="${s.id}">${escHtml(s.title)}</option>`))
      .join("");
  document.getElementById("hymnSongSelect").innerHTML = makeOptions(["hymn", "general"]);
  document.getElementById("praiseWorshipSongSelect").innerHTML = makeOptions(["praise_worship", "general"]);
  document.getElementById("thanksgivingSongSelect").innerHTML = makeOptions(["thanksgiving", "general"]);
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
      const lyricsDiv = document.createElement("div");
      lyricsDiv.className = "text-muted small mt-1";
      lyricsDiv.style.cssText = "white-space:pre-wrap;display:none;";
      lyricsDiv.textContent = s.lyrics;
      lyricsToggle.addEventListener("click", () => {
        const shown = lyricsDiv.style.display !== "none";
        lyricsDiv.style.display = shown ? "none" : "block";
        lyricsToggle.textContent = shown ? "Show lyrics" : "Hide lyrics";
      });
      info.appendChild(lyricsToggle);
      info.appendChild(lyricsDiv);
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
      }
      top.appendChild(actions);
    }

    item.appendChild(top);
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

// --- Lyrics Modal ---

async function openLyricsModal() {
  // Pre-set month picker to current month
  const picker = document.getElementById("lyricsMontPicker");
  const m = String(selectedMonth.getMonth() + 1).padStart(2, "0");
  picker.value = `${selectedMonth.getFullYear()}-${m}`;
  new bootstrap.Modal(document.getElementById("lyricsModal")).show();
  await loadLyricsByMonth();
}

async function loadLyricsByMonth() {
  const picker = document.getElementById("lyricsMontPicker");
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

// --- Month navigation ---

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
  renderRosterTable();
  renderMonthlyStats();
}

// --- Roster table ---

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
    tr.appendChild(cellWithHtml(formatHymn(entry)));
    tr.appendChild(cellWithHtml(formatFunction(entry.praise_worship_chorister_name, entry.praise_worship_musical_key, entry.praise_worship_loop_bitrate, entry.praise_worship_song_title)));
    tr.appendChild(cellWithHtml(formatFunction(entry.thanksgiving_chorister_name, entry.thanksgiving_musical_key, entry.thanksgiving_loop_bitrate, entry.thanksgiving_song_title)));
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
      notesTd.innerHTML = `<i class="bi bi-sticky me-1 text-muted"></i><em class="text-muted small">${escHtml(entry.notes)}</em>`;
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

// --- Roster modal ---

function openRosterModal(entry = null) {
  if (!isAdmin) return;
  document.getElementById("rosterModalTitle").textContent = entry ? "Edit Service Date" : "Add Service Date";
  document.getElementById("rosterEntryId").value = entry ? entry.id : "";
  document.getElementById("serviceDate").value = entry ? entry.service_date : monthAlignedDate();
  document.getElementById("hymnChorister").value = entry?.hymn_chorister_id || "";
  document.getElementById("hymnSongTitle").value = entry?.hymn_song_title || "";
  document.getElementById("hymnSongSelect").value = entry?.hymn_song_id || "";
  document.getElementById("hymnMusicalKey").value = entry?.hymn_musical_key || "";
  document.getElementById("praiseWorshipChorister").value = entry?.praise_worship_chorister_id || "";
  document.getElementById("praiseWorshipSongSelect").value = entry?.praise_worship_song_id || "";
  document.getElementById("praiseWorshipMusicalKey").value = entry?.praise_worship_musical_key || "";
  document.getElementById("praiseWorshipLoopBitrate").value = entry?.praise_worship_loop_bitrate || "";
  document.getElementById("thanksgivingChorister").value = entry?.thanksgiving_chorister_id || "";
  document.getElementById("thanksgivingSongSelect").value = entry?.thanksgiving_song_id || "";
  document.getElementById("thanksgivingMusicalKey").value = entry?.thanksgiving_musical_key || "";
  document.getElementById("thanksgivingLoopBitrate").value = entry?.thanksgiving_loop_bitrate || "";
  document.getElementById("serviceNotes").value = entry?.notes || "";
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

// --- Analytics ---

function renderStatsList(stats, container) {
  if (!stats || stats.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No data for this period.</p>';
    return;
  }
  const maxCount = stats[0].count;
  container.innerHTML = stats.map((s, i) => `
    <div class="stat-row ${i === 0 ? "stat-top" : ""}">
      <span class="stat-name">${escHtml(s.name)}</span>
      <span class="stat-badge">${s.count} ${s.count === 1 ? "slot" : "slots"}</span>
      <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.round((s.count / maxCount) * 100)}%"></div></div>
    </div>`).join("");
}

function renderMonthlyStats() {
  const container = document.getElementById("analyticsMonthOutput");
  const counts = {};
  rosterEntries.forEach((entry) => {
    [[entry.hymn_chorister_id, entry.hymn_chorister_name],
     [entry.praise_worship_chorister_id, entry.praise_worship_chorister_name],
     [entry.thanksgiving_chorister_id, entry.thanksgiving_chorister_name]].forEach(([id, name]) => {
      if (id && name) {
        if (!counts[id]) counts[id] = { chorister_id: id, name, count: 0 };
        counts[id].count += 1;
      }
    });
  });
  const stats = Object.values(counts).sort((a, b) => b.count - a.count);
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
    renderStatsList(stats, container);
  } catch (error) {
    showToast(error.message, "danger");
    container.innerHTML = "";
  } finally {
    setLoading(btn, false);
  }
}

// --- Utilities ---

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Init ---

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

  // Print
  document.getElementById("btnPrint").addEventListener("click", () => window.print());

  // Analytics
  document.getElementById("btnShowStats").addEventListener("click", loadRangeStats);

  // Song select lyrics preview
  bindSongSelectPreview("hymnSongSelect", "hymnSongLyrics");
  bindSongSelectPreview("praiseWorshipSongSelect", "praiseWorshipSongLyrics");
  bindSongSelectPreview("thanksgivingSongSelect", "thanksgivingSongLyrics");
});
