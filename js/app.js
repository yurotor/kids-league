/* לוגיקה משותפת: טעינת תוצאות, חישוב טבלאות, רינדור לוח משחקים */

const RESULTS_KEY = "krl_results_overlay";

/* מקור התוצאות:
   1) /api/results — פונקציית שרת + Upstash Redis (בפריסה ב-Vercel). זה מקור האמת.
   2) נפילה לאחור (אתר סטטי בלבד): data/results.json + עדכונים מקומיים ב-localStorage. */
async function loadResults() {
  try {
    const res = await fetch("api/results", { cache: "no-store" });
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await res.json();
    }
  } catch (e) { /* אין API — מצב סטטי */ }

  let fileResults = {};
  try {
    const res = await fetch("data/results.json", { cache: "no-store" });
    if (res.ok) fileResults = await res.json();
  } catch (e) { /* צפייה מקומית ללא שרת — נמשיך עם ה-overlay בלבד */ }

  let overlay = {};
  try { overlay = JSON.parse(localStorage.getItem(RESULTS_KEY) || "{}"); } catch (e) {}

  return { ...fileResults, ...overlay };
}

function saveOverlay(overlay) {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(overlay));
}

function getOverlay() {
  try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || "{}"); } catch (e) { return {}; }
}

function allGames() {
  return LEAGUE.rounds.flatMap(r => r.games.map(g => ({ ...g, round: r.num, date: r.date, day: r.day, venue: r.venue })));
}

/* ===== מצב משחק ושערים =====
   מבנה תוצאה: { st: "L"(חי) | "E"(הסתיים), h, a, goals: [{side:"h"|"a", player:"שם"|null}], startedAt }
   player === null פירושו גול עצמי. תוצאה ישנה {h,a} בלבד נחשבת כמשחק שהסתיים. */

function normResult(r) {
  if (!r || typeof r.h !== "number" || typeof r.a !== "number") return null;
  return {
    st: r.st === "L" ? "L" : "E",
    h: r.h, a: r.a,
    goals: Array.isArray(r.goals) ? r.goals : [],
    startedAt: r.startedAt || null
  };
}

const OWN_GOAL_LABEL = "גול עצמי";

function scorerName(goal) {
  return goal.player === null || goal.player === undefined ? OWN_GOAL_LABEL : goal.player;
}

/* שמות הכובשים של צד אחד, מקובצים עם מונה: "איתי כהן ×2" */
function sideScorers(res, side) {
  const counts = new Map();
  res.goals.filter(g => g.side === side).forEach(g => {
    const n = scorerName(g);
    counts.set(n, (counts.get(n) || 0) + 1);
  });
  return [...counts.entries()].map(([n, c]) => c > 1 ? `${n} ×${c}` : n);
}

function scorersHtml(res) {
  if (!res || !res.goals.length) return "";
  const part = (side) => {
    const list = sideScorers(res, side);
    return list.length ? `<span class="scorers-side">⚽ ${list.map(esc).join(", ")}</span>` : "";
  };
  const h = part("h"), a = part("a");
  if (!h && !a) return "";
  return `<div class="scorers">${h}${h && a ? `<span class="scorers-sep"></span>` : ""}${a}</div>`;
}

function fmtStartTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function liveGames(results) {
  return allGames().filter(g => {
    const r = normResult(results[g.id]);
    return r && r.st === "L";
  });
}

/* ===== מלך השערים =====
   סיכום שערים לפי שחקן (גול עצמי לא נספר). clsFilter=null ← רשימה גלובלית */
function computeScorers(results, clsFilter = null) {
  const tally = {};
  allGames().forEach(g => {
    if (clsFilter && g.cls !== clsFilter) return;
    const r = normResult(results[g.id]);
    if (!r) return;
    r.goals.forEach(goal => {
      if (goal.player === null || goal.player === undefined) return;
      const team = goal.side === "h" ? g.home : g.away;
      const key = `${g.cls}|${team}|${goal.player}`;
      tally[key] = tally[key] || { player: goal.player, team, cls: g.cls, goals: 0 };
      tally[key].goals++;
    });
  });
  return Object.values(tally).sort((x, y) =>
    y.goals - x.goals || x.player.localeCompare(y.player, "he"));
}

/* חישוב טבלת בית: 3 נק' ניצחון, 1 תיקו. שובר שוויון: נקודות, הפרש, זכות, שם */
function computeStandings(cls, teams, results) {
  const rows = {};
  teams.forEach(t => rows[t] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 });

  allGames().forEach(g => {
    if (g.cls !== cls) return;
    const r = normResult(results[g.id]);
    if (!r || r.st !== "E") return; // רק משחקים שהסתיימו נספרים בטבלה
    if (!(g.home in rows) || !(g.away in rows)) return; // משחק בין־ביתי לא נספר בטבלה

    const h = rows[g.home], a = rows[g.away];
    h.played++; a.played++;
    h.gf += r.h; h.ga += r.a;
    a.gf += r.a; a.ga += r.h;
    if (r.h > r.a) { h.won++; a.lost++; h.pts += 3; }
    else if (r.h < r.a) { a.won++; h.lost++; a.pts += 3; }
    else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
  });

  return Object.values(rows).sort((x, y) =>
    y.pts - x.pts ||
    (y.gf - y.ga) - (x.gf - x.ga) ||
    y.gf - x.gf ||
    x.team.localeCompare(y.team, "he")
  );
}

