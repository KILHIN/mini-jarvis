// ui.js
function $(id){ return document.getElementById(id); }
function has(id){ return !!document.getElementById(id); }

// Panels
function hideAllPanels(){
  ["menu","intentBlock","timer","coach"].forEach(id => has(id) && $(id).classList.add("hidden"));
}
function showMenu(){ hideAllPanels(); has("menu") && $("menu").classList.remove("hidden"); }
function showIntent(){ hideAllPanels(); has("intentBlock") && $("intentBlock").classList.remove("hidden"); }
function showTimer(){ hideAllPanels(); has("timer") && $("timer").classList.remove("hidden"); }
function showCoach(){ hideAllPanels(); has("coach") && $("coach").classList.remove("hidden"); }

// Banner injection (dans .hero)
function ensureSessionBanner(){
  const hero = document.querySelector(".hero");
  if (!hero) return null;

  let el = document.getElementById("sessionBanner");
  if (el) return el;

  el = document.createElement("div");
  el.id = "sessionBanner";
  el.className = "sessionBanner";
  el.style.display = "none";
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

  const btn = document.getElementById("btnStopSession");
  if (btn) btn.addEventListener("click", () => {
    window.Sessions.stopActiveSession();
    renderAll(); // refresh UI
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
    banner.style.display = "none";
    return;
  }

  const planned = active.minutesPlanned ?? 10;
  const start = active.startedAt ? window.Sessions.formatHHMM(active.startedAt) : "—";
  const src = active.source || "instagram";

  const textEl = document.getElementById("sessionBannerText");
  if (textEl) textEl.textContent = `Source: ${src} • Début: ${start} • Plan: ${planned} min`;

  banner.style.display = "block";
}

// ---- Renders (basés events) ----
const THRESH_ORANGE = 30;
const THRESH_RED = 60;

function renderHero(){
  const events = window.EventsStore.getEvents();
  const totalToday = Engine.calcTodayTimeFromEvents(events);
  const pred = Engine.trendPredictionFromEvents(events, THRESH_ORANGE, THRESH_RED);
  const intents7 = Engine.intentStats7dFromEvents(events);

  // pression depuis events coach si tu l’as ajouté, sinon fallback à behavior
  const pressure = (Engine.jarvisPressureFromEvents)
    ? Engine.jarvisPressureFromEvents(events)
    : Engine.jarvisPressure(Storage.get("behavior", { useful:0, easy:0 }));

  let state = "VERT";
  let color = "#34c759";
  if (totalToday >= THRESH_RED){ state="ROUGE"; color="#ff3b30"; }
  else if (totalToday >= THRESH_ORANGE){ state="ORANGE"; color="#ff9500"; }

  has("todayMinutes") && ($("todayMinutes").innerText = String(totalToday));
  has("stateLabel") && ($("stateLabel").innerText = `État: ${state}`);

  if (has("stateDot")){
    $("stateDot").style.background = `linear-gradient(180deg, ${color}, rgba(255,255,255,0.08))`;
    $("stateDot").style.borderColor = `${color}55`;
  }

  const lastSrc = Storage.get("lastSrc", null)?.src;
  has("sourceLabel") && ($("sourceLabel").innerText = lastSrc ? `Source: ${lastSrc}` : "");

  if (has("kpiTrend")){
    const t = pred.trendText.includes("augmentation") ? "↑" :
              pred.trendText.includes("baisse") ? "↓" : "→";
    $("kpiTrend").innerText = t;
  }
  has("kpiPressure") && ($("kpiPressure").innerText = `${pressure}/3`);
  has("kpiAuto") && ($("kpiAuto").innerText = intents7.total ? `${intents7.pAuto}%` : "—");
}

function drawChart(){
  if (!has("chart")) return;
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");

  const events = window.EventsStore.getEvents();
  const data = Engine.last7DaysDataFromEvents(events);

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

    if (value >= THRESH_RED) ctx.fillStyle = "#ff3b30";
    else if (value >= THRESH_ORANGE) ctx.fillStyle = "#ff9500";
    else ctx.fillStyle = "#34c759";

    ctx.fillRect(x,y,barWidth,barHeight);

    ctx.fillStyle = "white";
    ctx.fillText(value + "m", x + 2, y - 5);

    const dateObj = new Date(dates[i]);
    const dayLetter = ["D","L","M","M","J","V","S"][dateObj.getDay()];
    ctx.fillText(dayLetter, x + 10, 180);
  });
}

function renderPrediction(){
  if (!has("prediction")) return;
  const events = window.EventsStore.getEvents();
  const pred = Engine.trendPredictionFromEvents(events, THRESH_ORANGE, THRESH_RED);
  $("prediction").innerText =
    `Moyenne 7j : ${pred.avg} min/j. ${pred.trendText} Projection semaine : ${pred.weeklyProjection} min. Risque : ${pred.risk}.`;
}

function renderIntentStats(){
  if (!has("intentStats")) return;
  const events = window.EventsStore.getEvents();
  const s = Engine.intentStats7dFromEvents(events);
  $("intentStats").innerText = s.total
    ? `Intentions (7j) : Reply ${s.pReply}% | Fun ${s.pFun}% | Auto ${s.pAuto}% (n=${s.total}).`
    : "Intentions (7j) : aucune donnée.";
}

// Coach affichage (si tu as Engine.coachSuggestion event-driven)
function launchCoach(){
  const events = window.EventsStore.getEvents();
  const intents7 = Engine.intentStats7dFromEvents(events);

  if (has("coachSuggestion") && Engine.coachSuggestion){
    $("coachSuggestion").innerText = Engine.coachSuggestion({
      events,
      thresholds: { THRESH_ORANGE, THRESH_RED },
      intents7
    });
  }
  showCoach();
}

function renderAll(){
  renderHero();
  renderSessionBanner();
  drawChart();
  renderPrediction();
  renderIntentStats();
}

window.UI = {
  showMenu, showIntent, showTimer, showCoach,
  renderAll, launchCoach
};

