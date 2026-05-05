// Developed by Benedict U.
// Chorister-submitted general feedback module.
// Depends on shared helpers/state from public/app.js.

const GENERAL_FEEDBACK_TOPICS = {
  roster: "Roster",
  songs_lyrics: "Songs / Lyrics",
  practice_training: "Practice / Training",
  service_flow: "Service Flow",
  app_issue: "App Issue",
  other: "Other",
};

const GENERAL_FEEDBACK_STATUSES = {
  new: "New",
  reviewed: "Reviewed",
  resolved: "Resolved",
};

function generalFeedbackDate(record) {
  if (!record || !record.created_at) return "";
  const parsed = new Date(record.created_at);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function generalFeedbackStatusClass(status) {
  return `general-feedback-status general-feedback-status--${status || "new"}`;
}

function renderMyGeneralFeedbackItem(record) {
  return `
    <article class="general-feedback-mini-card">
      <div class="general-feedback-mini-card__top">
        <strong>${escHtml(GENERAL_FEEDBACK_TOPICS[record.topic] || record.topic)}</strong>
        <span class="${generalFeedbackStatusClass(record.status)}">${escHtml(GENERAL_FEEDBACK_STATUSES[record.status] || record.status)}</span>
      </div>
      <small>${escHtml(generalFeedbackDate(record))}</small>
      <p>${escHtml(record.message)}</p>
      ${record.suggested_action ? `<blockquote>${escHtml(record.suggested_action)}</blockquote>` : ""}
    </article>`;
}

async function loadMyGeneralFeedback() {
  const container = document.getElementById("myGeneralFeedbackList");
  if (!container) return;
  container.innerHTML = '<p class="text-muted small mb-0">Loading...</p>';

  try {
    const list = await api("GET", "/api/feedback/me");
    container.innerHTML = list.length
      ? list.map(renderMyGeneralFeedbackItem).join("")
      : '<p class="text-muted small mb-0">No feedback submitted yet.</p>';
  } catch (error) {
    container.innerHTML = `<p class="text-danger small mb-0">${escHtml(error.message)}</p>`;
  }
}

function resetGeneralFeedbackForm() {
  const form = document.getElementById("generalFeedbackForm");
  if (form) form.reset();
}

async function openGeneralFeedbackModal() {
  resetGeneralFeedbackForm();
  const modal = new bootstrap.Modal(document.getElementById("generalFeedbackModal"));
  modal.show();
  await loadMyGeneralFeedback();
}

async function submitGeneralFeedback() {
  const topic = document.getElementById("generalFeedbackTopic").value;
  const message = document.getElementById("generalFeedbackMessage").value.trim();
  const suggestedAction = document.getElementById("generalFeedbackSuggestedAction").value.trim();

  if (!message) {
    showToast("Please write your feedback before submitting.", "warning");
    return;
  }

  const btn = document.getElementById("btnSendGeneralFeedback");
  setLoading(btn, true);
  try {
    await api("POST", "/api/feedback", {
      topic,
      message,
      suggested_action: suggestedAction || null,
    });
    resetGeneralFeedbackForm();
    await loadMyGeneralFeedback();
    showToast("Feedback submitted. Thank you.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

function adminGeneralFeedbackCard(record) {
  return `
    <article class="admin-general-feedback-card" data-feedback-id="${record.id}">
      <div class="admin-general-feedback-card__head">
        <div>
          <strong>${escHtml(record.chorister_name || `Chorister #${record.chorister_id}`)}</strong>
          <small>${escHtml(GENERAL_FEEDBACK_TOPICS[record.topic] || record.topic)} - ${escHtml(generalFeedbackDate(record))}</small>
        </div>
        <select class="form-select form-select-sm admin-feedback-status-select" data-feedback-status="${record.id}">
          ${Object.entries(GENERAL_FEEDBACK_STATUSES).map(([value, label]) => `
            <option value="${value}"${record.status === value ? " selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <p>${escHtml(record.message)}</p>
      ${record.suggested_action ? `
        <div class="admin-general-feedback-card__suggestion">
          <span>Suggested action</span>
          <p>${escHtml(record.suggested_action)}</p>
        </div>` : ""}
    </article>`;
}

function renderAdminGeneralFeedbackSummary(list) {
  const section = document.getElementById("analyticsGeneralFeedbackSection");
  const container = document.getElementById("analyticsGeneralFeedbackOutput");
  if (!section || !container) return;

  if (!isAdmin) {
    section.classList.add("d-none");
    return;
  }

  section.classList.remove("d-none");
  const records = list || [];
  if (!records.length) {
    container.innerHTML = '<p class="text-muted small mb-0">No general feedback was submitted for this month.</p>';
    return;
  }

  const counts = records.reduce((acc, record) => {
    acc[record.status] = (acc[record.status] || 0) + 1;
    return acc;
  }, {});

  container.innerHTML = `
    <div class="admin-general-feedback-summary">
      <div class="admin-general-feedback-metrics">
        <span><strong>${records.length}</strong> total</span>
        <span><strong>${counts.new || 0}</strong> new</span>
        <span><strong>${counts.reviewed || 0}</strong> reviewed</span>
        <span><strong>${counts.resolved || 0}</strong> resolved</span>
      </div>
      <div class="admin-general-feedback-grid">
        ${records.map(adminGeneralFeedbackCard).join("")}
      </div>
    </div>`;

  container.querySelectorAll("[data-feedback-status]").forEach((select) => {
    select.addEventListener("change", async () => {
      const id = Number(select.dataset.feedbackStatus);
      const status = select.value;
      select.disabled = true;
      try {
        await api("PATCH", `/api/feedback/${id}`, { status });
        showToast("Feedback status updated.", "success");
        const year = analyticsMonth.getFullYear();
        const month = analyticsMonth.getMonth() + 1;
        await loadAdminGeneralFeedbackSummary(year, month);
      } catch (error) {
        showToast(error.message, "danger");
        select.disabled = false;
      }
    });
  });
}

async function loadAdminGeneralFeedbackSummary(year, month) {
  const section = document.getElementById("analyticsGeneralFeedbackSection");
  if (!isAdmin) {
    if (section) section.classList.add("d-none");
    return;
  }

  try {
    const list = await api("GET", `/api/feedback?year=${year}&month=${month}`);
    renderAdminGeneralFeedbackSummary(list);
  } catch (_) {
    if (section) section.classList.add("d-none");
  }
}

function registerGeneralFeedbackEventHandlers() {
  const openBtn = document.getElementById("btnSubmitFeedback");
  const submitBtn = document.getElementById("btnSendGeneralFeedback");
  const refreshBtn = document.getElementById("btnRefreshMyFeedback");

  if (openBtn && !openBtn.dataset.generalFeedbackBound) {
    openBtn.dataset.generalFeedbackBound = "true";
    openBtn.addEventListener("click", openGeneralFeedbackModal);
  }

  if (submitBtn && !submitBtn.dataset.generalFeedbackBound) {
    submitBtn.dataset.generalFeedbackBound = "true";
    submitBtn.addEventListener("click", submitGeneralFeedback);
  }

  if (refreshBtn && !refreshBtn.dataset.generalFeedbackBound) {
    refreshBtn.dataset.generalFeedbackBound = "true";
    refreshBtn.addEventListener("click", loadMyGeneralFeedback);
  }
}

document.addEventListener("click", (event) => {
  const openBtn = event.target.closest("#btnSubmitFeedback");
  if (!openBtn || openBtn.dataset.generalFeedbackBound === "true") return;
  event.preventDefault();
  openGeneralFeedbackModal();
});
