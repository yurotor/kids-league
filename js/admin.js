/* עמוד ניהול: התחברות + ניהול משחק חי — התחלה, שערים (עם כובש), סיום.
   כל פעולה נשמרת אוטומטית לשרת (ובנפילה לאחור — לדפדפן בלבד). */

const ADMIN_SESSION_KEY = "krl_admin_session";
const ADMIN_PASS_KEY = "krl_admin_pass";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

const OG_VALUE = "__OG__"; // ערך ה-option של "גול עצמי" בבורר הכובשים

let adminResults = {};   // מצב מלא (שרת/קובץ + overlay) לעריכה
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

/* ===== רינדור משחק בודד לפי מצבו ===== */

function scorerSelect(g, side) {
  const team = side === "h" ? g.home : g.away;
  const players = playersFor(g.cls, team);
  const opts = players.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  return `
    <select class="scorer-select" data-side="${side}" aria-label="בחירת כובש — ${esc(team)}">
      ${opts}
      <option value="${OG_VALUE}">⚠️ ${OWN_GOAL_LABEL}</option>
    </select>`;
}

function goalChips(g, r) {
  if (!r.goals.length) return `<div class="pending" style="padding:4px 0">עדיין אין שערים</div>`;
  return r.goals.map((goal, idx) => {
    const team = goal.side === "h" ? g.home : g.away;
    const del = r.st === "L" ? `<button class="goal-del" data-act="delgoal" data-idx="${idx}" title="מחיקת שער">✖</button>` : "";
    return `<span class="goal-chip">⚽ ${esc(scorerName(goal))} <small>(${esc(team)})</small>${del}</span>`;
  }).join("");
}

function stateCellHtml(r) {
  if (!r) return `<span class="pending">טרם שוחק</span>`;
  if (r.st === "L") {
    return `${liveBadgeHtml(r)} ${scorePillHtml(r, " live")} ${gameClockHtml(r)}`;
  }
  return `${scorePillHtml(r)} <small class="ended-tag">הסתיים</small>`;
}

function actionsCellHtml(r) {
  if (!r) return `
    <button class="btn btn-primary btn-sm" data-act="start">▶ התחלת משחק</button>
    <div class="quick-result" title="הזנת תוצאה סופית ידנית — ללא כובשים וללא שעון">
      <span class="qr-field"><span class="qr-lbl">בית</span><input type="number" class="qr-input" data-side="h" min="0" max="99" value="0" inputmode="numeric" aria-label="שערי הבית"></span>
      <span class="qr-sep">:</span>
      <span class="qr-field"><span class="qr-lbl">חוץ</span><input type="number" class="qr-input" data-side="a" min="0" max="99" value="0" inputmode="numeric" aria-label="שערי החוץ"></span>
      <button class="btn btn-dark btn-sm" data-act="setResult">💾 שמירת תוצאה</button>
    </div>`;
  if (r.st === "L") {
    if (r.ph === "1")  return `<button class="btn btn-dark btn-sm" data-act="endH1">⏸ סיום מחצית ראשונה</button>`;
    if (r.ph === "HT") return `<button class="btn btn-primary btn-sm" data-act="startH2">▶ התחלת מחצית שנייה</button>`;
    return `<button class="btn btn-dark btn-sm" data-act="end">🏁 סיום משחק</button>`; // ph "2"
  }
  return `
    <button class="btn btn-ghost btn-sm" data-act="reopen">↩ חזרה לחי</button>
    <button class="btn btn-ghost btn-sm danger" data-act="reset">🗑 איפוס</button>`;
}

/* פאנל שערים למשחק חי: בורר כובש + הוספת גול לכל קבוצה, ורשימת השערים */
function livePanelHtml(g, r) {
  const sideBox = (side) => {
    const team = side === "h" ? g.home : g.away;
    return `
      <div class="goal-box">
        <div class="goal-box-team">${esc(team)}</div>
        <div class="goal-box-controls">
          ${scorerSelect(g, side)}
          <button class="btn btn-primary btn-sm" data-act="goal" data-side="${side}">⚽ גול</button>
        </div>
      </div>`;
  };
  return `
    <div class="live-panel">
      <div class="goal-boxes">${sideBox("h")}${sideBox("a")}</div>
      <div class="goal-list">${goalChips(g, r)}</div>
    </div>`;
}

