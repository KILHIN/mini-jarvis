/***********************
 * App Config
 ***********************/
const THRESH_ORANGE = 30;
const THRESH_RED = 60;
const IS_DEBUG = true; // mets false sur iPhone si tu veux la boucle

function $(id) { return document.getElementById(id); }
function has(id) { return !!document.getElementById(id); }

/***********************
 * UI Helpers
 ***********************/
function hideAllPanels() {
  ["menu","intentBlock","timer","coach"].forEach(id => {
    if (has(id)) $(id).classList.add("hidden");
  });
}

function showMenu() { hideAllPanels(); if (has("menu")) $("menu").classList.remove("hidden"); }
function showIntent() { hideAllPanels(); if (has("intentBlock")) $("intentBlock").classList.remove("hidden"); }
function showTimer() { hideAllPanels(); if (has("timer")) $("timer").classList.remove("hidden"); }
function showCoachPanel() { hideAllPanels(); if (has("coach")) $("coach").classList.remove("hidden"); }

/***********************
 * Data Access (Storage)
 ***********************/
function getBehavior() { return Storage.get("behavior", { useful: 0, easy: 0 }); }
function setBehavior(v) { Storage.set("behavior", v); }

function getChoiceStats() { return Storage.get("choiceStats", { primary: 0, alt1: 0, alt2: 0 }); }
function setChoiceStats(v) { Storage.set("choiceStats", v); }

function getOpenPings() { return Storage.get("openPings", []); }
function setOpenPings(v) { Storage.set("openPings", v); }

function getEvents() { return Storage.get("events", []); }
function setEvents(v) { Storage.set("events", v); }

function migrateToEventsIfNeeded() {
  const existing = getEvents();
  if (existing.length > 0) return; // déjà migré

  const history = Storage.get("history", []);
  const intents = Storage.get("intents", []);

  // index intents par date (ordre chronologique)
  const intentsByDate = {};
  intents
    .slice()
    .sort((a,b) => (a.ts || 0) - (b.ts || 0))
    .forEach(i => {
      const d = i.date || Engine.todayKey();
      if (!intentsByDate[d]) intentsByDate[d] = [];
      intentsByDate[d].push(i);
    });

  // convertir history -> events en associant la prochaine intention disponible du même jour
  const events = history.map((h) => {
    const d = h.date || Engine.todayKey();
    const bucket = intentsByDate[d] || [];
    const linkedIntent = bucket.length ? bucket.shift() : null;

    return {
      ts: linkedIntent?.ts || Date.now(),
      date: d,
      source: linkedIntent?.sessionType || "unknown",
      minutes: h.duration || 0,
      intent: linkedIntent?.intent || "unknown",
      mode: "allow"
    };
  });

  setEvents(events);
}


/***********************
 * Source param
 ***********************/
function storeSourceFromURL() {
  const params = new URLSearchParams(window.location.search);
  const src = params.get("src");
  if (src) Storage.set("lastSrc", { src, ts: Date.now() });
}
function getLastSourceLabel() {
  const last = Storage.get("lastSrc", null);
  return last?.src ? last.src : null;
}

/***********************
 * Timer / Session
 ***********************/
let timerInterval = null;
let pendingSessionType = null;

function updateTimerDisplay(seconds) {
  if (!has("timeDisplay")) return;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  $("timeDisplay").innerText = `${m}:${s < 10 ? "0" : ""}${s}`;
}

/***********************
 * HERO / Dashboard render
 ***********************/
