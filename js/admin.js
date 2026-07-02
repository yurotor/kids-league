/* עמוד ניהול: התחברות, עריכת תוצאות, שמירה מקומית והורדת results.json */

const ADMIN_SESSION_KEY = "krl_admin_session";
const ADMIN_PASS_KEY = "krl_admin_pass";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

let adminResults = {};   // מצב מלא (קובץ + overlay) לעריכה
let adminCls = null;

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function isLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

function showView() {
  document.getElementById("loginView").style.display = isLoggedIn() ? "none" : "block";
  document.getElementById("adminView").style.display = isLoggedIn() ? "block" : "none";
}

function renderAdminSchedule() {
  const el = document.getElementById("adminSchedule");
  const cards = LEAGUE.rounds.map(round => {
    const games = round.games.filter(g => g.cls === adminCls);
    if (!games.length) return "";
    const rows = games.map(g => {
      const r = adminResults[g.id];
      const h = r && r.h !== null && r.h !== undefined ? r.h : "";
      const a = r && r.a !== null && r.a !== undefined ? r.a : "";
      return `
      <tr data-game="${g.id}">
        <td>${esc(g.time)}</td>
        <td>${g.pitch}</td>
        <td class="teams-cell">${esc(g.home)}<span class="vs">נגד</span>${esc(g.away)}</td>
        <td style="white-space:nowrap">
          <input class="score-input" type="number" min="0" inputmode="numeric" data-side="h" value="${h}" aria-label="תוצאת ${esc(g.home)}">
          <span class="score-sep">:</span>
          <input class="score-input" type="number" min="0" inputmode="numeric" data-side="a" value="${a}" aria-label="תוצאת ${esc(g.away)}">
        </td>
        <td><button class="btn btn-ghost btn-sm clear-btn">ניקוי</button></td>
      </tr>`;
    }).join("");
    return `
      <div class="round-card">
        <div class="round-head">
          <span class="round-name">מחזור ${round.num}</span>
          <span class="round-meta">${esc(round.day)} | ${esc(round.date)} | ${esc(round.venue)}</span>
        </div>
        <table class="games">
          <thead><tr><th>שעה</th><th>מגרש</th><th>משחק</th><th>תוצאה</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
  el.innerHTML = cards || `<div class="empty-state">אין משחקים לכיתה זו</div>`;

  el.querySelectorAll(".clear-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      tr.querySelectorAll(".score-input").forEach(i => i.value = "");
    });
  });
}

/* איסוף הקלטים מהמסך אל adminResults (רק לכיתה המוצגת) */
function collectInputs() {
  document.querySelectorAll("#adminSchedule tr[data-game]").forEach(tr => {
    const id = tr.dataset.game;
    const hEl = tr.querySelector('input[data-side="h"]');
    const aEl = tr.querySelector('input[data-side="a"]');
    const h = hEl.value.trim(), a = aEl.value.trim();
    if (h === "" || a === "") {
      delete adminResults[id];
    } else {
      adminResults[id] = { h: Math.max(0, parseInt(h, 10) || 0), a: Math.max(0, parseInt(a, 10) || 0) };
    }
  });
}

async function saveResults() {
  collectInputs();

  // ניסיון שמירה לשרת (Vercel + Upstash Redis) — מקור האמת לכל הגולשים
  try {
    const res = await fetch("api/results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": sessionStorage.getItem(ADMIN_PASS_KEY) || ""
      },
      body: JSON.stringify(adminResults)
    });
    if (res.ok) {
      saveOverlay({}); // השרת עודכן — אין צורך ב-overlay מקומי
      showToast("✅ התוצאות נשמרו בשרת ומוצגות לכל הגולשים");
      return;
    }
    if (res.status === 401) {
      showToast("❌ סיסמה שגויה — השרת דחה את העדכון");
      return;
    }
  } catch (e) { /* אין API — מצב סטטי */ }

  // נפילה לאחור: שמירה מקומית בדפדפן בלבד (כשאין שרת API זמין)
  saveOverlay(adminResults);
  showToast("💾 אין חיבור לשרת — נשמר בדפדפן זה בלבד");
}

async function initAdminPage() {
  showView();

  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value;
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      sessionStorage.setItem(ADMIN_PASS_KEY, p); // נשלחת לשרת לאימות בכל שמירה
      document.getElementById("loginError").textContent = "";
      showView();
      bootAdmin();
    } else {
      document.getElementById("loginError").textContent = "שם משתמש או סיסמה שגויים";
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_PASS_KEY);
    showView();
  });

  document.getElementById("saveBtn").addEventListener("click", saveResults);

  if (isLoggedIn()) bootAdmin();
}

async function bootAdmin() {
  adminResults = await loadResults();

  adminCls = localStorage.getItem("krl_selected_class");
  if (!LEAGUE.classes.includes(adminCls)) adminCls = LEAGUE.classes[0];

  const pick = (c) => {
    collectInputs(); // לא לאבד הקלדות בעת מעבר כיתה
    adminCls = c;
    localStorage.setItem("krl_selected_class", c);
    renderClassChips(adminCls, pick);
    renderAdminSchedule();
  };
  renderClassChips(adminCls, pick);
  renderAdminSchedule();
}

initAdminPage();
