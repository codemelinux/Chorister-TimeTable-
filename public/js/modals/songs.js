// Developed by Benedict U.
// Modal feature module: songs library CRUD, assignment, and the home-page song card.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Shared song data and roster dropdown helpers
// ---------------------------------------------------------------------------

async function loadSongs() {
  songs = await api("GET", "/api/songs");
  populateSongSelects();
  renderSongsLibraries();
}

function populateSongSelects() {
  // On initial load there is no chorister selected, so show all matching categories.
  refreshSongDropdown("hymnSongSelect", ["hymn", "general"], null);
  refreshSongDropdown("praiseWorshipSongSelect", ["praise_worship", "general"], null);
  refreshSongDropdown("thanksgivingSongSelect", ["thanksgiving", "general"], null);
}

function refreshSongDropdown(selectId, categoryFilter, choristerId) {
  const el = document.getElementById(selectId);
  const currentVal = el.value;

  const visible = songs.filter((s) => {
    if (!categoryFilter.includes(s.category)) return false;
    if (!choristerId) return true;
    const isSubmitter = s.submitted_by_chorister_id === choristerId;
    const isAssigned = Array.isArray(s.assigned_choristers) &&
      s.assigned_choristers.some((a) => a.chorister_id === choristerId);
    return isSubmitter || isAssigned;
  });

  visible.sort((a, b) => {
    const countA = songStats.find((st) => st.song_id === a.id)?.count || 0;
    const countB = songStats.find((st) => st.song_id === b.id)?.count || 0;
    return countB - countA || a.title.localeCompare(b.title);
  });

  el.innerHTML = ['<option value="">-- Select song --</option>']
    .concat(visible.map((s) => {
      const stat = songStats.find((st) => st.song_id === s.id);
      const count = stat ? stat.count : 0;
      const label = count > 0 ? `${s.title}  (${count}x)` : s.title;
      return `<option value="${s.id}">${escHtml(label)}</option>`;
    }))
    .join("");

  if (currentVal && visible.find((s) => String(s.id) === currentVal)) {
    el.value = currentVal;
  } else if (currentVal) {
    el.value = "";
    const previewMap = {
      hymnSongSelect: "hymnSongLyrics",
      praiseWorshipSongSelect: "praiseWorshipSongLyrics",
      thanksgivingSongSelect: "thanksgivingSongLyrics",
    };
    const previewId = previewMap[selectId];
    if (previewId) {
      const preview = document.getElementById(previewId);
      if (preview) {
        preview.textContent = "";
        preview.style.display = "none";
      }
    }
  }
}

