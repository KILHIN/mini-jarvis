/* =========================================================
   MAIN — Application Orchestrator
   - No analytics logic
   - No DOM rendering logic
   - Only flow & coordination
   ========================================================= */

/* =========================================================
   1) BOOTSTRAP
   ========================================================= */

if (typeof ensureSchema === "function") ensureSchema();

const DEV_MODE = false;

let pendingSessionType = null;
let timerInterval = null;

/* =========================================================
   2) TIMER (Pause only)
   ========================================================= */

function updateTimerDisplay(seconds){
  const el = document.getElementById("timeDisplay");
  if (!el) return;

  const m = Math.floor(seconds/60);
  const s = seconds % 60;
  el.innerText = `${m}:${s<10?"0":""}${s}`;
}

function startPause(){
  window.UI.showTimer();

  let timeLeft = 120;
  updateTimerDisplay(timeLeft);

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay(timeLeft);

    if (timeLeft <= 0){
      clearInterval(timerInterval);
      alert("Pause terminée. Décision consciente requise.");
      location.reload();
    }
  }, 1000);
}

/* =========================================================
   3) SESSION FLOW (Instagram)
   ========================================================= */

function startSession(type){
  pendingSessionType = type;
  window.UI.showIntent();
}

function cancelIntent(){
  pendingSessionType = null;
  window.UI.showMenu();
}

function setIntentAndStart(intent){

  if (intent === "auto"){
    alert("Intention faible détectée. Coach recommandé.");
    window.UI.launchCoach();
    return;
  }

  const sid = window.Sessions.newSessionId();
  const now = Date.now();

  window.EventsStore.addEvent({
    ts: now,
    date: Engine.todayKey(),
    type: "allow",
    mode: "allow",
    app: pendingSessionType || "instagram",
    minutes: 0,
    minutesPlanned: 10,
    minutesActual: null,
    intent,
    sessionId: sid,
    startedAt: now
  });

  window.Sessions.setActiveSessionId(sid);

  window.UI.renderAll();

  // Launch iOS Shortcut
  setTimeout(() => {
    window.location.href =
      "shortcuts://run-shortcut?name=" +
      encodeURIComponent("Mini Jarvis GO") +
      "&input=text&text=" +
      encodeURIComponent(sid);
  }, 250);
}

/* =========================================================
   4) COACH
   ========================================================= */

function logChoice(type){
  window.EventsStore.addEvent({
    ts: Date.now(),
    date: Engine.todayKey(),
    type: "coach",
    mode: "coach",
    app: "system",
    minutes: 0,
    intent: null,
    choice: type
  });

  alert("Choix enregistré.");
  location.reload();
}

/* =========================================================
   5) DATA EXPORT
   ========================================================= */

function exportData(){
  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: Storage.get("_meta", {}).schemaVersion || 1,
    events: window.EventsStore.getEvents(),
    lastError: Storage.get("_lastError", null)
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type:"application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intent-export-${new Date().toISOString().slice(0,10)}.json`;

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetLoop(){
  if (!DEV_MODE) return;

  Storage.remove("openPings");
  alert("openPings reset.");
  location.reload();
}
function logOutcome(result){

  const lastCoach = window.EventsStore.getEvents()
    .slice().reverse()
    .find(e => e.mode === "coach");

  if (!lastCoach) return;

  window.EventsStore.addEvent({
    ts: Date.now(),
    date: Engine.todayKey(),
    type: "outcome",
    mode: "outcome",
    app: "system",
    minutes: 0,
    actionKey: lastCoach.choice,
    result
  });

  alert("Outcome enregistré.");
  location.reload();
}
/* =========================================================
   6) ERROR SHIELD
   ========================================================= */

window.addEventListener("error", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(),
      type: "error",
      message: e.message || "Unknown error",
      source: e.filename || "",
      line: e.lineno || null,
      col: e.colno || null
    });
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(),
      type: "unhandledrejection",
      message: String(e.reason || "Unhandled promise rejection")
    });
  } catch {}
});

/* =========================================================
   7) GLOBAL EXPORTS (HTML onclick)
   ========================================================= */

window.startSession = startSession;
window.cancelIntent = cancelIntent;
window.setIntentAndStart = setIntentAndStart;
window.startPause = startPause;
window.launchCoach = () => window.UI.launchCoach();
window.logChoice = logChoice;
window.exportData = exportData;
window.resetLoop = resetLoop;

/* =========================================================
   8) INIT
   ========================================================= */

(function init(){

  window.UI.showMenu();

  const params = new URLSearchParams(window.location.search);

  const src = params.get("src");
  if (src) {
    Storage.set("lastSrc", { src, ts: Date.now() });
  }

  window.Sessions.applySpentFromURL();
  window.Sessions.finalizeStaleSessionsToZero();

  window.UI.renderAll();

  // periodic stale check
  setInterval(() => {
    window.Sessions.finalizeStaleSessionsToZero();
    window.UI.renderAll();
  }, 30000);

})();