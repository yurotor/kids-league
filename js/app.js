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

/* חישוב טבלת בית: 3 נק' ניצחון, 1 תיקו. שובר שוויון: נקודות, הפרש, זכות, שם */
function computeStandings(cls, teams, results) {
  const rows = {};
  teams.forEach(t => rows[t] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 });

  allGames().forEach(g => {
    if (g.cls !== cls) return;
    const r = results[g.id];
    if (!r || r.h === null || r.a === null || r.h === undefined || r.a === undefined) return;
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

function scoreCell(g, results) {
  const r = results[g.id];
  if (r && r.h !== null && r.h !== undefined && r.a !== null && r.a !== undefined) {
    return `<span class="score-pill">${r.h} - ${r.a}</span>`;
  }
  return `<span class="pending">טרם שוחק</span>`;
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
    const rows = games.map(g => `
      <tr>
        <td>${esc(g.time)}</td>
        <td>${g.pitch}</td>
        <td class="teams-cell">${esc(g.home)}<span class="vs">נגד</span>${esc(g.away)}</td>
        <td>${scoreCell(g, results)}</td>
      </tr>`).join("");
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
async function initSchedulePage() {
  const results = await loadResults();
  renderCalendar();

  let cls = localStorage.getItem("krl_selected_class");
  if (!LEAGUE.classes.includes(cls)) cls = LEAGUE.classes[0];
  let roundFilter = "all";
  let teamFilter = "all";

  const refresh = () => {
    renderClassChips(cls, pickClass);
    renderRoundFilter(roundFilter, v => { roundFilter = v; refresh(); });
    renderTeamFilter(cls, teamFilter, v => { teamFilter = v; refresh(); });
    renderSchedule(cls, results, roundFilter, teamFilter);
    renderTables(cls, results);
  };

  const pickClass = (c) => {
    cls = c;
    teamFilter = "all"; // הקבוצות משתנות עם הכיתה
    localStorage.setItem("krl_selected_class", c);
    refresh();
  };

  refresh();
}