function bindChoristerSongFilter(choristerSelectId, songSelectId, categoryFilter) {
  document.getElementById(choristerSelectId).addEventListener("change", (e) => {
    const choristerId = parseInt(e.target.value, 10) || null;
    refreshSongDropdown(songSelectId, categoryFilter, choristerId);
  });
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

// ---------------------------------------------------------------------------
// Songs library modal and shared list rendering
// ---------------------------------------------------------------------------

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

function getSongsLibrarySource(query, sortMostSung) {
  let source = songs.map((s) => {
    const stat = songStats.find((st) => st.song_id === s.id);
    return { ...s, count: stat ? stat.count : 0 };
  });

  if (sortMostSung) {
    source = [...songStats].map((st) => {
      const song = songs.find((s) => s.id === st.song_id);
      return song ? { ...song, count: st.count } : null;
    }).filter(Boolean);

    const statIds = new Set(songStats.map((st) => st.song_id));
    songs.forEach((s) => {
      if (!statIds.has(s.id)) source.push({ ...s, count: 0 });
    });
  }

  if (query) {
    source = source.filter((s) =>
      s.title.toLowerCase().includes(query) || (s.lyrics && s.lyrics.toLowerCase().includes(query))
    );
  }

  return source;
}

function renderSongsLibraries() {
  renderSongsList();
}

async function syncSongToDrive(id, btn) {
  setLoading(btn, true);
  try {
    const updated = await api("POST", `/api/songs/${id}/sync-to-drive`);
    const idx = songs.findIndex((s) => s.id === id);
    if (idx !== -1) songs[idx] = updated;
    renderSongsLibraries();
    showToast("Synced to Google Drive.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

async function syncAllToDrive(btn) {
  setLoading(btn, true);
  try {
    const result = await api("POST", "/api/songs/sync-all-to-drive");
    await loadSongs();
    renderSongsLibraries();
    const errDetail = result.errors && result.errors.length ? ` Error: ${result.errors[0]}` : "";
    const msg = `Synced ${result.synced} song(s) to Drive.${result.failed ? ` ${result.failed} failed.${errDetail}` : ""}`;
    showToast(msg, result.failed ? "warning" : "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

function renderSongsList() {
  const list = document.getElementById("songsList");
  if (!list) return;

  const query = document.getElementById("songSearchInput").value.toLowerCase().trim();
  const source = getSongsLibrarySource(query, sortSongsByMostSung);
  list.innerHTML = "";
  if (source.length === 0) {
    list.innerHTML = '<li class="list-group-item text-muted">No songs found.</li>';
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
      lyricsToggle.addEventListener("click", () => openLyricsViewer(s));
      info.appendChild(lyricsToggle);
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

        if (!s.google_doc_url) {
          const syncBtn = document.createElement("button");
          syncBtn.className = "btn btn-sm btn-outline-secondary";
          syncBtn.title = "Sync lyrics to Google Drive";
          syncBtn.innerHTML = '<i class="bi bi-cloud-upload"></i>';
          syncBtn.addEventListener("click", () => syncSongToDrive(s.id, syncBtn));
          actions.appendChild(syncBtn);
        }
      }

      top.appendChild(actions);
    }

    item.appendChild(top);

    if (isAdmin) {
      const assigned = s.assigned_choristers || [];
      const assignSection = document.createElement("div");
      assignSection.className = "mt-2 pt-2 border-top d-flex flex-wrap gap-1 align-items-center";

      const assignLabel = document.createElement("span");
      assignLabel.className = "text-muted small me-1";
      assignLabel.textContent = "Assigned to:";
      assignSection.appendChild(assignLabel);

      if (assigned.length > 0) {
        assigned.forEach((a) => {
          const badge = document.createElement("span");
          badge.className = "badge bg-info-subtle text-info-emphasis d-inline-flex align-items-center gap-1";

          const nameSpan = document.createElement("span");
          nameSpan.textContent = a.chorister_name;
          badge.appendChild(nameSpan);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "btn-close ms-1";
          removeBtn.style.cssText = "font-size:0.5rem;filter:none;opacity:0.6;";
          removeBtn.title = "Remove assignment";
          removeBtn.addEventListener("click", () => unassignSong(s.id, a.chorister_id));
          badge.appendChild(removeBtn);

          assignSection.appendChild(badge);
        });
      } else {
        const none = document.createElement("span");
        none.className = "text-muted small fst-italic me-1";
        none.textContent = "none";
        assignSection.appendChild(none);
      }

      const assignSelect = document.createElement("select");
      assignSelect.className = "form-select form-select-sm d-inline w-auto";
      assignSelect.style.maxWidth = "170px";
      const unassigned = choristers.filter((c) => !assigned.some((a) => a.chorister_id === c.id));
      assignSelect.innerHTML = '<option value="">+ Assign chorister</option>' +
        unassigned.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`).join("");
      assignSection.appendChild(assignSelect);

      const assignBtn = document.createElement("button");
      assignBtn.className = "btn btn-sm btn-outline-info flex-shrink-0";
      assignBtn.title = "Assign selected chorister to this song";
      assignBtn.innerHTML = '<i class="bi bi-person-plus"></i>';
      assignBtn.addEventListener("click", () => {
        const choristerId = parseInt(assignSelect.value, 10) || null;
        assignSong(s.id, choristerId, assignBtn);
      });
      assignSection.appendChild(assignBtn);

      item.appendChild(assignSection);
    }

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
  if (!title) {
    showToast("Song title is required.", "warning");
    return;
  }

  const btn = document.getElementById("btnSaveSong");
  setLoading(btn, true);
  try {
    const payload = { title, category, lyrics, hyperlink };
    if (id) {
      await api("PUT", `/api/songs/${id}`, payload);
    } else {
      await api("POST", "/api/songs", payload);
    }
    resetSongForm();
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsLibraries();
    renderCategoryAnalytics();
    showToast(id ? "Song updated." : "Song added to library!", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function deleteSong(id, btn) {
  const confirmed = await confirmAction(
    "Delete this song from the library? Roster entries referencing it will be unlinked.",
    "Delete"
  );
  if (!confirmed) return;

  setLoading(btn, true);
  try {
    await api("DELETE", `/api/songs/${id}`);
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsLibraries();
    renderCategoryAnalytics();
    showToast("Song deleted.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

async function assignSong(songId, choristerId, btn) {
  if (!choristerId) {
    showToast("Select a chorister to assign.", "warning");
    return;
  }

  setLoading(btn, true);
  try {
    await api("POST", `/api/songs/${songId}/assign`, { chorister_id: choristerId });
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsLibraries();
    showToast("Song assigned to chorister.", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function unassignSong(songId, choristerId) {
  try {
    await api("DELETE", `/api/songs/${songId}/assign/${choristerId}`);
    await loadSongs();
    songStats = await api("GET", "/api/songs/stats");
    renderSongsLibraries();
    showToast("Assignment removed.", "success");
  } catch (error) {
    handleMutationError(error);
  }
}

function registerSongsModalEventHandlers() {
  document.getElementById("btnSongsLibrary").addEventListener("click", openSongsModal);
  document.getElementById("btnSyncAllToDrive").addEventListener("click", (e) => syncAllToDrive(e.currentTarget));
  document.getElementById("btnSaveSong").addEventListener("click", saveSong);
  document.getElementById("btnCancelSongEdit").addEventListener("click", resetSongForm);

  document.getElementById("songSearchInput").addEventListener("input", renderSongsList);
  document.getElementById("sortByMostSung").addEventListener("change", (e) => {
    sortSongsByMostSung = e.target.checked;
    renderSongsList();
  });

  // Roster modal cross-dependencies live here because the roster modal relies on song filtering.
  bindChoristerSongFilter("hymnChorister", "hymnSongSelect", ["hymn", "general"]);
  bindChoristerSongFilter("praiseWorshipChorister", "praiseWorshipSongSelect", ["praise_worship", "general"]);
  bindChoristerSongFilter("thanksgivingChorister", "thanksgivingSongSelect", ["thanksgiving", "general"]);

  bindSongSelectPreview("hymnSongSelect", "hymnSongLyrics");
  bindSongSelectPreview("praiseWorshipSongSelect", "praiseWorshipSongLyrics");
  bindSongSelectPreview("thanksgivingSongSelect", "thanksgivingSongLyrics");
}
