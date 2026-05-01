// Developed by Benedict U.
// Analytics page feature module: monthly chorister stats and range charts.
// Depends on shared helpers/state from public/app.js.

// ---------------------------------------------------------------------------
// Analytics page
// ---------------------------------------------------------------------------

function renderStatsList(stats, container) {
  if (!stats || stats.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No data for this period.</p>';
    return;
  }

  const dash = '<span style="color:#bbb;font-size:.85rem">-</span>';
  const badge = (count, bg, color, border) => count > 0
    ? `<span style="display:inline-block;min-width:26px;padding:.15rem .5rem;border-radius:999px;font-size:.8rem;font-weight:700;background:${bg};color:${color};border:1px solid ${border};text-align:center">${count}</span>`
    : dash;

  const rows = stats.map((s, i) => {
    const h = s.hymn_count || 0;
    const p = s.praise_worship_count || 0;
    const t = s.thanksgiving_count || 0;
    const total = s.total ?? (h + p + t);
    const isTop = i === 0;
    const rowBg = isTop ? "#edf7e4" : (i % 2 === 0 ? "#fff" : "#f9fdf7");
    const rankHtml = isTop
      ? '<i class="bi bi-star-fill" style="color:#c8a84b;font-size:.75rem;margin-right:5px"></i>'
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#eee;color:#888;font-size:.68rem;font-weight:700;margin-right:5px;flex-shrink:0">${i + 1}</span>`;

    return `<tr style="background:${rowBg}">
      <td style="padding:.45rem .7rem;border-bottom:1px solid #eef0eb;font-weight:${isTop ? "700" : "600"};color:#1c3a27;display:flex;align-items:center;gap:0">${rankHtml}${escHtml(s.name)}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center">${badge(h, "#fdf8e8", "#8a6c1a", "#f0d880")}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center">${badge(p, "#edf4e8", "#2a5a38", "#bdd4b4")}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center">${badge(t, "#fdf0ee", "#b84a3a", "#f5c9c5")}</td>
      <td style="padding:.45rem .5rem;border-bottom:1px solid #eef0eb;text-align:center"><span style="display:inline-block;min-width:28px;padding:.18rem .55rem;border-radius:999px;background:#1c3a27;color:#fff;font-size:.82rem;font-weight:800;text-align:center">${total}</span></td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div style="border-radius:10px;border:1px solid #d9d2c3;background:#fff;overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table style="width:100%;min-width:640px;border-collapse:collapse;table-layout:fixed;font-family:inherit">
        <colgroup>
          <col style="width:38%">
          <col style="width:15.5%"><col style="width:15.5%"><col style="width:15.5%">
          <col style="width:15.5%">
        </colgroup>
        <thead>
          <tr style="background:#1c3a27">
            <th style="padding:.55rem .7rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#a8c9b0;border:none;text-align:left">Chorister</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#c8a84b;border:none;text-align:center"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#c8a84b;margin-right:4px;vertical-align:middle;position:relative;top:-1px"></span>Hymn</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7ec8a0;border:none;text-align:center"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4a7c59;margin-right:4px;vertical-align:middle;position:relative;top:-1px"></span>Praise</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#f5a89e;border:none;text-align:center"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#e87b6e;margin-right:4px;vertical-align:middle;position:relative;top:-1px"></span>Thanks</th>
            <th style="padding:.55rem .5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#fff;border:none;text-align:center">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function setAnalyticsMonthPicker() {
  const picker = document.getElementById("analyticsMonthPicker");
  if (!picker) return;
  const m = String(analyticsMonth.getMonth() + 1).padStart(2, "0");
  picker.value = `${analyticsMonth.getFullYear()}-${m}`;
}

async function loadAnalyticsMonthStats() {
  setAnalyticsMonthPicker();
  const year = analyticsMonth.getFullYear();
  const month = analyticsMonth.getMonth() + 1;
  const container = document.getElementById("analyticsMonthOutput");
  if (!container) return;

  container.innerHTML = '<p class="text-muted small">Loading...</p>';
  try {
    const entries = await api("GET", `/api/roster?year=${year}&month=${month}`);
    const counts = {};
    entries.forEach((entry) => {
      [
        [entry.hymn_chorister_id, entry.hymn_chorister_name, "hymn"],
        [entry.praise_worship_chorister_id, entry.praise_worship_chorister_name, "praise_worship"],
        [entry.thanksgiving_chorister_id, entry.thanksgiving_chorister_name, "thanksgiving"],
      ].forEach(([id, name, role]) => {
        if (id && name) {
          if (!counts[id]) {
            counts[id] = { chorister_id: id, name, hymn_count: 0, praise_worship_count: 0, thanksgiving_count: 0, total: 0 };
          }
          counts[id][`${role}_count`] += 1;
          counts[id].total += 1;
        }
      });
    });
    const stats = Object.values(counts).sort((a, b) => b.total - a.total);
    renderStatsList(stats, container);
  } catch (_) {
    container.innerHTML = '<p class="text-muted small">Failed to load.</p>';
  }
}

function renderMonthlyStats() {
  const container = document.getElementById("analyticsMonthOutput");
  const counts = {};
  rosterEntries.forEach((entry) => {
    [
      [entry.hymn_chorister_id, entry.hymn_chorister_name, "hymn"],
      [entry.praise_worship_chorister_id, entry.praise_worship_chorister_name, "praise_worship"],
      [entry.thanksgiving_chorister_id, entry.thanksgiving_chorister_name, "thanksgiving"],
    ].forEach(([id, name, role]) => {
      if (id && name) {
        if (!counts[id]) {
          counts[id] = { chorister_id: id, name, hymn_count: 0, praise_worship_count: 0, thanksgiving_count: 0, total: 0 };
        }
        counts[id][`${role}_count`] += 1;
        counts[id].total += 1;
      }
    });
  });
  const stats = Object.values(counts).sort((a, b) => b.total - a.total);
  renderStatsList(stats, container);
  renderCategoryAnalytics();
}

function renderCategoryAnalytics() {
  renderOneCategoryCard("analyticsHymn", "hymn_count", "#c8a84b");
  renderOneCategoryCard("analyticsPraise", "praise_worship_count", "#4a7c59");
  renderOneCategoryCard("analyticsThanksgiving", "thanksgiving_count", "#e87b6e");
}

function renderOneCategoryCard(containerId, countKey, barColor) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const relevant = songStats.filter((s) => s[countKey] > 0).sort((a, b) => b[countKey] - a[countKey]);
  if (relevant.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No usage data yet.</p>';
    return;
  }

  const max = relevant[0][countKey];
  container.innerHTML = relevant.slice(0, 8).map((s, i) => {
    const pct = Math.round((s[countKey] / max) * 100);
    return `
      <div class="cat-stat-row ${i === 0 ? "cat-stat-top" : ""}">
        <div class="cat-stat-name" title="${escHtml(s.title)}">${i + 1}. ${escHtml(s.title)}</div>
        <div class="cat-stat-bar-wrap">
          <div class="cat-stat-bar" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <span class="cat-stat-count">${s[countKey]}x</span>
      </div>`;
  }).join("");
}

function renderRangeChart(stats, container) {
  if (!stats || stats.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No data for this period.</p>';
    return;
  }

  const cats = [
    { key: "hymn_count", label: "Hymn", color: "#c8a84b", grad: "#e8c96a" },
    { key: "praise_worship_count", label: "Praise Worship", color: "#4a7c59", grad: "#6aad84" },
    { key: "thanksgiving_count", label: "Thanksgiving", color: "#e87b6e", grad: "#f4a89e" },
  ];
  let activeFilter = "all";

  function buildChart(filter) {
    const activeCats = filter === "all" ? cats : cats.filter((c) => c.key === filter);
    const catMax = filter === "all"
      ? Math.max(...stats.map((s) => cats.reduce((a, c) => a + (s[c.key] || 0), 0)), 1)
      : Math.max(...stats.map((s) => s[activeCats[0].key] || 0), 1);

    const rows = stats.map((s, ri) => {
      const isTop = ri === 0;
      const raw = filter === "all"
        ? cats.reduce((a, c) => a + (s[c.key] || 0), 0)
        : s[activeCats[0].key] || 0;
      const barPct = Math.round((raw / catMax) * 100);
      const innerStyle = `height:100%;width:${barPct}%;display:flex;overflow:hidden;border-radius:0 3px 3px 0;transition:width .4s ease`;

      const segments = filter === "all"
        ? cats.map((c) => {
            const count = s[c.key] || 0;
            const segPct = raw > 0 ? Math.round((count / raw) * 100) : 0;
            return count > 0
              ? `<div title="${c.label}: ${count}" style="width:${segPct}%;background:linear-gradient(90deg,${c.color},${c.grad});height:100%;flex-shrink:0"></div>`
              : "";
          }).join("")
        : `<div style="width:100%;background:linear-gradient(90deg,${activeCats[0].color},${activeCats[0].grad});height:100%"></div>`;

      const nameBadge = isTop
        ? '<div style="font-size:.55rem;font-weight:900;letter-spacing:.08em;color:#c8a84b;text-transform:uppercase;line-height:1;margin-bottom:1px">Top</div>'
        : `<div style="font-size:.6rem;font-weight:700;color:#ccc;line-height:1;margin-bottom:1px">#${ri + 1}</div>`;
      const rowBg = isTop ? "linear-gradient(135deg,#f2fbec,#e6f5dc)" : (ri % 2 === 0 ? "#fff" : "#fafaf8");

      return `
        <div style="display:flex;align-items:center;gap:.4rem;padding:.3rem .45rem;border-radius:6px;margin-bottom:2px;background:${rowBg};border:1px solid ${isTop ? "#c5dfc9" : "transparent"}">
          <div style="width:95px;flex-shrink:0;padding-right:.4rem;border-right:1.5px solid ${isTop ? "#c5dfc9" : "#eee"}">
            ${nameBadge}
            <div style="font-size:.78rem;font-weight:${isTop ? 800 : 700};color:#1c3a27;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2" title="${escHtml(s.name)}">${escHtml(s.name)}</div>
          </div>
          <div style="flex:1;height:12px;background:#f0ece6;border-radius:0 4px 4px 0;border:1px solid #e8e2d8;overflow:hidden">
            <div style="${innerStyle}">${raw > 0 ? segments : ""}</div>
          </div>
          <span style="min-width:28px;font-size:.72rem;font-weight:800;color:${isTop ? "#1c3a27" : "#555"};text-align:right;flex-shrink:0">${raw > 0 ? `${barPct}%` : "-"}</span>
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1c3a27;color:#fff;font-size:.68rem;font-weight:900;flex-shrink:0;${isTop ? "box-shadow:0 0 0 2px #c8a84b80" : ""}">
            ${cats.reduce((a, c) => a + (s[c.key] || 0), 0)}
          </span>
        </div>`;
    }).join("");

    const axis = `
      <div style="display:flex;align-items:flex-start;gap:.4rem;margin-top:.2rem;padding:0 .45rem">
        <div style="width:95px;flex-shrink:0;padding-right:.4rem;border-right:1.5px solid #eee"></div>
        <div style="flex:1;position:relative;border-top:1.5px solid #d8d0c4;height:14px">
          ${[0, 25, 50, 75, 100].map((v) => `<span style="position:absolute;left:${v}%;transform:translateX(-50%);font-size:.6rem;color:#bbb;font-weight:700;top:2px">${v}%</span>`).join("")}
        </div>
        <span style="width:22px;flex-shrink:0"></span><span style="width:22px;flex-shrink:0"></span>
      </div>`;

    return `<div>${rows}</div>${axis}`;
  }

  const togBtnStyle = (active) =>
    "display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .55rem;border-radius:999px;font-size:.72rem;font-weight:700;cursor:pointer;border:1.5px solid;transition:all .15s;" +
    (active ? "background:#1c3a27;color:#fff;border-color:#1c3a27;" : "background:#fff;color:#555;border-color:#ddd;");

  const wrap = document.createElement("div");
  wrap.style.cssText = "border:1.5px solid #d4cfc7;border-radius:10px;padding:.55rem .65rem .35rem;background:#fff;max-width:680px";

  const toggleBar = document.createElement("div");
  toggleBar.style.cssText = "display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.55rem;padding-bottom:.45rem;border-bottom:1px solid #f0ece6";
  toggleBar.innerHTML = `
    <button data-f="all" style="${togBtnStyle(true)}"><span style="width:10px;height:10px;border-radius:2px;background:linear-gradient(90deg,#c8a84b,#e87b6e);display:inline-block"></span>All</button>
    <button data-f="hymn_count" style="${togBtnStyle(false)}"><span style="width:10px;height:10px;border-radius:2px;background:#c8a84b;display:inline-block"></span>Hymn</button>
    <button data-f="praise_worship_count" style="${togBtnStyle(false)}"><span style="width:10px;height:10px;border-radius:2px;background:#4a7c59;display:inline-block"></span>Praise</button>
    <button data-f="thanksgiving_count" style="${togBtnStyle(false)}"><span style="width:10px;height:10px;border-radius:2px;background:#e87b6e;display:inline-block"></span>Thanks</button>
    <span style="margin-left:auto;font-size:.65rem;color:#aaa;font-weight:600;align-self:center">Count -></span>`;

  const chartArea = document.createElement("div");
  chartArea.innerHTML = buildChart("all");

  wrap.appendChild(toggleBar);
  wrap.appendChild(chartArea);
  container.innerHTML = "";
  container.appendChild(wrap);

  toggleBar.querySelectorAll("[data-f]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.f;
      toggleBar.querySelectorAll("[data-f]").forEach((b) => {
        const on = b.dataset.f === activeFilter;
        b.style.background = on ? "#1c3a27" : "#fff";
        b.style.color = on ? "#fff" : "#555";
        b.style.borderColor = on ? "#1c3a27" : "#ddd";
      });
      chartArea.innerHTML = buildChart(activeFilter);
    });
  });
}

