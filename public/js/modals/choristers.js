// Developed by Benedict U.
// Modal feature module: chorister management + PIN access control.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Chorister CRUD and modal helpers
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

      const pinBtn = document.createElement("button");
      pinBtn.className = "btn btn-sm btn-outline-secondary";
      pinBtn.title = chorister.has_portal_access ? "Change PIN" : "Grant portal access";
      pinBtn.innerHTML = '<i class="bi bi-key"></i>';
      pinBtn.addEventListener("click", () => openSetPinModal(chorister));
      btnGroup.appendChild(pinBtn);

      if (chorister.has_portal_access) {
        const revokeBtn = document.createElement("button");
        revokeBtn.className = "btn btn-sm btn-outline-warning";
        revokeBtn.title = "Revoke portal access";
        revokeBtn.innerHTML = '<i class="bi bi-person-x"></i>';
        revokeBtn.addEventListener("click", () => revokePortalAccess(chorister.id, revokeBtn));
        btnGroup.appendChild(revokeBtn);
      }

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
  if (!pin || pin.length < 4) {
    showToast("PIN must be at least 4 characters.", "warning");
    return;
  }

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
  if (!name) {
    showToast("Chorister name cannot be empty.", "warning");
    return;
  }

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

function registerChoristersModalEventHandlers() {
  document.getElementById("btnManageChoristers").addEventListener("click", () => {
    renderChoristersList();
    new bootstrap.Modal(document.getElementById("choristersModal")).show();
  });
  document.getElementById("btnAddChorister").addEventListener("click", addChorister);
  document.getElementById("newChoristerName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addChorister();
  });
  document.getElementById("btnConfirmSetPin").addEventListener("click", confirmSetPin);
  document.getElementById("setPinValue").addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmSetPin();
  });
}
