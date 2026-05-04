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

function openMonthlyDuesPage() {
  monthlyDuesYear = selectedMonth.getFullYear();
  setActivePage("monthly-dues", { syncAnalyticsMonth: false });
}

function setMonthlyDuesYearPickerValue() {
  const picker = document.getElementById("monthlyDuesYearPicker");
  if (picker) picker.value = monthlyDuesYear;
}

async function loadMonthlyDues() {
  setMonthlyDuesYearPickerValue();
  renderMonthlyDuesHeader();

  const tbody = document.getElementById("monthlyDuesTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-5">Loading monthly dues...</td></tr>`;
  }

  try {
    const data = await api("GET", `/api/monthly-dues?year=${monthlyDuesYear}`);
    monthlyDuesRows = data.rows || [];
    renderMonthlyDuesTable();
  } catch (error) {
    monthlyDuesRows = [];
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-5">Login required to view Monthly Dues.</td></tr>`;
    }
    handleMutationError(error);
  }
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

function renderMonthlyDuesTable() {
  const tbody = document.getElementById("monthlyDuesTableBody");
  const summary = document.getElementById("monthlyDuesSummary");
  if (!tbody) return;

  if (!monthlyDuesRows.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-5">No choristers found.</td></tr>`;
    if (summary) summary.innerHTML = "";
    return;
  }

  const totalOwed = monthlyDuesRows.reduce((sum, row) => sum + Number(row.total_owed || 0), 0);
  const totalPaid = monthlyDuesRows.reduce(
    (sum, row) => sum + row.months.filter((d) => d.status === "paid").reduce((s, d) => s + Number(d.amount), 0), 0
  );
  const totalWaived = monthlyDuesRows.reduce(
    (sum, row) => sum + row.months.filter((d) => d.status === "waived").reduce((s, d) => s + Number(d.amount), 0), 0
  );
  if (summary) {
    summary.innerHTML = `
      <div class="monthly-dues-stat">
        <span>Year</span><strong>${monthlyDuesYear}</strong>
      </div>
      <div class="monthly-dues-stat monthly-dues-stat--owed">
        <span>Total Owed</span><strong>RM${totalOwed}</strong>
      </div>
      <div class="monthly-dues-stat monthly-dues-stat--paid">
        <span>Total Paid</span><strong>RM${totalPaid}</strong>
      </div>
      <div class="monthly-dues-stat monthly-dues-stat--waived">
        <span>Total Waived</span><strong>RM${totalWaived}</strong>
      </div>`;
  }

  tbody.innerHTML = monthlyDuesRows.map((row) => {
    const cells = row.months.map((due) => renderMonthlyDuesCell(row, due)).join("");
    const paidCount   = row.months.filter((m) => m.status === "paid").length;
    const waivedCount = row.months.filter((m) => m.status === "waived").length;
    const paidPct     = (paidCount / 12) * 100;
    const waivedPct   = (waivedCount / 12) * 100;
    const progressLabel = waivedCount > 0
      ? `${paidCount}/12 paid · ${waivedCount} waived`
      : `${paidCount}/12 paid`;
    return `
      <tr class="monthly-dues-main-row">
        <th scope="row" class="monthly-dues-name-cell">
          <span class="member-name">${escHtml(row.chorister_name)}</span>
        </th>
        ${cells}
        <td class="monthly-dues-total-cell">
          <span class="monthly-dues-owed-pill ${Number(row.total_owed) > 0 ? 'monthly-dues-owed-pill--owed' : 'monthly-dues-owed-pill--clear'}">RM${row.total_owed}</span>
        </td>
      </tr>
      <tr class="monthly-dues-progress-row">
        <td colspan="14" class="monthly-dues-progress-cell">
          <div class="monthly-dues-progress-wrap">
            <div class="monthly-dues-progress-bar">
              <div class="mpb-paid" style="width:${paidPct}%"></div>
              <div class="mpb-waived" style="width:${waivedPct}%"></div>
            </div>
            <span class="monthly-dues-progress-label">${progressLabel}</span>
          </div>
        </td>
      </tr>`;
  }).join("");

  if (isAdmin) {
    tbody.querySelectorAll(".monthly-dues-status-select").forEach((select) => {
      select.addEventListener("change", () => updateMonthlyDueStatus(select));
    });
  }

  renderMonthlyDuesCards();
}

