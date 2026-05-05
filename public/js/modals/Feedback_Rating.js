// Developed by Benedict U.
// Modal feature module: guided performance feedback and self-service review.
// Depends on shared helpers/state from public/app.js.

const FEEDBACK_CATEGORIES = [
  {
    key: "on_key_rating",
    label: "On key",
    hint: "Pitch accuracy, confidence, and staying in the right key.",
  },
  {
    key: "audience_engagement_rating",
    label: "Audience engagement",
    hint: "Presence, leading, connection, and confidence with the congregation.",
  },
  {
    key: "stage_management_rating",
    label: "Stage management",
    hint: "Composure, timing, flow, transitions, and service readiness.",
  },
  {
    key: "sync_rating",
    label: "Sync with instrumentalists and BGV",
    hint: "Coordination, cues, tempo awareness, and working with the team.",
  },
];

const FEEDBACK_ROLE_LABEL = {
  hymn: "Hymn",
  praise_worship: "Praise Worship",
  thanksgiving: "Thanksgiving",
};

let _ratingModalState = {};

function feedbackScore(record, key) {
  return Number(record && record[key] ? record[key] : record && record.rating ? record.rating : 0);
}

function feedbackOverall(record) {
  return Number(record && record.rating ? record.rating : 0);
}

function feedbackStars(score) {
  const value = Math.max(0, Math.min(5, Number(score) || 0));
  return "&#9733;".repeat(value) + `<span style="color:#ccc">${"&#9734;".repeat(5 - value)}</span>`;
}

function feedbackCategoryAverage(record) {
  const scores = FEEDBACK_CATEGORIES.map((category) => feedbackScore(record, category.key)).filter(Boolean);
  if (!scores.length) return 0;
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
}

function feedbackLowestCategory(record) {
  const scored = FEEDBACK_CATEGORIES
    .map((category) => ({ ...category, score: feedbackScore(record, category.key) }))
    .filter((category) => category.score > 0)
    .sort((a, b) => a.score - b.score);
  return scored[0] || null;
}

function parseFeedbackComment(comment) {
  const raw = String(comment || "").trim();
  if (!raw) return { wentWell: "", improveNext: "" };

  const wentWellMatch = raw.match(/What went well:\s*([\s\S]*?)(?=\n{2,}What to improve next:|$)/i);
  const improveMatch = raw.match(/What to improve next:\s*([\s\S]*)$/i);
  if (wentWellMatch || improveMatch) {
    return {
      wentWell: (wentWellMatch && wentWellMatch[1] ? wentWellMatch[1] : "").trim(),
      improveNext: (improveMatch && improveMatch[1] ? improveMatch[1] : "").trim(),
    };
  }

  return { wentWell: raw, improveNext: "" };
}

function composeFeedbackComment(wentWell, improveNext) {
  const strengths = String(wentWell || "").trim();
  const improvements = String(improveNext || "").trim();
  if (!strengths && !improvements) return null;

  const sections = [];
  if (strengths) sections.push(`What went well:\n${strengths}`);
  if (improvements) sections.push(`What to improve next:\n${improvements}`);
  return sections.join("\n\n");
}

function renderFeedbackCommentHtml(comment) {
  const parsed = parseFeedbackComment(comment);
  const sections = [];
  if (parsed.wentWell) {
    sections.push(`
      <div class="feedback-comment-section feedback-comment-section--strength">
        <span>What went well</span>
        <p>${escHtml(parsed.wentWell)}</p>
      </div>`);
  }
  if (parsed.improveNext) {
    sections.push(`
      <div class="feedback-comment-section feedback-comment-section--improve">
        <span>What to improve next</span>
        <p>${escHtml(parsed.improveNext)}</p>
      </div>`);
  }
  return sections.length ? `<div class="feedback-comment-grid">${sections.join("")}</div>` : "";
}

function ratingButton(entry, role, choristerName) {
  const key = `${entry.id}_${role}`;
  const existing = ratings[key];
  const btn = document.createElement("button");
  btn.className = existing ? "rating-btn rating-btn--rated" : "rating-btn rating-btn--empty";
  btn.title = existing ? `Overall ${feedbackOverall(existing)}/5 - click to edit feedback` : "Add feedback";
  btn.innerHTML = existing
    ? feedbackStars(feedbackOverall(existing))
    : '<i class="bi bi-plus-circle-fill"></i><span>Feedback</span>';
  btn.style.display = "block";
  btn.style.marginTop = "0.25rem";
  btn.addEventListener("click", () => openRatingModal(entry, role, choristerName, existing || null));
  return btn;
}

