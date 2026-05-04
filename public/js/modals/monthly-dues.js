// Developed by Benedict U.
// Page feature module: Monthly Dues.
// Depends on shared helpers/state from public/app.js.

const MONTHLY_DUES_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHLY_DUES_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
let monthlyDuesFocusMonth = Math.min(Math.max(new Date().getMonth() + 1, 1), 12);
let monthlyDuesView = "dashboard";

function openMonthlyDuesPage() {
  monthlyDuesYear = selectedMonth.getFullYear();
  monthlyDuesFocusMonth = selectedMonth.getMonth() + 1;
  setActivePage("monthly-dues", { syncAnalyticsMonth: false });
}

function setMonthlyDuesYearPickerValue() {
  const picker = document.getElementById("monthlyDuesYearPicker");
  if (picker) picker.value = monthlyDuesYear;
}

function renderMonthlyDuesMonthPicker() {
  const picker = document.getElementById("monthlyDuesMonthPicker");
  if (!picker) return;
  picker.innerHTML = MONTHLY_DUES_MONTHS
    .map((month, index) => `<option value="${index + 1}"${monthlyDuesFocusMonth === index + 1 ? " selected" : ""}>${month}</option>`)
    .join("");
}

async function loadMonthlyDues() {
  setMonthlyDuesYearPickerValue();
  renderMonthlyDuesMonthPicker();
  renderMonthlyDuesViewTabs();
  renderMonthlyDuesHeader();

  const tbody = document.getElementById("monthlyDuesTableBody");
  const dashboard = document.getElementById("monthlyDuesDashboard");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-5">Loading monthly dues...</td></tr>`;
  }
  if (dashboard) {
    dashboard.innerHTML = `<div class="monthly-dues-empty">Loading monthly dues...</div>`;
  }

  try {
    const data = await api("GET", `/api/monthly-dues?year=${monthlyDuesYear}`);
    monthlyDuesRows = data.rows || [];
    renderMonthlyDues();
  } catch (error) {
    monthlyDuesRows = [];
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-5">Login required to view Monthly Dues.</td></tr>`;
    }
    if (dashboard) {
      dashboard.innerHTML = `<div class="monthly-dues-empty">Login required to view Monthly Dues.</div>`;
    }
    handleMutationError(error);
  }
}

