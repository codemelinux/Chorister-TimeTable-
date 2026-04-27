// Developed by Benedict U.
let choristers = [];
let rosterEntries = [];
let selectedMonth = new Date();
let isAdmin = false;

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

function setAdminMode(authenticated) {
  isAdmin = authenticated;
  document.getElementById("authStatus").textContent = authenticated ? "Admin mode" : "Public view";
  document.getElementById("btnAddRoster").classList.toggle("d-none", !authenticated);
  document.getElementById("btnManageChoristers").classList.toggle("d-none", !authenticated);
  document.getElementById("btnLogin").classList.toggle("d-none", authenticated);
  document.getElementById("btnLogout").classList.toggle("d-none", !authenticated);
  document.getElementById("actionsHeader").classList.toggle("d-none", !authenticated);
}

async function loadSession() {
  const session = await api("GET", "/api/auth/session");
  setAdminMode(Boolean(session.authenticated));
}

async function login() {
  const passwordInput = document.getElementById("adminPassword");
  try {
    await api("POST", "/api/auth/login", { password: passwordInput.value });
    passwordInput.value = "";
    bootstrap.Modal.getInstance(document.getElementById("loginModal")).hide();
    await loadSession();
    await loadRoster();
  } catch (error) {
    alert(error.message);
  }
}

async function logout() {
  await api("POST", "/api/auth/logout", {});
  await loadSession();
  await loadRoster();
}

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
    item.className = "list-group-item d-flex justify-content-between align-items-center";

    const label = document.createElement("span");
    label.textContent = chorister.name;
    item.appendChild(label);

    if (isAdmin) {
      const button = document.createElement("button");
      button.className = "btn btn-sm btn-outline-danger";
      button.innerHTML = '<i class="bi bi-trash"></i>';
      button.addEventListener("click", () => removeChorister(chorister.id));
      item.appendChild(button);
    }

    list.appendChild(item);
  });
}

function populateChoristerSelects() {
  const options = ['<option value="">Unassigned</option>']
    .concat(choristers.map((chorister) => `<option value="${chorister.id}">${escHtml(chorister.name)}</option>`))
    .join("");

  ["hymnChorister", "praiseWorshipChorister", "thanksgivingChorister"].forEach((id) => {
    document.getElementById(id).innerHTML = options;
  });
}

async function addChorister() {
  const input = document.getElementById("newChoristerName");
  const name = input.value.trim();
  if (!name) return;
  try {
    await api("POST", "/api/choristers", { name });
    input.value = "";
    await loadChoristers();
    await loadRoster();
  } catch (error) {
    handleMutationError(error);
  }
}

async function removeChorister(id) {
  if (!confirm("Remove this chorister from the roster list?")) return;
  try {
    await api("DELETE", `/api/choristers/${id}`);
    await loadChoristers();
    await loadRoster();
  } catch (error) {
    handleMutationError(error);
  }
}

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
  renderRosterTable();
}