function updateFeedbackOverallPreview() {
  const preview = document.getElementById("feedbackOverallPreview");
  if (!preview) return;

  const rows = [...document.querySelectorAll("[data-feedback-key]")];
  const scores = rows.map((row) => Number(row.dataset.selected) || 0).filter(Boolean);
  const complete = scores.length === FEEDBACK_CATEGORIES.length;
  const average = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;

  preview.classList.toggle("feedback-overall-preview--complete", complete);
  preview.querySelector("strong").innerHTML = average
    ? `${average} / 5 <span>${complete ? "ready to save" : "in progress"}</span>`
    : "- / 5";
}

function renderFeedbackRatingFields(existing) {
  const container = document.getElementById("feedbackRatingFields");
  if (!container) return;

  container.innerHTML = FEEDBACK_CATEGORIES.map((category) => {
    const current = feedbackScore(existing, category.key);
    const buttons = Array.from({ length: 5 }, (_, index) => {
      const value = index + 1;
      const lit = value <= current ? " lit" : "";
      return `
        <button type="button" class="${lit}" data-value="${value}" aria-label="${category.label} ${value} out of 5">
          &#9733;
        </button>`;
    }).join("");

    return `
      <div class="feedback-rating-row" data-feedback-key="${category.key}" data-selected="${current}">
        <div class="feedback-rating-row__label">
          <span>${escHtml(category.label)}</span>
          <strong>${current || "-"}/5</strong>
        </div>
        <p class="feedback-rating-row__hint">${escHtml(category.hint)}</p>
        <div class="star-rating feedback-star-rating" role="group" aria-label="${escHtml(category.label)} rating">
          ${buttons}
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".feedback-rating-row").forEach((row) => {
    const buttons = [...row.querySelectorAll("button")];
    const valueLabel = row.querySelector("strong");

    function paint(value) {
      buttons.forEach((button) => button.classList.toggle("lit", Number(button.dataset.value) <= value));
    }

    buttons.forEach((button) => {
      const value = Number(button.dataset.value);
      button.addEventListener("mouseover", () => paint(value));
      button.addEventListener("mouseleave", () => paint(Number(row.dataset.selected) || 0));
      button.addEventListener("click", () => {
        row.dataset.selected = value;
        valueLabel.textContent = `${value}/5`;
        paint(value);
        updateFeedbackOverallPreview();
      });
    });
  });

  updateFeedbackOverallPreview();
}

function readFeedbackScores() {
  const scores = {};
  const missing = [];

  FEEDBACK_CATEGORIES.forEach((category) => {
    const row = document.querySelector(`[data-feedback-key="${category.key}"]`);
    const value = row ? Number(row.dataset.selected) : 0;
    if (!value) missing.push(category.label);
    scores[category.key] = value;
  });

  return { scores, missing };
}

function openRatingModal(entry, role, choristerName, existing) {
  const roleLabel = FEEDBACK_ROLE_LABEL[role] || role;
  const parsedComment = parseFeedbackComment(existing ? existing.comment : "");

  document.getElementById("ratingModalContext").textContent =
    `${choristerName} - ${roleLabel} on ${formatDate(entry.service_date)}`;

  renderFeedbackRatingFields(existing);
  document.getElementById("ratingWentWell").value = parsedComment.wentWell;
  document.getElementById("ratingImproveNext").value = parsedComment.improveNext;
  document.getElementById("ratingComment").value = existing ? (existing.comment || "") : "";
  document.getElementById("btnClearRating").classList.toggle("d-none", !existing);

  _ratingModalState = { entry, role, choristerName, existing };
  new bootstrap.Modal(document.getElementById("ratingModal")).show();
}

async function saveRating() {
  const { entry, role, existing } = _ratingModalState;
  const { scores, missing } = readFeedbackScores();
  if (missing.length) {
    showToast(`Please rate: ${missing.join(", ")}.`, "warning");
    return;
  }

  const comment = composeFeedbackComment(
    document.getElementById("ratingWentWell").value,
    document.getElementById("ratingImproveNext").value
  );
  const chorister_id = existing ? existing.chorister_id : entry[`${role}_chorister_id`];
  const btn = document.getElementById("btnSaveRating");
  setLoading(btn, true);

  try {
    const saved = await api("POST", "/api/ratings", {
      roster_entry_id: entry.id,
      role,
      chorister_id,
      ...scores,
      comment,
    });
    ratings[`${entry.id}_${role}`] = saved;
    bootstrap.Modal.getInstance(document.getElementById("ratingModal")).hide();
    renderRosterTable();
    showToast("Feedback saved.", "success");
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
    showToast("Feedback removed.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

function renderFeedbackBars(record) {
  return `
    <div class="my-rating-breakdown">
      ${FEEDBACK_CATEGORIES.map((category) => {
        const score = feedbackScore(record, category.key);
        const width = Math.max(0, Math.min(100, (score / 5) * 100));
        return `
          <div class="my-rating-breakdown__row">
            <div>
              <span>${escHtml(category.label)}</span>
              <div class="feedback-score-bar"><i style="width:${width}%"></i></div>
            </div>
            <strong>${score}/5</strong>
          </div>`;
      }).join("")}
    </div>`;
}

function renderFocusArea(record) {
  const lowest = feedbackLowestCategory(record);
  if (!lowest) return "";
  return `
    <div class="feedback-focus-area">
      <span>Focus area</span>
      <strong>${escHtml(lowest.label)} (${lowest.score}/5)</strong>
    </div>`;
}

function feedbackMonthKey(record) {
  return record && record.service_date ? String(record.service_date).slice(0, 7) : "undated";
}

function feedbackMonthLabel(monthKey) {
  if (monthKey === "undated") return "Undated feedback";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function groupFeedbackByMonth(list) {
  const groups = {};
  (list || []).forEach((record) => {
    const key = feedbackMonthKey(record);
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  });

  Object.values(groups).forEach((records) => {
    records.sort((a, b) => String(a.service_date || "").localeCompare(String(b.service_date || "")));
  });

  return groups;
}

function renderMyRatingsCard(record) {
  return `
    <article class="my-rating-card">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <span class="my-rating-role">${escHtml(FEEDBACK_ROLE_LABEL[record.role] || record.role)}</span>
        <span class="my-rating-date">${record.service_date ? formatDate(record.service_date) : ""}</span>
      </div>
      <div class="my-rating-scoreline">
        <span class="feedback-overall-badge">${feedbackOverall(record)}/5 overall</span>
        <span class="my-rating-stars">${feedbackStars(feedbackOverall(record))}</span>
      </div>
      ${renderFeedbackBars(record)}
      ${renderFocusArea(record)}
      ${renderFeedbackCommentHtml(record.comment)}
    </article>`;
}

function renderMyRatingsMonth(list, selectedMonth) {
  const grid = document.getElementById("myRatingsGrid");
  const count = document.getElementById("myRatingsMonthCount");
  if (!grid || !count) return;

  const filtered = (list || []).filter((record) => feedbackMonthKey(record) === selectedMonth);
  count.textContent = `${filtered.length} rating${filtered.length === 1 ? "" : "s"}`;
  grid.innerHTML = filtered.length
    ? filtered.map(renderMyRatingsCard).join("")
    : '<p class="text-muted small mb-0">No feedback for this month.</p>';
}

async function openMyRatings() {
  const modal = new bootstrap.Modal(document.getElementById("myRatingsModal"));
  const body = document.getElementById("myRatingsBody");
  body.innerHTML = '<p class="text-muted small">Loading...</p>';
  modal.show();

  try {
    const list = await api("GET", "/api/ratings/me");
    if (!list.length) {
      body.innerHTML = '<p class="text-muted small mb-0">No feedback yet.</p>';
      return;
    }

    const groups = groupFeedbackByMonth(list);
    const months = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const selectedMonth = months[0];
    const total = list.length;

    body.innerHTML = `
      <div class="my-ratings-board">
        <div class="my-ratings-toolbar">
          <div>
            <span class="my-ratings-toolbar__eyebrow">Monthly view</span>
            <strong id="myRatingsMonthCount">${groups[selectedMonth].length} rating${groups[selectedMonth].length === 1 ? "" : "s"}</strong>
            <small>${total} total feedback record${total === 1 ? "" : "s"}</small>
          </div>
          <label class="my-ratings-month-filter">
            <span>Sort by month</span>
            <select class="form-select form-select-sm" id="myRatingsMonthFilter">
              ${months.map((monthKey) => `
                <option value="${monthKey}"${monthKey === selectedMonth ? " selected" : ""}>
                  ${escHtml(feedbackMonthLabel(monthKey))}
                </option>`).join("")}
            </select>
          </label>
        </div>
        <div class="my-ratings-grid" id="myRatingsGrid"></div>
      </div>`;

    renderMyRatingsMonth(list, selectedMonth);
    document.getElementById("myRatingsMonthFilter").addEventListener("change", (event) => {
      renderMyRatingsMonth(list, event.target.value);
    });
  } catch (error) {
    body.innerHTML = `<p class="text-danger small">${escHtml(error.message)}</p>`;
  }
}

function registerRatingsModalEventHandlers() {
  document.getElementById("btnSaveRating").addEventListener("click", saveRating);
  document.getElementById("btnClearRating").addEventListener("click", clearRating);
  document.getElementById("btnMyRatings").addEventListener("click", openMyRatings);
}