function renderHero() {
  const events = getEvents();
  
  const totalToday = Engine.calcTodayTimeFromEvents(events);
  const pred = Engine.trendPredictionFromEvents(events, THRESH_ORANGE, THRESH_RED);
  const intents7 = Engine.intentStats7dFromEvents(events);
  const pressure = Engine.jarvisPressureFromEvents(events);



  // état
  let state = "VERT";
  let color = "#34c759";
  if (totalToday >= THRESH_RED) { state = "ROUGE"; color = "#ff3b30"; }
  else if (totalToday >= THRESH_ORANGE) { state = "ORANGE"; color = "#ff9500"; }

  if (has("todayMinutes")) $("todayMinutes").innerText = String(totalToday);
  if (has("stateLabel")) $("stateLabel").innerText = `État: ${state}`;

  if (has("stateDot")) {
    $("stateDot").style.background = `linear-gradient(180deg, ${color}, rgba(255,255,255,0.08))`;
    $("stateDot").style.borderColor = `${color}55`;
  }

  const src = getLastSourceLabel();
  if (has("sourceLabel")) $("sourceLabel").innerText = src ? `Source: ${src}` : "";

  if (has("kpiTrend")) {
    const t = pred.trendText.includes("augmentation") ? "↑"
            : pred.trendText.includes("baisse") ? "↓"
            : "→";
    $("kpiTrend").innerText = t;
  }
  if (has("kpiPressure")) $("kpiPressure").innerText = `${pressure}/3`;
  if (has("kpiAuto")) $("kpiAuto").innerText = intents7.total ? `${intents7.pAuto}%` : "—";
}

/***********************
 * Coach
 ***********************/
function launchCoach() {
  const history = getHistory();
  const behavior = getBehavior();
  const intents = getIntents();
  const intents7 = Engine.intentStats7d(intents);

  if (has("coachSuggestion")) {
    $("coachSuggestion").innerText = Engine.coachSuggestion({
      history,
      behavior,
      thresholds: { THRESH_ORANGE, THRESH_RED },
      intents7
    });
  }
  showCoachPanel();
}

/***********************
 * Loop
 ***********************/
function recordOpenPing() {
  const pings = getOpenPings();
  const now = Date.now();
  const cleaned = pings.filter(t => now - t <= 60 * 60 * 1000);
  cleaned.push(now);
  setOpenPings(cleaned);
  return cleaned;
}

function showLoopAlert(count15) {
  if (!has("loopAlert")) return;
  $("loopAlert").classList.remove("hidden");
  $("loopAlert").innerText =
    `Boucle détectée.\nOuvertures sur 15 min : ${count15}.\nAction imposée : coach contextuel.`;
}

function applyLoopRestriction() {
  const btnAllow = $("btnAllow");
  if (btnAllow) btnAllow.classList.add("hidden");
}

function resetLoop() {
  Storage.remove("openPings");
  alert("openPings reset.");
  location.reload();
}

/***********************
 * Flows
 ***********************/
function startSession(type) {
  pendingSessionType = type;
  showIntent();
}

function cancelIntent() {
  pendingSessionType = null;
  showMenu();
}

function setIntentAndStart(intent) {
  if (intent === "auto") {
    alert("Intention faible détectée. Coach recommandé.");
    launchCoach();
    return;
  }

  // Event log unique (source de vérité)
  const sid = newSessionId();
const now = Date.now();

const events = getEvents();
events.push({
  ts: now,
  date: Engine.todayKey(),
  source: pendingSessionType || "instagram",
  minutes: 10,              // planifié (fallback)
  minutesActual: null,      // réel à remplir à la fermeture
  intent: intent,
  mode: "allow",
  sessionId: sid,
  startedAt: now
});
setEvents(events);

// mémorise le sid local (au cas où)
Storage.set("lastSessionId", sid);

// UI refresh
renderHero(); 
  drawChart(); 
  renderPrediction(); 
  renderProfile(); 
  renderIntentStats();

// Lance le raccourci en lui passant le sid
setTimeout(() => {
  window.location.href =
    "shortcuts://run-shortcut?name=" + encodeURIComponent("Mini Jarvis GO") +
    "&input=text&text=" + encodeURIComponent(sid);
}, 250);

function startPause() {
  showTimer();
  let timeLeft = 120;
  updateTimerDisplay(timeLeft);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      alert("Pause terminée. Décision consciente requise.");
      location.reload();
    }
  }, 1000);
}

