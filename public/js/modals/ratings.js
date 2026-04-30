// Developed by Benedict U.
// Modal feature module: performance ratings and self-service rating review.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Rating modal
// ---------------------------------------------------------------------------

function ratingButton(entry, role, choristerName) {
  const key = `${entry.id}_${role}`;
  const existing = ratings[key];
  const filledStars = "&#9733;".repeat(existing ? existing.rating : 0);
  const emptyStars = "&#9734;".repeat(existing ? 5 - existing.rating : 0);
  const btn = document.createElement("button");
  btn.className = "rating-btn";
  btn.title = existing ? `Rated ${existing.rating} stars - click to edit` : "Add rating";
  btn.innerHTML = existing
    ? `${filledStars}<span style="color:#ccc">${emptyStars}</span>`
    : "+";
  btn.style.display = "block";
  btn.style.marginTop = "0.25rem";
  btn.addEventListener("click", () => openRatingModal(entry, role, choristerName, existing || null));
  return btn;
}

let _ratingModalState = {};

function openRatingModal(entry, role, choristerName, existing) {
  const roleLabel = {
    hymn: "Hymn",
    praise_worship: "Praise Worship",
    thanksgiving: "Thanksgiving",
  }[role] || role;

  document.getElementById("ratingModalContext").textContent =
    `${choristerName} - ${roleLabel} on ${formatDate(entry.service_date)}`;

  const stars = document.getElementById("starRatingGroup");
  stars.innerHTML = "";
  const currentRating = existing ? existing.rating : 0;
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement("button");
    s.type = "button";
    s.innerHTML = "&#9733;";
    s.dataset.val = i;
    if (i <= currentRating) s.classList.add("lit");
    s.addEventListener("mouseover", () => {
      [...stars.querySelectorAll("button")].forEach((b) => b.classList.toggle("lit", +b.dataset.val <= i));
    });
    s.addEventListener("mouseleave", () => {
      const sel = +stars.dataset.selected || 0;
      [...stars.querySelectorAll("button")].forEach((b) => b.classList.toggle("lit", +b.dataset.val <= sel));
    });
    s.addEventListener("click", () => {
      stars.dataset.selected = i;
      [...stars.querySelectorAll("button")].forEach((b) => b.classList.toggle("lit", +b.dataset.val <= i));
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
  if (!ratingVal) {
    showToast("Please select a star rating.", "warning");
    return;
  }

  const comment = document.getElementById("ratingComment").value.trim() || null;
  const chorister_id = existing ? existing.chorister_id : entry[`${role}_chorister_id`];
  const btn = document.getElementById("btnSaveRating");
  setLoading(btn, true);
  try {
    const saved = await api("POST", "/api/ratings", {
      roster_entry_id: entry.id,
      role,
      chorister_id,
      rating: ratingVal,
      comment,
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
  body.innerHTML = '<p class="text-muted small">Loading...</p>';
  modal.show();
  try {
    const list = await api("GET", "/api/ratings/me");
    if (!list.length) {
      body.innerHTML = '<p class="text-muted small mb-0">No ratings yet.</p>';
      return;
    }

    const roleLabel = {
      hymn: "Hymn",
      praise_worship: "Praise Worship",
      thanksgiving: "Thanksgiving",
    };
    body.innerHTML = list.map((r) => `
      <div class="my-rating-card">
        <div class="d-flex justify-content-between align-items-start">
          <span class="my-rating-role">${escHtml(roleLabel[r.role] || r.role)}</span>
          <span class="my-rating-date">${r.service_date ? formatDate(r.service_date) : ""}</span>
        </div>
        <div class="my-rating-stars">${"&#9733;".repeat(r.rating)}${"&#9734;".repeat(5 - r.rating)}</div>
        ${r.comment ? `<div class="my-rating-comment"><i class="bi bi-chat-left-text me-1 text-muted"></i>${escHtml(r.comment)}</div>` : ""}
      </div>`).join("");
  } catch (error) {
    body.innerHTML = `<p class="text-danger small">${escHtml(error.message)}</p>`;
  }
}

function registerRatingsModalEventHandlers() {
  document.getElementById("btnSaveRating").addEventListener("click", saveRating);
  document.getElementById("btnClearRating").addEventListener("click", clearRating);
  document.getElementById("btnMyRatings").addEventListener("click", openMyRatings);
}
