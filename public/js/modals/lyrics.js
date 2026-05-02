// Developed by Benedict U.
// Modal feature module: monthly lyrics catalogue + lyrics viewer.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Lyrics viewer modal and monthly lyrics catalogue
// ---------------------------------------------------------------------------

function openLyricsViewer(song) {
  const categoryLabels = {
    hymn: "Hymn",
    praise_worship: "Praise Worship",
    thanksgiving: "Thanksgiving",
    general: "General",
  };
  const categoryClasses = {
    hymn: "cat-hymn",
    praise_worship: "cat-praise",
    thanksgiving: "cat-thanks",
    general: "cat-general",
  };

  document.getElementById("lyricsViewerTitle").textContent = song.title;

  const catBadge = document.getElementById("lyricsViewerCategory");
  catBadge.textContent = categoryLabels[song.category] || song.category;
  catBadge.className = `badge song-cat-badge ${categoryClasses[song.category] || ""}`;

  document.getElementById("lyricsViewerBody").textContent = song.lyrics || "(No lyrics stored)";

  const linksEl = document.getElementById("lyricsViewerLinks");
  linksEl.innerHTML = "";
  if (song.hyperlink) {
    const a = document.createElement("a");
    a.href = song.hyperlink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "btn btn-sm btn-outline-secondary";
    a.innerHTML = '<i class="bi bi-link-45deg me-1"></i>External link';
    linksEl.appendChild(a);
  }
  if (song.google_doc_url) {
    const a = document.createElement("a");
    a.href = song.google_doc_url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "btn btn-sm btn-outline-success";
    a.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>View in Google Docs';
    linksEl.appendChild(a);
  }

  new bootstrap.Modal(document.getElementById("lyricsViewerModal")).show();
}

async function openLyricsModal() {
  syncLyricsMonthToSelectedMonth("lyricsMonthPicker");

  resetAllSongsCatalogueControls({
    searchId: "allSongsSearch",
    filterContainerId: "allSongsCatFilter",
  });

  renderAllSongsCatalogue({
    containerId: "allSongsCatalogue",
    searchId: "allSongsSearch",
    filterContainerId: "allSongsCatFilter",
  });
  new bootstrap.Modal(document.getElementById("lyricsModal")).show();
  await loadLyricsByMonth();
}

function formatSelectedMonthValue() {
  const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
  return `${selectedMonth.getFullYear()}-${month}`;
}

function syncLyricsMonthToSelectedMonth(pickerId) {
  const picker = document.getElementById(pickerId);
  if (picker) picker.value = formatSelectedMonthValue();
}

function splitSongsByCategory(monthSongs) {
  const categories = { hymn: [], praise_worship: [], thanksgiving: [], general: [] };
  monthSongs.forEach((song) => {
    const category = song.category in categories ? song.category : "general";
    categories[category].push(song);
  });

  ["hymn", "praise_worship", "thanksgiving"].forEach((category) => {
    categories[category] = [...categories[category], ...categories.general];
  });

  return categories;
}

function renderMonthlyLyricsColumns(columnIds, monthSongs) {
  const categories = splitSongsByCategory(monthSongs);
  renderLyricsColumn(columnIds.hymn, categories.hymn);
  renderLyricsColumn(columnIds.praise, categories.praise_worship);
  renderLyricsColumn(columnIds.thanksgiving, categories.thanksgiving);
}

function resetAllSongsCatalogueControls({ searchId, filterContainerId }) {
  const searchEl = document.getElementById(searchId);
  if (searchEl) searchEl.value = "";

  const filterContainer = document.getElementById(filterContainerId);
  if (!filterContainer) return;

  filterContainer.querySelectorAll(".all-songs-filter-btn").forEach((btn) => btn.classList.remove("active"));
  const allBtn = filterContainer.querySelector(".all-songs-filter-btn[data-cat='all']");
  if (allBtn) allBtn.classList.add("active");
}