function renderMonthlyDuesViewTabs() {
  document.querySelectorAll(".monthly-dues-view-tab").forEach((button) => {
    const active = button.dataset.duesView === monthlyDuesView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const dashboard = document.getElementById("monthlyDuesDashboard");
  const grid = document.getElementById("monthlyDuesGridWrap");
  if (dashboard) dashboard.classList.toggle("d-none", monthlyDuesView !== "dashboard");
  if (grid) grid.classList.toggle("d-none", monthlyDuesView !== "grid");
}

function renderMonthlyDuesHeader() {
  const thead = document.getElementById("monthlyDuesTableHead");
  if (!thead) return;
  const monthHeaders = MONTHLY_DUES_MONTHS_SHORT
    .map((month) => `<th><span class="monthly-dues-month-label">${month}</span></th>`)
    .join("");
  thead.innerHTML = `
    <tr>
      <th class="monthly-dues-name-head">Chorister</th>
      ${monthHeaders}
      <th class="monthly-dues-total-head">Total Owed</th>
    </tr>`;
}

function renderMonthlyDues() {
  renderMonthlyDuesDashboard();
  renderMonthlyDuesTable();
  renderMonthlyDuesViewTabs();
}

function getMonthlyDuesSummary() {
  const totalOwed = monthlyDuesRows.reduce((sum, row) => sum + Number(row.total_owed || 0), 0);
  const totalPaid = monthlyDuesRows.reduce(
    (sum, row) => sum + row.months.filter((d) => d.status === "paid").reduce((s, d) => s + Number(d.amount), 0), 0
  );
  const totalWaived = monthlyDuesRows.reduce(
    (sum, row) => sum + row.months.filter((d) => d.status === "waived").reduce((s, d) => s + Number(d.amount), 0), 0
  );
  const choristersOwing = monthlyDuesRows.filter((row) => Number(row.total_owed || 0) > 0).length;
  return { totalOwed, totalPaid, totalWaived, choristersOwing };
}

function renderMonthlyDuesDashboard() {
  const dashboard = document.getElementById("monthlyDuesDashboard");
  const summary = document.getElementById("monthlyDuesSummary");
  if (!dashboard) return;

  if (!monthlyDuesRows.length) {
    dashboard.innerHTML = `<div class="monthly-dues-empty">No choristers found.</div>`;
    if (summary) summary.innerHTML = "";
    return;
  }

  const totals = getMonthlyDuesSummary();
  if (summary) {
    summary.innerHTML = `
      <div class="monthly-dues-stat monthly-dues-stat--owed">
        <span>Outstanding</span><strong>RM${totals.totalOwed}</strong>
      </div>
      <div class="monthly-dues-stat monthly-dues-stat--paid">
        <span>Collected</span><strong>RM${totals.totalPaid}</strong>
      </div>
      <div class="monthly-dues-stat monthly-dues-stat--waived">
        <span>Waived</span><strong>RM${totals.totalWaived}</strong>
      </div>
      <div class="monthly-dues-stat">
        <span>Choristers owing</span><strong>${totals.choristersOwing}</strong>
      </div>`;
  }

  const preparedRows = monthlyDuesRows.map((row) => {
    const pendingMonths = row.months.filter((due) => due.status === "pending");
    const paidMonths = row.months.filter((due) => due.status === "paid");
    const waivedMonths = row.months.filter((due) => due.status === "waived");
    const focusDue = row.months.find((due) => due.month === monthlyDuesFocusMonth);
    return { ...row, pendingMonths, paidMonths, waivedMonths, focusDue };
  });
  const owingRows = preparedRows.filter((row) => Number(row.total_owed || 0) > 0);
  const paidRows = preparedRows.filter((row) => Number(row.total_owed || 0) <= 0);

  dashboard.innerHTML = `
    <section class="monthly-dues-collection-panel">
      <div class="monthly-dues-panel-heading">
        <div>
          <span class="monthly-dues-panel-kicker">${MONTHLY_DUES_MONTHS[monthlyDuesFocusMonth - 1]} focus</span>
          <h3>Outstanding dues</h3>
        </div>
        <span class="monthly-dues-panel-count">${owingRows.length} owing</span>
      </div>
      <div class="monthly-dues-owing-list">
        ${owingRows.length ? owingRows.map(renderMonthlyDuesOwingRow).join("") : `<div class="monthly-dues-empty">Everyone is paid up for ${monthlyDuesYear}.</div>`}
      </div>
    </section>
    <section class="monthly-dues-paid-panel">
      <div class="monthly-dues-panel-heading">
        <div>
          <span class="monthly-dues-panel-kicker">Clear accounts</span>
          <h3>Paid up</h3>
        </div>
        <span class="monthly-dues-panel-count">${paidRows.length} clear</span>
      </div>
      <div class="monthly-dues-paid-list">
        ${paidRows.length ? paidRows.map(renderMonthlyDuesPaidRow).join("") : `<div class="monthly-dues-empty">No paid-up choristers yet.</div>`}
      </div>
    </section>`;

  if (isAdmin) {
    dashboard.querySelectorAll(".monthly-dues-action").forEach((button) => {
      button.addEventListener("click", () => updateMonthlyDueStatus(button));
    });
  }
}

function renderMonthlyDuesOwingRow(row) {
  const focusDue = row.focusDue;
  const focusPending = focusDue && focusDue.status === "pending";
  return `
    <article class="monthly-dues-owing-row">
      <div class="monthly-dues-member-block">
        <strong>${escHtml(row.chorister_name)}</strong>
        <span>${row.pendingMonths.length} pending month${row.pendingMonths.length === 1 ? "" : "s"}</span>
      </div>
      <div class="monthly-dues-month-chip-row">
        ${row.pendingMonths.map((due) => renderMonthlyDuesMonthChip(row, due)).join("")}
      </div>
      <div class="monthly-dues-row-total">RM${row.total_owed}</div>
      ${isAdmin ? `
        <div class="monthly-dues-row-actions">
          ${focusDue ? `
            <button
              class="btn btn-sm ${focusPending ? "btn-success" : "btn-outline-secondary"} monthly-dues-action"
              type="button"
              data-chorister-id="${row.chorister_id}"
              data-year="${focusDue.year}"
              data-month="${focusDue.month}"
              data-status="paid"
              ${focusPending ? "" : "disabled"}
            >
              <i class="bi bi-check2"></i>${focusPending ? `Mark ${MONTHLY_DUES_MONTHS_SHORT[focusDue.month - 1]} paid` : `${MONTHLY_DUES_MONTHS_SHORT[focusDue.month - 1]} ${formatDueStatus(focusDue.status)}`}
            </button>
          ` : ""}
        </div>` : ""}
    </article>`;
}

function renderMonthlyDuesPaidRow(row) {
  return `
    <article class="monthly-dues-paid-row">
      <strong>${escHtml(row.chorister_name)}</strong>
      <span>${row.paidMonths.length} paid &middot; ${row.waivedMonths.length} waived</span>
    </article>`;
}

function renderMonthlyDuesMonthChip(row, due) {
  const canEdit = isAdmin;
  const commonAttrs = `
    data-chorister-id="${row.chorister_id}"
    data-year="${due.year}"
    data-month="${due.month}"`;
  if (!canEdit) {
    return `<span class="monthly-dues-month-chip monthly-dues-month-chip--pending">${MONTHLY_DUES_MONTHS_SHORT[due.month - 1]}</span>`;
  }
  return `
    <span class="monthly-dues-chip-group">
      <button class="monthly-dues-month-chip monthly-dues-month-chip--pending monthly-dues-action" type="button" ${commonAttrs} data-status="paid" title="Mark ${MONTHLY_DUES_MONTHS[due.month - 1]} paid">
        ${MONTHLY_DUES_MONTHS_SHORT[due.month - 1]}
      </button>
      <button class="monthly-dues-waive-action monthly-dues-action" type="button" ${commonAttrs} data-status="waived" aria-label="Waive ${MONTHLY_DUES_MONTHS[due.month - 1]} for ${escHtml(row.chorister_name)}">
        W
      </button>
    </span>`;
}

function renderMonthlyDuesTable() {
  const tbody = document.getElementById("monthlyDuesTableBody");
  if (!tbody) return;

  if (!monthlyDuesRows.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-5">No choristers found.</td></tr>`;
    return;
  }

  tbody.innerHTML = monthlyDuesRows.map((row) => {
    const cells = row.months.map((due) => renderMonthlyDuesCell(row, due)).join("");
    return `
      <tr>
        <th scope="row" class="monthly-dues-name-cell">
          <span class="member-name">${escHtml(row.chorister_name)}</span>
        </th>
        ${cells}
        <td class="monthly-dues-total-cell">RM${row.total_owed}</td>
      </tr>`;
  }).join("");

  if (isAdmin) {
    tbody.querySelectorAll(".monthly-dues-status-select").forEach((select) => {
      select.addEventListener("click", () => updateMonthlyDueStatus(select));
    });
  }
}

function renderMonthlyDuesCell(row, due) {
  const statusClass = `monthly-dues-status--${due.status}`;
  if (!isAdmin) {
    return `
      <td class="monthly-dues-cell">
        <span class="monthly-dues-grid-dot ${statusClass}" title="${MONTHLY_DUES_MONTHS[due.month - 1]} ${formatDueStatus(due.status)}">${formatDueSymbol(due.status)}</span>
      </td>`;
  }

  return `
    <td class="monthly-dues-cell monthly-dues-cell--editable">
      <button
        class="monthly-dues-grid-button monthly-dues-status-select ${statusClass}"
        type="button"
        title="${escHtml(row.chorister_name)} ${MONTHLY_DUES_MONTHS[due.month - 1]}: ${formatDueStatus(due.status)}"
        data-chorister-id="${row.chorister_id}"
        data-year="${due.year}"
        data-month="${due.month}"
        data-status="${getNextDueStatus(due.status)}"
      >
        ${formatDueSymbol(due.status)}
      </button>
    </td>`;
}

function formatDueStatus(status) {
  if (status === "paid") return "Paid";
  if (status === "waived") return "Waived";
  return "Pending";
}

function formatDueSymbol(status) {
  if (status === "paid") return "P";
  if (status === "waived") return "W";
  return "D";
}

function getNextDueStatus(status) {
  if (status === "pending") return "paid";
  if (status === "paid") return "waived";
  return "pending";
}

async function updateMonthlyDueStatus(control) {
  const choristerId = control.dataset.choristerId;
  const year = control.dataset.year;
  const month = control.dataset.month;
  const status = control.dataset.status || control.value;
  control.disabled = true;

  try {
    const result = await api("PUT", `/api/monthly-dues/${choristerId}/${year}/${month}`, { status });
    if (result.warning) {
      showToast(result.warning, "warning");
    } else {
      showToast("Monthly dues updated.", "success");
    }
    await loadMonthlyDues();
  } catch (error) {
    handleMutationError(error);
    await loadMonthlyDues();
  } finally {
    control.disabled = false;
  }
}

async function syncMonthlyDuesToSheets() {
  const btn = document.getElementById("btnSyncDuesToSheets");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Exporting...'; }
  try {
    const result = await api("POST", `/api/monthly-dues/sync?year=${monthlyDuesYear}`);
    showToast(`Exported ${result.synced} chorister(s) for ${result.year} to Google Sheets.`, "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-spreadsheet me-1"></i>Export to Sheets'; }
  }
}

function shiftMonthlyDuesYear(delta) {
  const next = monthlyDuesYear + delta;
  if (next < 2026) return;
  monthlyDuesYear = next;
  loadMonthlyDues();
}

function onMonthlyDuesYearChange() {
  const value = parseInt(document.getElementById("monthlyDuesYearPicker").value, 10);
  if (!value || value < 2026 || value > 2100) {
    showToast("Enter a year between 2026 and 2100.", "warning");
    setMonthlyDuesYearPickerValue();
    return;
  }
  monthlyDuesYear = value;
  loadMonthlyDues();
}

function onMonthlyDuesMonthChange() {
  const value = parseInt(document.getElementById("monthlyDuesMonthPicker").value, 10);
  if (!value || value < 1 || value > 12) return;
  monthlyDuesFocusMonth = value;
  renderMonthlyDues();
}

function setMonthlyDuesView(view) {
  monthlyDuesView = view === "grid" ? "grid" : "dashboard";
  renderMonthlyDuesViewTabs();
}

function registerMonthlyDuesEventHandlers() {
  document.getElementById("btnMonthlyDues").addEventListener("click", openMonthlyDuesPage);
  document.getElementById("btnMonthlyDuesPrevYear").addEventListener("click", () => shiftMonthlyDuesYear(-1));
  document.getElementById("btnMonthlyDuesNextYear").addEventListener("click", () => shiftMonthlyDuesYear(1));
  document.getElementById("monthlyDuesYearPicker").addEventListener("change", onMonthlyDuesYearChange);
  document.getElementById("monthlyDuesMonthPicker").addEventListener("change", onMonthlyDuesMonthChange);
  document.getElementById("btnMonthlyDuesBackHome").addEventListener("click", () => setActivePage("home", { syncAnalyticsMonth: false }));
  document.getElementById("btnSyncDuesToSheets").addEventListener("click", syncMonthlyDuesToSheets);
  document.querySelectorAll(".monthly-dues-view-tab").forEach((button) => {
    button.addEventListener("click", () => setMonthlyDuesView(button.dataset.duesView));
  });
}
