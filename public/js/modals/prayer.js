// Developed by Benedict U.
// Modal feature module: prayer roster modal.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Prayer roster modal
// ---------------------------------------------------------------------------

function setPrayerMonthPickerValue() {
  const month = String(prayerSelectedMonth.getMonth() + 1).padStart(2, "0");
  document.getElementById("prayerMonthPicker").value = `${prayerSelectedMonth.getFullYear()}-${month}`;
}

async function loadPrayerRoster() {
  setPrayerMonthPickerValue();
  const year = prayerSelectedMonth.getFullYear();
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
    // Omit the summary row if there is no next prayer assignment.
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
  const options = ['<option value="">--- Unassigned ---</option>']
    .concat(choristers.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`))
    .join("");
  sel.innerHTML = options;
}

async function savePrayerEntry() {
  const id = document.getElementById("prayerEntryId").value;
  const dateVal = document.getElementById("prayerDate").value;
  const choristerId = parseInt(document.getElementById("prayerChoristerSelect").value, 10) || null;
  if (!dateVal) {
    showToast("Date is required.", "warning");
    return;
  }

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

function registerPrayerModalEventHandlers() {
  document.getElementById("btnPrayerRoster").addEventListener("click", openPrayerRosterModal);
  document.getElementById("btnPrayerPrevMonth").addEventListener("click", () => shiftPrayerMonth(-1));
  document.getElementById("btnPrayerNextMonth").addEventListener("click", () => shiftPrayerMonth(1));
  document.getElementById("prayerMonthPicker").addEventListener("change", onPrayerMonthChange);
  document.getElementById("btnAddPrayerEntry").addEventListener("click", () => openPrayerEditForm(null));
  document.getElementById("btnSavePrayerEntry").addEventListener("click", savePrayerEntry);
  document.getElementById("btnCancelPrayerEdit").addEventListener("click", resetPrayerForm);
}