function renderAllSongsCatalogue({
  containerId = "allSongsCatalogue",
  searchId = "allSongsSearch",
  filterContainerId = "allSongsCatFilter",
} = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!songs || songs.length === 0) {
    container.innerHTML = '<p class="text-muted small">No songs in the library yet.</p>';
    return;
  }

  const categoryLabels = {
    hymn: "Hymn",
    praise_worship: "Praise Worship",
    thanksgiving: "Thanksgiving",
    general: "General",
  };
  const categoryClasses = {
    hymn: "cat-hymn",
    praise_worship: "cat-praise",
    thanksgiving: "cat-thanks",
    general: "cat-general",
  };

  const filterContainer = document.getElementById(filterContainerId);
  const activeCat = filterContainer?.querySelector(".all-songs-filter-btn.active")?.dataset.cat || "all";
  const query = (document.getElementById(searchId)?.value || "").toLowerCase().trim();

  let sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));
  if (activeCat !== "all") sorted = sorted.filter((s) => s.category === activeCat);
  if (query) {
    sorted = sorted.filter((s) =>
      s.title.toLowerCase().includes(query) ||
      (s.submitted_by_chorister_name && s.submitted_by_chorister_name.toLowerCase().includes(query))
    );
  }

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

    const meta = document.createElement("div");
    meta.className = "all-song-card__meta";

    const catBadge = document.createElement("span");
    catBadge.className = `badge song-cat-badge ${categoryClasses[s.category] || ""}`;
    catBadge.textContent = categoryLabels[s.category] || s.category;
    meta.appendChild(catBadge);

    if (s.submitted_by_chorister_name) {
      const chorBadge = document.createElement("span");
      chorBadge.className = "badge bg-light text-secondary border";
      chorBadge.style.fontSize = "0.7rem";
      chorBadge.innerHTML = `<i class="bi bi-person-fill me-1"></i>${escHtml(s.submitted_by_chorister_name)}`;
      meta.appendChild(chorBadge);
    }

    if (s.lyrics) {
      const showBtn = document.createElement("button");
      showBtn.className = "btn btn-sm btn-outline-secondary";
      showBtn.style.fontSize = "0.72rem";
      showBtn.innerHTML = '<i class="bi bi-eye me-1"></i>Show lyrics';
      showBtn.addEventListener("click", () => openLyricsViewer(s));
      meta.appendChild(showBtn);
    }

    if (s.google_doc_url) {
      const docLink = document.createElement("a");
      docLink.href = s.google_doc_url;
      docLink.target = "_blank";
      docLink.rel = "noopener noreferrer";
      docLink.className = "btn btn-sm btn-outline-success";
      docLink.style.fontSize = "0.72rem";
      docLink.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>Google Docs';
      meta.appendChild(docLink);
    }

    card.appendChild(meta);
    container.appendChild(card);
  });
}

