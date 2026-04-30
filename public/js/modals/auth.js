// Developed by Benedict U.
// Modal feature module: admin login + chorister login.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Admin and chorister authentication flows
// ---------------------------------------------------------------------------

async function login() {
  const passwordInput = document.getElementById("adminPassword");
  const btn = document.getElementById("btnSubmitLogin");
  setLoading(btn, true);
  try {
    await api("POST", "/api/auth/login", { password: passwordInput.value });
    passwordInput.value = "";
    bootstrap.Modal.getInstance(document.getElementById("loginModal")).hide();
    await loadSession();
    await loadRoster();
    showToast("Logged in as admin.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

async function logout() {
  await api("POST", "/api/auth/logout", {});
  await loadSession();
  await loadRoster();
  showToast("Logged out.", "success");
}

async function openChoristerLoginModal() {
  // Refresh the list each time so newly enabled portal users appear immediately.
  try {
    const portalChoristers = await api("GET", "/api/choristers/portal");
    const sel = document.getElementById("choristerSelectLogin");
    sel.innerHTML = '<option value="">--- Select your name ---</option>' +
      portalChoristers.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`).join("");
  } catch (_) {
    // Leave the list empty if the request fails.
  }

  document.getElementById("choristerPinInput").value = "";
  new bootstrap.Modal(document.getElementById("choristerLoginModal")).show();
}

async function choristerLogin() {
  const chorister_id = parseInt(document.getElementById("choristerSelectLogin").value, 10);
  const pin = document.getElementById("choristerPinInput").value;
  if (!chorister_id) {
    showToast("Please select your name.", "warning");
    return;
  }
  if (!pin) {
    showToast("Please enter your PIN.", "warning");
    return;
  }

  const btn = document.getElementById("btnSubmitChoristerLogin");
  setLoading(btn, true);
  try {
    const result = await api("POST", "/api/auth/chorister-login", { chorister_id, pin });
    document.getElementById("choristerPinInput").value = "";
    bootstrap.Modal.getInstance(document.getElementById("choristerLoginModal")).hide();
    setChoristerMode(true, { chorister_id: result.chorister_id, name: result.name });
    showToast(`Welcome, ${result.name}!`, "success");
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    setLoading(btn, false);
  }
}

async function choristerLogout() {
  await api("POST", "/api/auth/chorister-logout", {});
  setChoristerMode(false, null);
  showToast("Signed out.", "success");
}

function registerAuthModalEventHandlers() {
  // Focus the first input when each auth modal opens.
  document.getElementById("loginModal").addEventListener("shown.bs.modal", () => {
    document.getElementById("adminPassword").focus();
  });
  document.getElementById("choristerLoginModal").addEventListener("shown.bs.modal", () => {
    document.getElementById("choristerPinInput").focus();
  });

  // Admin auth controls.
  document.getElementById("btnLogin").addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("loginModal")).show();
  });
  document.getElementById("btnSubmitLogin").addEventListener("click", login);
  document.getElementById("adminPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  document.getElementById("btnLogout").addEventListener("click", logout);

  // Chorister auth controls.
  document.getElementById("btnChoristerLogin").addEventListener("click", openChoristerLoginModal);
  document.getElementById("btnSubmitChoristerLogin").addEventListener("click", choristerLogin);
  document.getElementById("choristerPinInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") choristerLogin();
  });
  document.getElementById("btnChoristerLogout").addEventListener("click", choristerLogout);
}