function renderAdminSchedule() {
  const el = document.getElementById("adminSchedule");
  const cards = LEAGUE.rounds.map(round => {
    const games = round.games.filter(g => g.cls === adminCls);
    if (!games.length) return "";
    const rows = games.map(g => {
      const r = normResult(adminResults[g.id]);
      const panel = r && r.st === "L"
        ? `<tr class="panel-row" data-game="${g.id}"><td colspan="5">${livePanelHtml(g, r)}</td></tr>`
        : (r && r.goals.length
          ? `<tr class="panel-row" data-game="${g.id}"><td colspan="5"><div class="goal-list">${goalChips(g, r)}</div></td></tr>`
          : "");
      return `
      <tr data-game="${g.id}"${r && r.st === "L" ? ` class="live-row"` : ""}>
        <td>${esc(g.time)}</td>
        <td>${g.pitch}</td>
        <td class="teams-cell">${esc(g.home)}<span class="vs">נגד</span>${esc(g.away)}</td>
        <td style="white-space:nowrap">${stateCellHtml(r)}</td>
        <td class="actions-cell">${actionsCellHtml(r)}</td>
      </tr>${panel}`;
    }).join("");
    return `
      <div class="round-card">
        <div class="round-head">
          <span class="round-name">מחזור ${round.num}</span>
          <span class="round-meta">${esc(round.day)} | ${esc(round.date)} | ${esc(round.venue)}</span>
        </div>
        <table class="games admin-games">
          <thead><tr><th>שעה</th><th>מגרש</th><th>משחק</th><th>מצב</th><th>פעולות</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
  el.innerHTML = cards || `<div class="empty-state">אין משחקים לכיתה זו</div>`;
  updateGameClocks();   // immediate accuracy after render
  startClockTicker();   // tick live clocks every second
}

/* ===== פעולות על משחק ===== */

function applyAction(gameId, act, opts = {}) {
  const r = normResult(adminResults[gameId]);

  if (act === "start") {
    adminResults[gameId] = { st: "L", ph: "1", h: 0, a: 0, goals: [], startedAt: new Date().toISOString() };
    return "המשחק התחיל — מחצית ראשונה ⚽";
  }
  if (act === "setResult") {
    // תוצאה סופית ידנית — קובע משחק כמסתיים ללא כובשים וללא שעון
    const clamp = (v) => Number.isFinite(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0;
    const h = clamp(opts.h), a = clamp(opts.a);
    adminResults[gameId] = { st: "E", h, a, goals: [] };
    return `התוצאה נשמרה: ${h} - ${a} 🏁`;
  }
  if (!r) return null;

  if (act === "endH1") {
    if (r.st !== "L" || r.ph !== "1") return null;
    r.ph = "HT";
    r.h1EndedAt = new Date().toISOString();
    adminResults[gameId] = r;
    return "המחצית הראשונה הסתיימה — מנוחה ⏸";
  }
  if (act === "startH2") {
    if (r.st !== "L" || r.ph !== "HT") return null;
    r.ph = "2";
    r.h2StartedAt = new Date().toISOString();
    adminResults[gameId] = r;
    return "המחצית השנייה התחילה ▶";
  }

  if (act === "goal") {
    const player = opts.scorer === OG_VALUE ? null : opts.scorer;
    r.goals.push({ side: opts.side, player });
    r[opts.side]++;
    adminResults[gameId] = r;
    return player === null ? `נרשם ${OWN_GOAL_LABEL}` : `⚽ גול של ${player}!`;
  }
  if (act === "delgoal") {
    const [goal] = r.goals.splice(opts.idx, 1);
    if (goal) r[goal.side] = Math.max(0, r[goal.side] - 1);
    adminResults[gameId] = r;
    return "השער נמחק והתוצאה עודכנה";
  }
  if (act === "end") {
    // ניתן לסיים משחק רק לאחר שהתחילה המחצית השנייה
    if (r.st !== "L" || r.ph !== "2") return null;
    r.st = "E";
    r.ph = null;
    r.endedAt = new Date().toISOString();
    adminResults[gameId] = r;
    return `המשחק הסתיים בתוצאה ${r.h} - ${r.a} 🏁`;
  }
  if (act === "reopen") {
    // חזרה לחי — ממשיכים במחצית שנייה
    r.st = "L";
    r.ph = "2";
    r.endedAt = null;
    if (!r.startedAt) r.startedAt = new Date().toISOString();
    r.h2StartedAt = new Date().toISOString();
    adminResults[gameId] = r;
    return "המשחק נפתח מחדש לעריכה (מחצית שנייה)";
  }
  if (act === "reset") {
    if (!confirm("לאפס את המשחק? התוצאה והשערים יימחקו לצמיתות.")) return null;
    delete adminResults[gameId];
    return "המשחק אופס — טרם שוחק";
  }
  return null;
}

/* שמירה אוטומטית: שרת (Vercel + Upstash Redis) ← מקור האמת; בנפילה — דפדפן בלבד */
async function autoSave(successMsg) {
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
      showToast(`${successMsg} ✅`);
      return;
    }
    if (res.status === 401) {
      showToast("❌ סיסמה שגויה — השרת דחה את העדכון");
      return;
    }
  } catch (e) { /* אין API — מצב סטטי */ }

  saveOverlay(adminResults);
  showToast(`${successMsg} 💾 (נשמר בדפדפן זה בלבד — אין חיבור לשרת)`);
}

function bindAdminActions() {
  document.getElementById("adminSchedule").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const tr = btn.closest("tr[data-game]");
    if (!tr) return;
    const gameId = tr.dataset.game;
    const act = btn.dataset.act;

    const opts = { side: btn.dataset.side, idx: Number(btn.dataset.idx) };
    if (act === "goal") {
      const sel = tr.querySelector(`.scorer-select[data-side="${opts.side}"]`);
      opts.scorer = sel ? sel.value : OG_VALUE;
    }
    if (act === "setResult") {
      const hIn = tr.querySelector('.qr-input[data-side="h"]');
      const aIn = tr.querySelector('.qr-input[data-side="a"]');
      opts.h = hIn ? Number(hIn.value) : 0;
      opts.a = aIn ? Number(aIn.value) : 0;
    }

    const msg = applyAction(gameId, act, opts);
    if (msg === null) return; // פעולה בוטלה / לא רלוונטית
    renderAdminSchedule();
    await autoSave(msg);
  });
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

  bindAdminActions();
  if (isLoggedIn()) bootAdmin();
}

async function bootAdmin() {
  adminResults = await loadResults();

  adminCls = localStorage.getItem("krl_selected_class");
  if (!LEAGUE.classes.includes(adminCls)) adminCls = LEAGUE.classes[0];

  const pick = (c) => {
    adminCls = c;
    localStorage.setItem("krl_selected_class", c);
    renderClassChips(adminCls, pick);
    renderAdminSchedule();
  };
  renderClassChips(adminCls, pick);
  renderAdminSchedule();
}

initAdminPage();