async function loadLyricsByMonth() {
  const picker = document.getElementById("lyricsMonthPicker");
  if (!picker.value) {
    showToast("Please select a month.", "warning");
    return;
  }

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

async function loadHomeLyricsByMonth() {
  const picker = document.getElementById("homeLyricsMonthPicker");
  if (!picker || !picker.value) {
    showToast("Please select a month.", "warning");
    return;
  }

  const [year, month] = picker.value.split("-").map(Number);
  const btn = document.getElementById("btnLoadHomeLyrics");
  setLoading(btn, true);
  try {
    const lyricsData = await api("GET", `/api/songs/monthly?year=${year}&month=${month}`);
    renderHomeLyricsCatalogue(lyricsData);
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

function renderLyricsModal(monthSongs) {
  renderMonthlyLyricsColumns(
    {
      hymn: "lyricsHymn",
      praise: "lyricsPraise",
      thanksgiving: "lyricsThanksgiving",
    },
    monthSongs
  );
}

function renderHomeLyricsCatalogue(monthSongs) {
  renderMonthlyLyricsColumns(
    {
      hymn: "homeLyricsHymn",
      praise: "homeLyricsPraise",
      thanksgiving: "homeLyricsThanksgiving",
    },
    monthSongs
  );
}

async function syncHomeLyricsMonthToSelectedMonth() {
  const picker = document.getElementById("homeLyricsMonthPicker");
  if (!picker) return;

  syncLyricsMonthToSelectedMonth("homeLyricsMonthPicker");
  renderAllSongsCatalogue({
    containerId: "homeAllSongsCatalogue",
    searchId: "homeAllSongsSearch",
    filterContainerId: "homeAllSongsCatFilter",
  });
  await loadHomeLyricsByMonth();
}

function renderLyricsColumn(containerId, categorySongs) {
  const container = document.getElementById(containerId);
  if (!categorySongs || categorySongs.length === 0) {
    container.innerHTML = '<p class="text-muted small">No songs used this month.</p>';
    return;
  }

  container.innerHTML = "";
  categorySongs.forEach((s) => {
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
      a.href = s.hyperlink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "lyrics-link";
      a.innerHTML = '<i class="bi bi-link-45deg me-1"></i>Link';
      links.appendChild(a);
    }
    if (s.google_doc_url) {
      const a = document.createElement("a");
      a.href = s.google_doc_url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "lyrics-link lyrics-link--gdoc";
      a.innerHTML = '<i class="bi bi-file-earmark-text me-1"></i>Google Doc';
      links.appendChild(a);
    }
    if (links.children.length) card.appendChild(links);

    if (s.lyrics) {
      const toggle = document.createElement("button");
      toggle.className = "btn btn-link btn-sm p-0 lyrics-toggle";
      toggle.textContent = "Show lyrics v";

      const lyricsBlock = document.createElement("pre");
      lyricsBlock.className = "lyrics-block";
      lyricsBlock.style.display = "none";
      lyricsBlock.textContent = s.lyrics;

      toggle.addEventListener("click", () => {
        const shown = lyricsBlock.style.display !== "none";
        lyricsBlock.style.display = shown ? "none" : "block";
        toggle.textContent = shown ? "Show lyrics v" : "Hide lyrics ^";
      });

      card.appendChild(toggle);
      card.appendChild(lyricsBlock);
    }

    container.appendChild(card);
  });
}

function registerLyricsModalEventHandlers() {
  document.getElementById("btnViewLyrics").addEventListener("click", openLyricsModal);
  document.getElementById("btnLoadLyrics").addEventListener("click", loadLyricsByMonth);
  document.getElementById("btnLoadHomeLyrics")?.addEventListener("click", loadHomeLyricsByMonth);

  document.getElementById("allSongsSearch").addEventListener("input", () => {
    renderAllSongsCatalogue({
      containerId: "allSongsCatalogue",
      searchId: "allSongsSearch",
      filterContainerId: "allSongsCatFilter",
    });
  });
  document.getElementById("allSongsCatFilter").addEventListener("click", (e) => {
    const btn = e.target.closest(".all-songs-filter-btn");
    if (!btn) return;
    e.currentTarget.querySelectorAll(".all-songs-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderAllSongsCatalogue({
      containerId: "allSongsCatalogue",
      searchId: "allSongsSearch",
      filterContainerId: "allSongsCatFilter",
    });
  });

  document.getElementById("homeAllSongsSearch")?.addEventListener("input", () => {
    renderAllSongsCatalogue({
      containerId: "homeAllSongsCatalogue",
      searchId: "homeAllSongsSearch",
      filterContainerId: "homeAllSongsCatFilter",
    });
  });
  document.getElementById("homeAllSongsCatFilter")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".all-songs-filter-btn");
    if (!btn) return;
    e.currentTarget.querySelectorAll(".all-songs-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderAllSongsCatalogue({
      containerId: "homeAllSongsCatalogue",
      searchId: "homeAllSongsSearch",
      filterContainerId: "homeAllSongsCatFilter",
    });
  });
}