/* ===== רינדור עמוד הלוח ===== */

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderCalendar() {
  const el = document.getElementById("calendar");
  if (!el) return;
  el.innerHTML = LEAGUE.calendar.map(c => `
    <div class="cal-item ${c.type}">
      <div class="cal-label">${esc(c.label)}</div>
      <div class="cal-date">${esc(c.day)} | ${esc(c.date)}</div>
      <div class="cal-venue">${esc(c.venue)}</div>
    </div>`).join("");
}

function renderClassChips(activeCls, onPick) {
  const el = document.getElementById("classChips");
  el.innerHTML = "";
  LEAGUE.classes.forEach(cls => {
    const b = document.createElement("button");
    b.className = "chip" + (cls === activeCls ? " active" : "");
    b.textContent = "כיתה " + cls;
    b.addEventListener("click", () => onPick(cls));
    el.appendChild(b);
  });
}

/* גלולת תוצאה: בפריסת RTL הקבוצה הביתית מוצגת מימין, והגלולה מוצגת LTR —
   לכן מסדרים חוץ-בית משמאל לימין כדי שכל מספר יהיה בצד של הקבוצה שלו */
function scorePillHtml(r, extra = "") {
  return `<span class="score-pill${extra}">${r.a} - ${r.h}</span>`;
}

function scoreCell(g, results) {
  const r = normResult(results[g.id]);
  if (!r) return `<span class="pending">טרם שוחק</span>`;
  if (r.st === "L") {
    return `<span class="live-badge">● חי</span> ${scorePillHtml(r, " live")}`;
  }
  return scorePillHtml(r);
}

/* ===== מסנני מחזור/שלב וקבוצה ===== */

function knockoutStages() {
  return LEAGUE.calendar.filter(c => c.type === "knockout");
}

function renderRoundFilter(selected, onChange) {
  const el = document.getElementById("roundFilter");
  if (!el) return;
  const opts = [`<option value="all">כל המחזורים</option>`];
  LEAGUE.rounds.forEach(r => opts.push(`<option value="r${r.num}">מחזור ${r.num} — ${esc(r.date)}</option>`));
  knockoutStages().forEach((k, i) => opts.push(`<option value="k${i}">${esc(k.label)} — ${esc(k.date)}</option>`));
  el.innerHTML = opts.join("");
  el.value = selected;
  el.onchange = () => onChange(el.value);
}

function renderTeamFilter(cls, selected, onChange) {
  const el = document.getElementById("teamFilter");
  if (!el) return;
  const teams = Object.values(LEAGUE.groups[cls] || {}).flat()
    .sort((a, b) => a.localeCompare(b, "he"));
  const opts = [`<option value="all">כל הקבוצות</option>`];
  teams.forEach(t => opts.push(`<option value="${esc(t)}">${esc(t)}</option>`));
  el.innerHTML = opts.join("");
  el.value = teams.includes(selected) ? selected : "all";
  el.onchange = () => onChange(el.value);
}