/***********************
 * Stats
 ***********************/
function drawChart() {
  if (!has("chart")) return;
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");

  const events = getEvents();
  const data = Engine.last7DaysDataFromEvents(events);
  const values = Object.values(data);
  const dates = Object.keys(data);

  const maxValue = Math.max(...values, 10);
  const barWidth = 30;
  const gap = 15;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px Arial";
  ctx.fillStyle = "white";
  ctx.fillText("Vert < 30m | Orange 30–60m | Rouge ≥ 60m", 5, 15);

  values.forEach((value, index) => {
    const barHeight = (value / maxValue) * 120;
    const x = index * (barWidth + gap) + 10;
    const y = 160 - barHeight;

    if (value >= THRESH_RED) ctx.fillStyle = "#ff3b30";
    else if (value >= THRESH_ORANGE) ctx.fillStyle = "#ff9500";
    else ctx.fillStyle = "#34c759";

    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "white";
    ctx.fillText(value + "m", x + 2, y - 5);

    const dateObj = new Date(dates[index]);
    const dayLetter = ["D","L","M","M","J","V","S"][dateObj.getDay()];
    ctx.fillText(dayLetter, x + 10, 180);
  });
}

function renderPrediction() {
  if (!has("prediction")) return;
  const events = getEvents();
const pred = Engine.trendPredictionFromEvents(events, THRESH_ORANGE, THRESH_RED);
  $("prediction").innerText =
    `Moyenne 7j : ${pred.avg} min/j. ${pred.trendText} Projection semaine : ${pred.weeklyProjection} min. Risque : ${pred.risk}.`;
}

function renderProfile() {
  if (!has("profile")) return;
  const behavior = getBehavior();
  const total = (behavior.useful || 0) + (behavior.easy || 0);
  const pressure = Engine.jarvisPressure(behavior);

  if (total === 0) {
    $("profile").innerText = "Profil: aucune donnée comportementale (choisis des actions dans le coach).";
    return;
  }
  const easyRate = Math.round(((behavior.easy || 0) / total) * 100);

  let interpretation = "Interprétation: discipline stable.";
  if (pressure === 1) interpretation = "Interprétation: dérive légère vers le facile.";
  if (pressure === 2) interpretation = "Interprétation: biais de confort détecté. Correction appliquée.";
  if (pressure === 3) interpretation = "Interprétation: évitement systématique. Intervention nécessaire.";

  $("profile").innerText =
    `Profil: Useful ${behavior.useful || 0} | Easy ${behavior.easy || 0} (Easy ${easyRate}%). Pression: ${pressure}/3. ${interpretation}`;
}

function renderIntentStats() {
  if (!has("intentStats")) return;
 const events = getEvents();
const s = Engine.intentStats7dFromEvents(events);

  if (s.total === 0) {
    $("intentStats").innerText = "Intentions (7j) : aucune donnée.";
    return;
  }
  $("intentStats").innerText =
    `Intentions (7j) : Reply ${s.pReply}% | Fun ${s.pFun}% | Auto ${s.pAuto}% (n=${s.total}).`;
}

/***********************
 * Export
 ***********************/
function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    config: { THRESH_ORANGE, THRESH_RED },
    history: getHistory(),
    intents: getIntents(),
    behavior: getBehavior(),
    choiceStats: getChoiceStats(),
    openPings: getOpenPings(),
    lastSrc: Storage.get("lastSrc", null),
    events: Storage.get("events", []),

  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intent-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function triggerImport() {
  const input = document.getElementById("importFile");
  if (!input) return alert("Import indisponible: input manquant.");
  input.value = ""; // permet de réimporter le même fichier
  input.click();
}

function validatePayload(p) {
  // Validation minimale et safe
  if (!p || typeof p !== "object") return { ok: false, msg: "Fichier invalide." };
  if (!p.config || typeof p.config !== "object") return { ok: false, msg: "config manquante." };
  if (!Array.isArray(p.history)) return { ok: false, msg: "history manquant." };
  if (!Array.isArray(p.intents)) return { ok: false, msg: "intents manquant." };
  if (!p.behavior || typeof p.behavior !== "object") return { ok: false, msg: "behavior manquant." };
  // optionnel: choiceStats/openPings
  return { ok: true };
}