function renderMonthlyDuesCards() {
  const container = document.getElementById("monthlyDuesCards");
  if (!container) return;

  if (!monthlyDuesRows.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = monthlyDuesRows.map((row) => {
    const paidCount   = row.months.filter((m) => m.status === "paid").length;
    const waivedCount = row.months.filter((m) => m.status === "waived").length;
    const paidPct     = (paidCount / 12) * 100;
    const waivedPct   = (waivedCount / 12) * 100;
    const progressLabel = waivedCount > 0
      ? `${paidCount}/12 paid · ${waivedCount} waived`
      : `${paidCount}/12 paid`;

    const monthCells = row.months.map((due) => {
      const statusClass = `monthly-dues-status--${due.status}`;
      const monthName   = MONTHLY_DUES_MONTHS_SHORT[due.month - 1];
      const statusLabel = formatDueStatus(due.status);

      if (isAdmin) {
        return `
          <div class="mdc-month-cell ${statusClass}">
            <span class="mdc-month-name">${monthName}</span>
            <span class="mdc-status-label">${statusLabel}</span>
            <select class="mdc-month-select monthly-dues-card-select"
              aria-label="${escHtml(row.chorister_name)} ${MONTHLY_DUES_MONTHS[due.month - 1]} dues status"
              data-chorister-id="${row.chorister_id}"
              data-year="${due.year}"
              data-month="${due.month}">
              <option value="pending"${due.status === "pending" ? " selected" : ""}>Pending</option>
              <option value="paid"${due.status === "paid" ? " selected" : ""}>Paid</option>
              <option value="waived"${due.status === "waived" ? " selected" : ""}>Waived</option>
            </select>
          </div>`;
      }

      return `
        <div class="mdc-month-cell ${statusClass}">
          <span class="mdc-month-name">${monthName}</span>
          <span class="mdc-status-label">${statusLabel}</span>
        </div>`;
    }).join("");

    return `
      <div class="monthly-dues-card">
        <div class="mdc-header">
          <span class="mdc-name">${escHtml(row.chorister_name)}</span>
          <span class="mdc-owed">RM${row.total_owed} owed</span>
        </div>
        <div class="mdc-progress">
          <div class="monthly-dues-progress-bar">
            <div class="mpb-paid" style="width:${paidPct}%"></div>
            <div class="mpb-waived" style="width:${waivedPct}%"></div>
          </div>
          <span class="monthly-dues-progress-label">${progressLabel}</span>
        </div>
        <div class="mdc-month-grid">${monthCells}</div>
      </div>`;
  }).join("");

  if (isAdmin) {
    container.querySelectorAll(".monthly-dues-card-select").forEach((select) => {
      select.addEventListener("change", () => updateMonthlyDueStatus(select));
    });
  }
}

function renderMonthlyDuesCell(row, due) {
  const statusClass = `monthly-dues-status--${due.status}`;
  if (!isAdmin) {
    return `
      <td class="monthly-dues-cell">
        <span class="monthly-dues-amount">RM${due.amount}</span>
        <span class="monthly-dues-status ${statusClass}">${formatDueStatus(due.status)}</span>
      </td>`;
  }

  return `
    <td class="monthly-dues-cell monthly-dues-cell--editable">
      <span class="monthly-dues-amount">RM${due.amount}</span>
      <select
        class="form-select form-select-sm monthly-dues-status-select ${statusClass}"
        aria-label="${escHtml(row.chorister_name)} ${MONTHLY_DUES_MONTHS[due.month - 1]} dues status"
        data-chorister-id="${row.chorister_id}"
        data-year="${due.year}"
        data-month="${due.month}"
      >
        <option value="pending"${due.status === "pending" ? " selected" : ""}>Pending</option>
        <option value="paid"${due.status === "paid" ? " selected" : ""}>Paid</option>
        <option value="waived"${due.status === "waived" ? " selected" : ""}>Waived</option>
      </select>
    </td>`;
}

function formatDueStatus(status) {
  if (status === "paid") return "Paid";
  if (status === "waived") return "Waived";
  return "Pending";
}

async function updateMonthlyDueStatus(select) {
  const choristerId = select.dataset.choristerId;
  const year = select.dataset.year;
  const month = select.dataset.month;
  const status = select.value;
  select.disabled = true;

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
    select.disabled = false;
  }
}

async function syncMonthlyDuesToSheets() {
  const btn = document.getElementById("btnSyncDuesToSheets");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Exporting…'; }
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

function registerMonthlyDuesEventHandlers() {
  document.getElementById("btnMonthlyDues").addEventListener("click", openMonthlyDuesPage);
  document.getElementById("btnMonthlyDuesPrevYear").addEventListener("click", () => shiftMonthlyDuesYear(-1));
  document.getElementById("btnMonthlyDuesNextYear").addEventListener("click", () => shiftMonthlyDuesYear(1));
  document.getElementById("monthlyDuesYearPicker").addEventListener("change", onMonthlyDuesYearChange);
  document.getElementById("btnMonthlyDuesBackHome").addEventListener("click", () => setActivePage("home", { syncAnalyticsMonth: false }));
  document.getElementById("btnSyncDuesToSheets").addEventListener("click", syncMonthlyDuesToSheets);
}
