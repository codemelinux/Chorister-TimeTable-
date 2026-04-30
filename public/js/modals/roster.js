// Developed by Benedict U.
// Modal feature module: add/edit/delete service dates in the roster.
// Depends on shared helpers/state from public/app.js and public/js/modals/songs.js.

// ---------------------------------------------------------------------------
// Roster entry modal
// ---------------------------------------------------------------------------

async function openRosterModal(entry = null) {
  if (!isAdmin) return;

  // Refresh song stats so the dropdown usage counts stay current.
  try {
    songStats = await api("GET", "/api/songs/stats");
  } catch (_) {}

  document.getElementById("rosterModalTitle").textContent = entry ? "Edit Service Date" : "Add Service Date";
  document.getElementById("rosterEntryId").value = entry ? entry.id : "";
  document.getElementById("serviceDate").value = entry ? entry.service_date : monthAlignedDate();

  const hymnChorId = entry?.hymn_chorister_id || null;
  const pwChorId = entry?.praise_worship_chorister_id || null;
  const thanksChorId = entry?.thanksgiving_chorister_id || null;

  document.getElementById("hymnChorister").value = hymnChorId || "";
  document.getElementById("hymnSongTitle").value = entry?.hymn_song_title || "";
  document.getElementById("hymnMusicalKey").value = entry?.hymn_musical_key || "";

  document.getElementById("praiseWorshipChorister").value = pwChorId || "";
  document.getElementById("praiseWorshipMusicalKey").value = entry?.praise_worship_musical_key || "";
  document.getElementById("praiseWorshipLoopBitrate").value = entry?.praise_worship_loop_bitrate || "";

  document.getElementById("thanksgivingChorister").value = thanksChorId || "";
  document.getElementById("thanksgivingMusicalKey").value = entry?.thanksgiving_musical_key || "";
  document.getElementById("thanksgivingLoopBitrate").value = entry?.thanksgiving_loop_bitrate || "";

  document.getElementById("serviceNotes").value = entry?.notes || "";

  refreshSongDropdown("hymnSongSelect", ["hymn", "general"], hymnChorId);
  refreshSongDropdown("praiseWorshipSongSelect", ["praise_worship", "general"], pwChorId);
  refreshSongDropdown("thanksgivingSongSelect", ["thanksgiving", "general"], thanksChorId);

  document.getElementById("hymnSongSelect").value = entry?.hymn_song_id || "";
  document.getElementById("praiseWorshipSongSelect").value = entry?.praise_worship_song_id || "";
  document.getElementById("thanksgivingSongSelect").value = entry?.thanksgiving_song_id || "";

  ["hymnSongLyrics", "praiseWorshipSongLyrics", "thanksgivingSongLyrics"].forEach((id) => {
    const el = document.getElementById(id);
    el.textContent = "";
    el.style.display = "none";
  });

  new bootstrap.Modal(document.getElementById("rosterModal")).show();
}

function monthAlignedDate() {
  const dt = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  return dt.toISOString().slice(0, 10);
}

async function saveRosterEntry() {
  const id = document.getElementById("rosterEntryId").value;
  const hymnSongId = parseInt(document.getElementById("hymnSongSelect").value, 10) || null;
  const praiseWorshipSongId = parseInt(document.getElementById("praiseWorshipSongSelect").value, 10) || null;
  const thanksgivingSongId = parseInt(document.getElementById("thanksgivingSongSelect").value, 10) || null;
  const payload = {
    service_date: document.getElementById("serviceDate").value,
    hymn_chorister_id: parseInt(document.getElementById("hymnChorister").value, 10) || null,
    hymn_song_id: hymnSongId,
    hymn_song_title: hymnSongId ? "" : document.getElementById("hymnSongTitle").value.trim(),
    hymn_musical_key: document.getElementById("hymnMusicalKey").value.trim(),
    praise_worship_chorister_id: parseInt(document.getElementById("praiseWorshipChorister").value, 10) || null,
    praise_worship_song_id: praiseWorshipSongId,
    praise_worship_musical_key: document.getElementById("praiseWorshipMusicalKey").value.trim(),
    praise_worship_loop_bitrate: document.getElementById("praiseWorshipLoopBitrate").value.trim(),
    thanksgiving_chorister_id: parseInt(document.getElementById("thanksgivingChorister").value, 10) || null,
    thanksgiving_song_id: thanksgivingSongId,
    thanksgiving_musical_key: document.getElementById("thanksgivingMusicalKey").value.trim(),
    thanksgiving_loop_bitrate: document.getElementById("thanksgivingLoopBitrate").value.trim(),
    notes: document.getElementById("serviceNotes").value.trim() || null,
  };
  if (!payload.service_date) {
    showToast("Service date is required.", "warning");
    return;
  }

  const btn = document.getElementById("btnSaveRoster");
  setLoading(btn, true);
  try {
    if (id) {
      await api("PUT", `/api/roster/${id}`, payload);
    } else {
      await api("POST", "/api/roster", payload);
    }
    bootstrap.Modal.getInstance(document.getElementById("rosterModal")).hide();
    await loadRoster();
    showToast("Roster entry saved.", "success");
  } catch (error) {
    handleMutationError(error);
  } finally {
    setLoading(btn, false);
  }
}

async function deleteRosterEntry(id, btn) {
  const confirmed = await confirmAction("Delete this service date from the monthly roster?");
  if (!confirmed) return;

  setLoading(btn, true);
  try {
    await api("DELETE", `/api/roster/${id}`);
    await loadRoster();
    showToast("Service date deleted.", "success");
  } catch (error) {
    handleMutationError(error);
    setLoading(btn, false);
  }
}

function registerRosterModalEventHandlers() {
  document.getElementById("btnAddRoster").addEventListener("click", () => openRosterModal());
  document.getElementById("btnSaveRoster").addEventListener("click", saveRosterEntry);
}