async function loadRangeStats() {
  const from = document.getElementById("analyticsFrom").value;
  const to = document.getElementById("analyticsTo").value;
  const container = document.getElementById("analyticsRangeOutput");
  if (!from || !to) {
    showToast("Select both From and To months.", "warning");
    return;
  }
  if (from > to) {
    showToast("From month must be before To month.", "warning");
    return;
  }

  const btn = document.getElementById("btnShowStats");
  setLoading(btn, true);
  container.innerHTML = '<p class="text-muted small">Loading...</p>';
  try {
    const stats = await api("GET", `/api/analytics?from=${from}&to=${to}`);
    renderRangeChart(stats, container);
  } catch (error) {
    showToast(error.message, "danger");
    container.innerHTML = "";
  } finally {
    setLoading(btn, false);
  }
}

function registerAnalyticsModalEventHandlers() {
  document.getElementById("btnAnalytics").addEventListener("click", () => {
    setActivePage("analytics");
  });
  document.getElementById("btnAnalyticsBackHome").addEventListener("click", () => {
    setActivePage("home", { syncAnalyticsMonth: false });
  });
  document.getElementById("btnAnalyticsPrevMonth").addEventListener("click", () => {
    analyticsMonth = new Date(analyticsMonth.getFullYear(), analyticsMonth.getMonth() - 1, 1);
    loadAnalyticsMonthStats();
  });
  document.getElementById("btnAnalyticsNextMonth").addEventListener("click", () => {
    analyticsMonth = new Date(analyticsMonth.getFullYear(), analyticsMonth.getMonth() + 1, 1);
    loadAnalyticsMonthStats();
  });
  document.getElementById("analyticsMonthPicker").addEventListener("change", (e) => {
    const [y, m] = e.target.value.split("-").map(Number);
    analyticsMonth = new Date(y, m - 1, 1);
    loadAnalyticsMonthStats();
  });
  document.getElementById("btnShowStats").addEventListener("click", loadRangeStats);
}
