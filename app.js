/***********************
 * App Config
 ***********************/
const THRESH_ORANGE = 30;
const THRESH_RED = 60;
const IS_DEBUG = true; // mets false sur iPhone si tu veux réactiver les règles de boucle

function $(id) { return document.getElementById(id); }
function has(id) { return !!$(id); }

/***********************
 * UI Helpers
 ***********************/
function hideAllPanels() {
  if (has("menu")) $("menu").classList.add("hidden");
  if (has("intentBlock")) $("intentBlock").classList.add("hidden");
  if (has("timer")) $("timer").classList.add("hidden");
  if (has("coach")) $("coach").classList.add("hidden");
}

function showMenu() {
  hideAllPanels();
  if (has("menu")) $("menu").classList.remove("hidden");
}

function showIntent() {
  hideAllPanels();
  if (has("intentBlock")) $("intentBlock").classList.remove("hidden");
}

function showTimer() {
  hideAllPanels();
  if (has("timer")) $("timer").classList.remove("hidden");
}

function showCoachPanel() {
  hideAllPanels();
  if (has("coach")) $("coach").classList.remove("hidden");
}

/***********************
 * Data Access
 ***********************/
function getHistory() { return Storage.get("history", []); }
function setHistory(v) { Storage.set("history", v); }

function getIntents() { return Storage.get("intents", []); }
function setIntents(v) { Storage.set("intents", v); }

function getBehavior() { return Storage.get("behavior", { useful: 0, easy: 0 }); }
function setBehavior(v) { Storage.set("behavior", v); }

function getChoiceStats() { return Storage.get("choiceStats", { primary: 0, alt1: 0, alt2: 0 }); }
function setChoiceStats(v) { Storage.set("choiceStats", v); }

function getOpenPings() { return Storage.get("openPings", []); }
function setOpenPings(v) { Storage.set("openPings", v); }

/***********************
 * Source param (src=instagram)
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
 * Core actions
 ***********************/
let timerInterval = null;
let pendingSessionType = null;

function updateTimerDisplay(seconds) {
  if (!has("timeDisplay")) return;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  $("timeDisplay").innerText = `${m}:${s < 10 ? "0" : ""}${s}`;
}

function saveSession(minutes) {
  const history = getHistory();
  history.push({ date: Engine.todayKey(), duration: minutes });
  setHistory(history);
}

function updateContextAndBrief() {
  if (!has("context")) return;

  const history = getHistory();
  const intents = getIntents();
  const behavior = getBehavior();

  const totalToday = Engine.calcTodayTime(history);
  const src = getLastSourceLabel();

  $("context").innerText =
    `Temps aujourd'hui : ${totalToday} min` + (src ? ` | Source: ${src}` : "");

  if (has("dailyBrief")) {
    const pred = Engine.trendPrediction(history, THRESH_ORANGE, THRESH_RED);
    const pressure = Engine.jarvisPressure(behavior);
    const it = Engine.intentStatsToday(intents);

    let state = "VERT";
    if (totalToday >= THRESH_RED) state = "ROUGE";
    else if (totalToday >= THRESH_ORANGE) state = "ORANGE";

    let line = `Rapport du jour : ${totalToday} min. Etat ${state}. ${pred.trendText} Pression ${pressure}/3.`;
    if (it.total > 0) line += ` Intentions: ${it.pConscious}% conscientes, ${it.pAuto}% auto.`;
    else line += ` Intentions: aucune donnée.`;

    $("dailyBrief").innerText = line;
  }
}

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
 * Loop handling
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
    `Boucle détectée.\n` +
    `Ouvertures sur 15 min : ${count15}.\n` +
    `Action imposée : coach contextuel.`;
}

function applyLoopRestriction() {
  // Nouvelle UI: on masque le seul bouton "Autoriser"
  const btnAllow = $("btnAllow");
  if (btnAllow) btnAllow.classList.add("hidden");
}

function resetLoop() {
  Storage.remove("openPings");
  alert("openPings reset.");
  location.reload();
}

/***********************
 * Session flows
 ***********************/
function startSession(type) {
  pendingSessionType = type; // ici "instagram"
  showIntent();
}

function cancelIntent() {
  pendingSessionType = null;
  showMenu();
}

function setIntentAndStart(intent) {
  // log intention
  const intents = getIntents();
  intents.push({
    date: Engine.todayKey(),
    ts: Date.now(),
    intent,
    sessionType: pendingSessionType
  });
  setIntents(intents);

  // intention faible -> coach
  if (intent === "auto") {
    alert("Intention faible détectée. Coach recommandé.");
    launchCoach();
    return;
  }

  // Data-driven: on comptabilise 10 min au moment de l'autorisation
  saveSession(10);

  // rafraîchir l’UI avant de quitter
  updateContextAndBrief();
  drawChart();
  renderPrediction();
  renderProfile();
  renderIntentStats();

  // lancer le raccourci iOS (minuteur natif + ouverture Instagram)
  setTimeout(() => {
    window.location.href =
      "shortcuts://run-shortcut?name=" +
      encodeURIComponent("Mini Jarvis GO");
  }, 300);
}

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
 * Stats rendering
 ***********************/
function drawChart() {
  if (!has("chart")) return;
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");

  const history = getHistory();
  const data = Engine.last7DaysData(history);

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
  const history = getHistory();
  const pred = Engine.trendPrediction(history, THRESH_ORANGE, THRESH_RED);

  $("prediction").innerText =
    `Moyenne 7j : ${pred.avg} min/j. ${pred.trendText} ` +
    `Projection semaine : ${pred.weeklyProjection} min. Risque : ${pred.risk}.`;
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
    `Profil: Useful ${behavior.useful || 0} | Easy ${behavior.easy || 0} (Easy ${easyRate}%). ` +
    `Pression: ${pressure}/3. ${interpretation}`;
}

function renderIntentStats() {
  if (!has("intentStats")) return;

  const intents = getIntents();
  const s = Engine.intentStats7d(intents);

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
    lastSrc: Storage.get("lastSrc", null)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `mini-jarvis-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/***********************
 * Coach choice logging
 ***********************/
function logChoice(type) {
  const choiceStats = getChoiceStats();
  choiceStats[type] = (choiceStats[type] || 0) + 1;
  setChoiceStats(choiceStats);

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

/***********************
 * Init
 ***********************/
(function init() {
  showMenu();

  storeSourceFromURL();

  // ping + boucle (désactivée en debug)
  const pings = recordOpenPing();
  const loop = Engine.loopStatus(pings);

  if (!IS_DEBUG && loop.inLoop) {
    showLoopAlert(loop.count15);
    applyLoopRestriction();
    launchCoach();
  } else {
    updateContextAndBrief();
  }

  drawChart();
  renderPrediction();
  renderProfile();
  renderIntentStats();
})();