function renderSchedule(cls, results, roundFilter = "all", teamFilter = "all") {
  const el = document.getElementById("schedule");

  // נבחר שלב נוקאאוט — אין עדיין משחקים משובצים, מציגים את פרטי השלב
  if (roundFilter.startsWith("k")) {
    const k = knockoutStages()[Number(roundFilter.slice(1))];
    el.innerHTML = `
      <div class="round-card">
        <div class="round-head">
          <span class="round-name">${esc(k.label)}</span>
          <span class="round-meta">${esc(k.day)} | ${esc(k.date)} | ${esc(k.venue)}</span>
        </div>
        <div class="empty-state">המשחקים לשלב זה ייקבעו בסיום שלב הבתים</div>
      </div>`;
    return;
  }

  const cards = LEAGUE.rounds.map(round => {
    if (roundFilter !== "all" && roundFilter !== "r" + round.num) return "";
    const games = round.games.filter(g =>
      g.cls === cls &&
      (teamFilter === "all" || g.home === teamFilter || g.away === teamFilter));
    if (!games.length) return "";
    const rows = games.map(g => {
      const r = normResult(results[g.id]);
      const scorers = r ? scorersHtml(r) : "";
      return `
      <tr${r && r.st === "L" ? ` class="live-row"` : ""}>
        <td>${esc(g.time)}</td>
        <td>${g.pitch}</td>
        <td class="teams-cell">${esc(g.home)}<span class="vs">נגד</span>${esc(g.away)}${scorers}</td>
        <td>${scoreCell(g, results)}</td>
      </tr>`;
    }).join("");
    return `
      <div class="round-card">
        <div class="round-head">
          <span class="round-name">מחזור ${round.num}</span>
          <span class="round-meta">${esc(round.day)} | ${esc(round.date)} | ${esc(round.venue)}</span>
        </div>
        <table class="games">
          <thead><tr><th>שעה</th><th>מגרש</th><th>משחק</th><th>תוצאה</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
  el.innerHTML = cards || `<div class="empty-state">אין משחקים מתאימים לסינון שנבחר</div>`;
}

/* ===== תצוגת משחקים חיים (כל הכיתות) ===== */

function renderLiveMatches(results) {
  const el = document.getElementById("schedule");
  const games = liveGames(results);
  if (!games.length) {
    el.innerHTML = `<div class="empty-state">אין משחקים חיים כרגע — כשמשחק יתחיל הוא יופיע כאן</div>`;
    return;
  }
  el.innerHTML = games.map(g => {
    const r = normResult(results[g.id]);
    const side = (s) => {
      const list = sideScorers(r, s);
      return list.length ? `<div class="live-scorers">⚽ ${list.map(esc).join(", ")}</div>` : "";
    };
    return `
    <div class="live-card">
      <div class="live-card-head">
        <span class="live-badge">● חי</span>
        <span class="cls-tag-dark">כיתה ${esc(g.cls)}</span>
        <span class="live-meta">מחזור ${g.round} | מגרש ${g.pitch}${r.startedAt ? ` | התחיל ב־${fmtStartTime(r.startedAt)}` : ""}</span>
      </div>
      <div class="live-card-body">
        <div class="live-team">
          <div class="live-team-name">${esc(g.home)}</div>
          ${side("h")}
        </div>
        <div class="live-score">${scorePillHtml(r, " live big")}</div>
        <div class="live-team">
          <div class="live-team-name">${esc(g.away)}</div>
          ${side("a")}
        </div>
      </div>
    </div>`;
  }).join("");
}

function renderTables(cls, results) {
  const el = document.getElementById("tables");
  const groups = LEAGUE.groups[cls] || {};
  const cards = Object.entries(groups).map(([groupName, teams]) => {
    const rows = computeStandings(cls, teams, results).map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="team-name">${esc(s.team)}</td>
        <td>${s.played}</td>
        <td>${s.won}</td>
        <td>${s.drawn}</td>
        <td>${s.lost}</td>
        <td>${s.gf}</td>
        <td>${s.ga}</td>
        <td><span dir="ltr">${s.gf - s.ga}</span></td>
        <td class="pts">${s.pts}</td>
      </tr>`).join("");
    return `
      <div class="group-card">
        <div class="group-head"><span>${esc(groupName)}</span><span class="cls-tag">כיתה ${esc(cls)}</span></div>
        <table class="standings">
          <thead>
            <tr><th>#</th><th style="text-align:right;padding-right:10px">קבוצה</th><th>מש'</th><th>נצ'</th><th>תיקו</th><th>הפ'</th><th>זכות</th><th>חובה</th><th>הפרש</th><th>נק'</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
  el.innerHTML = cards || `<div class="empty-state">אין בתים לכיתה זו</div>`;
}

/* ===== אתחול עמוד הלוח ===== */

const LIVE_POLL_MS = 15000; // רענון תוצאות אוטומטי — כדי שמשחקים חיים יתעדכנו לגולשים

async function initSchedulePage() {
  let results = await loadResults();
  renderCalendar();

  let cls = localStorage.getItem("krl_selected_class");
  if (!LEAGUE.classes.includes(cls)) cls = LEAGUE.classes[0];
  let roundFilter = "all";
  let teamFilter = "all";
  let liveOnly = false;

  const renderLiveToggle = () => {
    const btn = document.getElementById("liveToggle");
    if (!btn) return;
    const n = liveGames(results).length;
    btn.className = "chip live-toggle" + (liveOnly ? " active" : "");
    btn.innerHTML = `<span class="live-dot"></span> משחקים חיים${n ? ` (${n})` : ""}`;
    btn.onclick = () => { liveOnly = !liveOnly; refresh(); };
  };

  const refresh = () => {
    renderClassChips(cls, pickClass);
    renderRoundFilter(roundFilter, v => { roundFilter = v; refresh(); });
    renderTeamFilter(cls, teamFilter, v => { teamFilter = v; refresh(); });
    renderLiveToggle();
    const scheduleTitle = document.getElementById("scheduleTitle");
    if (liveOnly) {
      if (scheduleTitle) scheduleTitle.textContent = "🔴 משחקים חיים עכשיו";
      renderLiveMatches(results);
    } else {
      if (scheduleTitle) scheduleTitle.textContent = "🗓️ לוח משחקים";
      renderSchedule(cls, results, roundFilter, teamFilter);
    }
    renderTables(cls, results);
  };

  const pickClass = (c) => {
    cls = c;
    teamFilter = "all"; // הקבוצות משתנות עם הכיתה
    localStorage.setItem("krl_selected_class", c);
    refresh();
  };

  refresh();

  setInterval(async () => {
    try {
      results = await loadResults();
      refresh();
    } catch (e) { /* ננסה שוב בסבב הבא */ }
  }, LIVE_POLL_MS);
}
