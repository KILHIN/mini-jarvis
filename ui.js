/* =========================================================
   UI LAYER — DOM Rendering Only
   No business logic here.
   ========================================================= */

/* =========================================================
   1) DOM HELPERS
   ========================================================= */
function $(id){ return document.getElementById(id); }
function has(id){ return !!document.getElementById(id); }

function showOutcomeBlock(){
  const el = document.getElementById("outcomeBlock");
  if (el) el.classList.remove("hidden");
}
/* =========================================================
   2) PANEL CONTROL
   ========================================================= */

function hideAllPanels(){
  ["menu","intentBlock","timer","coach"]
    .forEach(id => has(id) && $(id).classList.add("hidden"));
}

function showMenu(){ hideAllPanels(); has("menu") && $("menu").classList.remove("hidden"); }
function showIntent(){ hideAllPanels(); has("intentBlock") && $("intentBlock").classList.remove("hidden"); }
function showTimer(){ hideAllPanels(); has("timer") && $("timer").classList.remove("hidden"); }
function showCoach(){ hideAllPanels(); has("coach") && $("coach").classList.remove("hidden"); }

/* =========================================================
   3) SESSION BANNER
   ========================================================= */

function ensureSessionBanner(){
  const hero = document.querySelector(".hero");
  if (!hero) return null;

  let el = document.getElementById("sessionBanner");
  if (el) return el;

  el = document.createElement("div");
  el.id = "sessionBanner";
  el.className = "sessionBanner hidden";
  el.innerHTML = `
    <div class="sessionBannerRow">
      <div>
        <div class="sessionBannerTitle">Session en cours</div>
        <div id="sessionBannerText" class="sessionBannerText"></div>
      </div>
      <button id="btnStopSession" class="btnStop">STOP</button>
    </div>
  `;
  hero.appendChild(el);

  document.getElementById("btnStopSession")
    ?.addEventListener("click", () => {
      window.Sessions.stopActiveSession();
      renderAll();
      alert("Session stoppée.");
    });

  return el;
}

function renderSessionBanner(){
  const banner = ensureSessionBanner();
  if (!banner) return;

  const events = window.EventsStore.getEvents();
  const active = window.Sessions.getActiveSession(events);

  if (!active){
    banner.classList.add("hidden");
    return;
  }

  const planned = active.minutesPlanned ?? 10;
  const start = active.startedAt
    ? window.Sessions.formatHHMM(active.startedAt)
    : "—";

  $("sessionBannerText").textContent =
    `Début: ${start} • Plan: ${planned} min`;

  banner.classList.remove("hidden");
}

/* =========================================================
   4) HERO RENDER
   ========================================================= */

const THRESH_ORANGE = 30;
const THRESH_RED = 60;

function renderHero(){
  const events = window.EventsStore.getEvents();

  const totalToday = Engine.totalToday(events);
  const trend = Engine.trendPrediction(events, THRESH_ORANGE, THRESH_RED);
  const intents7 = Engine.intentStats7d(events);
  const pressure = Engine.jarvisPressure(events);

  const state = Engine.stateFromThresholds(
    totalToday,
    trend.avg,
    THRESH_ORANGE,
    THRESH_RED
  );

  // Minutes
  has("todayMinutes") && ($("todayMinutes").innerText = totalToday);

  // State label
  const stateMap = {
    GREEN: "VERT",
    ORANGE: "ORANGE",
    RED: "ROUGE"
  };

  has("stateLabel") &&
    ($("stateLabel").innerText = `État: ${stateMap[state]}`);

  // State dot class
  if (has("stateDot")){
    $("stateDot").classList.remove("green","orange","red");
    if (state === "GREEN") $("stateDot").classList.add("green");
    if (state === "ORANGE") $("stateDot").classList.add("orange");
    if (state === "RED") $("stateDot").classList.add("red");
  }

  // KPIs
  if (has("kpiTrend")){
    const t =
      trend.trendText.includes("augmentation") ? "↑" :
      trend.trendText.includes("baisse") ? "↓" : "→";
    $("kpiTrend").innerText = t;
  }

  has("kpiPressure") && ($("kpiPressure").innerText = `${pressure}/3`);
  has("kpiAuto") &&
    ($("kpiAuto").innerText = intents7.total ? `${intents7.pAuto}%` : "—");
}

/* =========================================================
   5) CHART
   ========================================================= */

