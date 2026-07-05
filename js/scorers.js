/* עמוד מלך השערים: רשימה גלובלית או לפי כיתה, מחושב משערי המשחקים */

const GLOBAL_SCOPE = "__all__";

async function initScorersPage() {
  let results = await loadResults();
  let scope = GLOBAL_SCOPE;

  const renderChips = () => {
    const el = document.getElementById("scopeChips");
    el.innerHTML = "";
    const mk = (label, value) => {
      const b = document.createElement("button");
      b.className = "chip" + (value === scope ? " active" : "");
      b.textContent = label;
      b.addEventListener("click", () => { scope = value; refresh(); });
      el.appendChild(b);
    };
    mk("🌍 כל הליגה", GLOBAL_SCOPE);
    LEAGUE.classes.forEach(cls => mk("כיתה " + cls, cls));
  };

  const renderTable = () => {
    const el = document.getElementById("scorersTable");
    const cls = scope === GLOBAL_SCOPE ? null : scope;
    const rows = computeScorers(results, cls);
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">עדיין לא הובקעו שערים${cls ? " בכיתה זו" : ""} — הטבלה תתעדכן עם תחילת המשחקים</div>`;
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    const body = rows.map((s, i) => `
      <tr>
        <td class="rank">${i < 3 && s.goals > 0 ? medals[i] : i + 1}</td>
        <td class="team-name">${esc(s.player)}</td>
        <td class="team-name">${esc(s.team)}</td>
        ${cls ? "" : `<td>כיתה ${esc(s.cls)}</td>`}
        <td class="pts">${s.goals}</td>
      </tr>`).join("");
    el.innerHTML = `
      <div class="group-card">
        <div class="group-head">
          <span>טבלת הכובשים</span>
          <span class="cls-tag">${cls ? "כיתה " + esc(cls) : "כל הליגה"}</span>
        </div>
        <table class="standings scorers-standings">
          <thead>
            <tr>
              <th>#</th>
              <th style="text-align:right;padding-right:10px">שחקן</th>
              <th style="text-align:right;padding-right:10px">קבוצה</th>
              ${cls ? "" : "<th>כיתה</th>"}
              <th>שערים</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  };

  const refresh = () => { renderChips(); renderTable(); };
  refresh();

  setInterval(async () => {
    try {
      results = await loadResults();
      refresh();
    } catch (e) { /* ננסה שוב בסבב הבא */ }
  }, LIVE_POLL_MS);
}

initScorersPage();