function applyImportReplace(p) {
  // Remplacement total des données app
  localStorage.setItem("history", JSON.stringify(p.history || []));
  localStorage.setItem("intents", JSON.stringify(p.intents || []));
  localStorage.setItem("behavior", JSON.stringify(p.behavior || { useful: 0, easy: 0 }));
  localStorage.setItem("choiceStats", JSON.stringify(p.choiceStats || { primary: 0, alt1: 0, alt2: 0 }));
  localStorage.setItem("openPings", JSON.stringify(p.openPings || []));
  localStorage.setItem("events", JSON.stringify(p.events || []));
  if (p.lastSrc) localStorage.setItem("lastSrc", JSON.stringify(p.lastSrc));
}

function setupImportListener() {
  const input = document.getElementById("importFile");
  if (!input) return;

  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const v = validatePayload(payload);
      if (!v.ok) return alert("Import refusé : " + v.msg);

      // Confirmation simple (safe)
      const ok = confirm("Importer va remplacer toutes les données actuelles. Continuer ?");
      if (!ok) return;

      applyImportReplace(payload);
      alert("Import terminé. Rechargement…");
      location.reload();
    } catch (err) {
      alert("Erreur import : fichier illisible ou JSON invalide.");
    }
  });
}

/***********************
 * Choice logging
 ***********************/
function logChoice(type) {
  const events = getEvents();

  events.push({
    ts: Date.now(),
    date: Engine.todayKey(),
    source: "coach",
    minutes: 0,
    intent: null,
    mode: "coach",
    choice: type // primary / alt1 / alt2
  });

  setEvents(events);

  // Optionnel: garder behavior pour pression (transition)
  const behavior = getBehavior();
  if (type === "primary") behavior.useful = (behavior.useful || 0) + 1;
  else behavior.easy = (behavior.easy || 0) + 1;
  setBehavior(behavior);

  alert("Choix enregistré.");
  location.reload();
}


/***********************
 * Wire globals for HTML onclick
 ***********************/
window.startSession = startSession;
window.startPause = startPause;
window.launchCoach = launchCoach;
window.logChoice = logChoice;
window.resetLoop = resetLoop;
window.exportData = exportData;
window.setIntentAndStart = setIntentAndStart;
window.cancelIntent = cancelIntent;
window.triggerImport = triggerImport;


/***********************
 * Init
 ***********************/
(function init() {
  // 1) UI
  showMenu();
  migrateToEventsIfNeeded();

  // 2) src
  storeSourceFromURL();
  
(function applySpentFromURL() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const spent = parseInt(params.get("spent"), 10);

  if (!sid || !Number.isFinite(spent) || spent < 0 || spent > 240) return;

  const events = getEvents();
  const idx = events.findIndex(e => e.sessionId === sid);
  if (idx === -1) return;

  events[idx].minutesActual = spent;
  events[idx].minutes = spent; // on remplace le planifié par le réel
  setEvents(events);

  // nettoie l’URL (évite double application si refresh)
  history.replaceState({}, "", window.location.pathname + window.location.search.replace(/([?&])(sid|spent)=[^&]+(&)?/g, (m, p1, p2, p3) => p3 ? p1 : ""));
})();

  // 3) loop
  const pings = recordOpenPing();
  const loop = Engine.loopStatus(pings);

  if (!IS_DEBUG && loop.inLoop) {
    showLoopAlert(loop.count15);
    applyLoopRestriction();
    launchCoach();
  }

  // 4) render
  renderHero();
  drawChart();
  renderPrediction();
  renderProfile();
  renderIntentStats();
  setupImportListener();

})();

function getEvents() { return Storage.get("events", []); }

function newSessionId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}