function drawChart(){
  if (!has("chart")) return;

  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const events = window.EventsStore.getEvents();
  const data = Engine.last7DaysMap(events);

  const values = Object.values(data);
  const dates = Object.keys(data);
  const maxValue = Math.max(...values, 10);

  const barWidth = 30;
  const gap = 15;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font = "12px Arial";
  ctx.fillStyle = "white";
  ctx.fillText("Vert < 30m | Orange 30–60m | Rouge ≥ 60m", 5, 15);

  values.forEach((value, i) => {
    const barHeight = (value / maxValue) * 120;
    const x = i * (barWidth + gap) + 10;
    const y = 160 - barHeight;

    if (value >= THRESH_RED) ctx.fillStyle = "#ff453a";
    else if (value >= THRESH_ORANGE) ctx.fillStyle = "#ff9f0a";
    else ctx.fillStyle = "#34c759";

    ctx.fillRect(x,y,barWidth,barHeight);

    ctx.fillStyle = "white";
    ctx.fillText(value + "m", x + 2, y - 5);

    const dateObj = new Date(dates[i]);
    const dayLetter = ["D","L","M","M","J","V","S"][dateObj.getDay()];
    ctx.fillText(dayLetter, x + 10, 180);
  });
}

/* =========================================================
   6) TEXT STATS
   ========================================================= */

function renderPrediction(){
  if (!has("prediction")) return;

  const events = window.EventsStore.getEvents();
  const pred = Engine.trendPrediction(events, THRESH_ORANGE, THRESH_RED);

  $("prediction").innerText =
    `Moyenne 7j : ${pred.avg} min/j. ` +
    `${pred.trendText} ` +
    `Projection semaine : ${pred.weeklyProjection} min. ` +
    `Risque : ${pred.risk}.`;
}

function renderIntentStats(){
  if (!has("intentStats")) return;

  const events = window.EventsStore.getEvents();
  const s = Engine.intentStats7d(events);

  $("intentStats").innerText = s.total
    ? `Intentions (7j) : Reply ${s.pReply}% | Fun ${s.pFun}% | Auto ${s.pAuto}% (n=${s.total}).`
    : "Intentions (7j) : aucune donnée.";
}

function renderRisk({ events, thresholds, openPings }) {
  // Safe guards (ne jamais planter l'UI)
  if (!window.Analytics || !window.Engine) return;

  const now = new Date();
  const risk = Analytics.computeRisk({
    events,
    thresholds,
    openPings,
    now
  });

  // 1) Ligne principale
  const riskLine = document.getElementById("riskLine");
  if (riskLine) {
    riskLine.innerText = `Risk-score : ${risk.score}/100 — ${risk.tier}.`;
  }

  // 2) Barre de risque (0–100)
  const fill = document.getElementById("riskBarFill");
  if (fill) {
    const pct = Math.max(0, Math.min(100, risk.score));
    fill.style.width = pct + "%";

    // Couleur soft selon tier (Apple-like)
    if (risk.tier === "élevé") fill.style.background = "rgba(255,59,48,0.85)";      // rouge iOS
    else if (risk.tier === "modéré") fill.style.background = "rgba(255,159,10,0.85)"; // orange iOS
    else fill.style.background = "rgba(52,199,89,0.85)";                               // vert iOS
  }

  // 3) Chips = top 3 raisons (visuel, court)
  const chips = document.getElementById("riskChips");
  if (chips) {
    const top = Array.isArray(risk.topReasons) ? risk.topReasons.slice(0, 3) : [];

    chips.innerHTML = top
      .map(r => `<span class="pill">${escapeHtml(r.label)}</span>`)
      .join("");

    // Si aucune raison (pas assez de data), on met une chip neutre
    if (!top.length) {
      chips.innerHTML = `<span class="pill">Données insuffisantes</span>`;
    }
  }

  // 4) (Optionnel) on cache l'ancien bloc texte s'il existe encore dans le DOM
  const old = document.getElementById("riskReasons");
  if (old) old.classList.add("hidden");
}

/* Petit helper pour éviter l’injection HTML via labels (sécurité) */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderProfileTraits(){
  if (!has("profileTraits") || !window.Analytics) return;

  const events = window.EventsStore.getEvents();
  const p = Analytics.computeProfile({ events });

  $("profileTraits").innerText = p.summary;
}
/* =========================================================
   7) COACH
   ========================================================= */

function launchCoach(){
  const events = window.EventsStore.getEvents();

  if (has("coachSuggestion")){
    $("coachSuggestion").innerText =
    Engine.coachSuggestion({
  events,
  thresholds: { THRESH_ORANGE, THRESH_RED },
  openPings: Storage.get("openPings", [])
});
}
  showCoach();
}

/* =========================================================
   8) GLOBAL RENDER
   ========================================================= */

function renderAll(){
  renderHero();
  renderSessionBanner();
  drawChart();
  renderPrediction();
  renderIntentStats();
  renderRisk({ events, thresholds, openPings });
  renderProfileTraits();
}

/* =========================================================
   EXPORT
   ========================================================= */

window.UI = {
  showMenu,
  showIntent,
  showTimer,
  showCoach,
  renderAll,
  launchCoach
};