function renderRosterTable() {
  const tbody = document.getElementById("rosterTableBody");
  tbody.innerHTML = "";

  if (rosterEntries.length === 0) {
    const colspan = isAdmin ? 5 : 4;
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="text-center text-muted py-5">
          No service dates planned for this month yet.
        </td>
      </tr>
    `;
    return;
  }

  rosterEntries.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.appendChild(cellWithHtml(formatDate(entry.service_date), "date-cell"));
    tr.appendChild(cellWithHtml(formatHymn(entry)));
    tr.appendChild(cellWithHtml(formatFunction(entry.praise_worship_chorister_name, entry.praise_worship_musical_key, entry.praise_worship_loop_bitrate)));
    tr.appendChild(cellWithHtml(formatFunction(entry.thanksgiving_chorister_name, entry.thanksgiving_musical_key, entry.thanksgiving_loop_bitrate)));

    if (isAdmin) {
      const actionsCell = document.createElement("td");
      actionsCell.className = "text-end";

      const editButton = document.createElement("button");
      editButton.className = "btn btn-sm btn-outline-primary me-1";
      editButton.innerHTML = '<i class="bi bi-pencil"></i>';
      editButton.addEventListener("click", () => openRosterModal(entry));

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-sm btn-outline-danger";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", () => deleteRosterEntry(entry.id));

      actionsCell.appendChild(editButton);
      actionsCell.appendChild(deleteButton);
      tr.appendChild(actionsCell);
    }

    tbody.appendChild(tr);
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
  if (entry.hymn_song_title) details.push(`Title: ${escHtml(entry.hymn_song_title)}`);
  if (entry.hymn_musical_key) details.push(`Key: ${escHtml(entry.hymn_musical_key)}`);
  if (details.length) parts.push(`<span class="function-meta">(${details.join("; ")})</span>`);
  return parts.length ? parts.join(" ") : '<span class="text-muted">Unassigned</span>';
}

function formatFunction(name, musicalKey, loopBitrate) {
  const parts = [];
  if (name) parts.push(`<span class="member-name">${escHtml(name)}</span>`);
  const details = [];
  if (musicalKey) details.push(`Key: ${escHtml(musicalKey)}`);
  if (loopBitrate) details.push(`Loop Bitrate: ${escHtml(loopBitrate)}`);
  if (details.length) parts.push(`<span class="function-meta">(${details.join("; ")})</span>`);
  return parts.length ? parts.join(" ") : '<span class="text-muted">Unassigned</span>';
}

function openRosterModal(entry = null) {
  if (!isAdmin) return;
  document.getElementById("rosterModalTitle").textContent = entry ? "Edit Service Date" : "Add Service Date";
  document.getElementById("rosterEntryId").value = entry ? entry.id : "";
  document.getElementById("serviceDate").value = entry ? entry.service_date : monthAlignedDate();
  document.getElementById("hymnChorister").value = entry?.hymn_chorister_id || "";
  document.getElementById("hymnSongTitle").value = entry?.hymn_song_title || "";
  document.getElementById("hymnMusicalKey").value = entry?.hymn_musical_key || "";
  document.getElementById("praiseWorshipChorister").value = entry?.praise_worship_chorister_id || "";
  document.getElementById("praiseWorshipMusicalKey").value = entry?.praise_worship_musical_key || "";
  document.getElementById("praiseWorshipLoopBitrate").value = entry?.praise_worship_loop_bitrate || "";
  document.getElementById("thanksgivingChorister").value = entry?.thanksgiving_chorister_id || "";
  document.getElementById("thanksgivingMusicalKey").value = entry?.thanksgiving_musical_key || "";
  document.getElementById("thanksgivingLoopBitrate").value = entry?.thanksgiving_loop_bitrate || "";
  new bootstrap.Modal(document.getElementById("rosterModal")).show();
}

function monthAlignedDate() {
  const dt = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  return dt.toISOString().slice(0, 10);
}

async function saveRosterEntry() {
  const id = document.getElementById("rosterEntryId").value;
  const payload = {
    service_date: document.getElementById("serviceDate").value,
    hymn_chorister_id: parseInt(document.getElementById("hymnChorister").value, 10) || null,
    hymn_song_title: document.getElementById("hymnSongTitle").value.trim(),
    hymn_musical_key: document.getElementById("hymnMusicalKey").value.trim(),
    praise_worship_chorister_id: parseInt(document.getElementById("praiseWorshipChorister").value, 10) || null,
    praise_worship_musical_key: document.getElementById("praiseWorshipMusicalKey").value.trim(),
    praise_worship_loop_bitrate: document.getElementById("praiseWorshipLoopBitrate").value.trim(),
    thanksgiving_chorister_id: parseInt(document.getElementById("thanksgivingChorister").value, 10) || null,
    thanksgiving_musical_key: document.getElementById("thanksgivingMusicalKey").value.trim(),
    thanksgiving_loop_bitrate: document.getElementById("thanksgivingLoopBitrate").value.trim(),
  };

  if (!payload.service_date) {
    alert("Service date is required.");
    return;
  }

  try {
    if (id) {
      await api("PUT", `/api/roster/${id}`, payload);
    } else {
      await api("POST", "/api/roster", payload);
    }
    bootstrap.Modal.getInstance(document.getElementById("rosterModal")).hide();
    await loadRoster();
  } catch (error) {
    handleMutationError(error);
  }
}

async function deleteRosterEntry(id) {
  if (!confirm("Delete this service date from the monthly roster?")) return;
  try {
    await api("DELETE", `/api/roster/${id}`);
    await loadRoster();
  } catch (error) {
    handleMutationError(error);
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
    alert("Your admin session has expired. Please log in again.");
    return;
  }
  alert(error.message);
}

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

document.addEventListener("DOMContentLoaded", async () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  await loadSession();
  await loadChoristers();
  await loadRoster();

  document.getElementById("btnLogin").addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("loginModal")).show();
  });
  document.getElementById("btnSubmitLogin").addEventListener("click", login);
  document.getElementById("adminPassword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
  document.getElementById("btnLogout").addEventListener("click", logout);
  document.getElementById("btnAddRoster").addEventListener("click", () => openRosterModal());
  document.getElementById("btnManageChoristers").addEventListener("click", () => {
    renderChoristersList();
    new bootstrap.Modal(document.getElementById("choristersModal")).show();
  });
  document.getElementById("btnAddChorister").addEventListener("click", addChorister);
  document.getElementById("newChoristerName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addChorister();
  });
  document.getElementById("btnSaveRoster").addEventListener("click", saveRosterEntry);
  document.getElementById("monthPicker").addEventListener("change", onMonthChange);
  document.getElementById("btnPrevMonth").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("btnNextMonth").addEventListener("click", () => shiftMonth(1));
});
