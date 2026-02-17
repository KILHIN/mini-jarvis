if (typeof ensureSchema === "function") ensureSchema();

// main.js
let pendingSessionType = null;
let timerInterval = null;

function updateTimerDisplay(seconds){
  const el = document.getElementById("timeDisplay");
  if (!el) return;
  const m = Math.floor(seconds/60);
  const s = seconds % 60;
  el.innerText = `${m}:${s<10?"0":""}${s}`;
}

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
    source: pendingSessionType || "instagram",
    minutes: 0,            // ✅ pas de comptage immédiat
    minutesPlanned: 10,
    minutesActual: null,
    intent,
    mode: "allow",
    sessionId: sid,
    startedAt: now
  });

  window.Sessions.setActiveSessionId(sid);

  // UI refresh (tu vois “session en cours”)
  window.UI.renderAll();

  // Lance le raccourci GO + passe sid automatiquement
  setTimeout(() => {
    window.location.href =
      "shortcuts://run-shortcut?name=" + encodeURIComponent("Mini Jarvis GO") +
      "&input=text&text=" + encodeURIComponent(sid);
  }, 250);
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

function logChoice(type){
  // Coach choice -> event (minutes 0)
  window.EventsStore.addEvent({
    ts: Date.now(),
    date: Engine.todayKey(),
    source: "coach",
    minutes: 0,
    intent: null,
    mode: "coach",
    choice: type
  });

  alert("Choix enregistré.");
  location.reload();
}

function exportData(){
  const payload = {
    exportedAt: new Date().toISOString(),
    config: { THRESH_ORANGE: 30, THRESH_RED: 60 },
    events: window.EventsStore.getEvents(),
    behavior: Storage.get("behavior", { useful:0, easy:0 }),
    lastSrc: Storage.get("lastSrc", null)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
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
  Storage.remove("openPings");
  alert("openPings reset.");
  location.reload();
}

// Expose globals used by HTML onclick
window.startSession = startSession;
window.cancelIntent = cancelIntent;
window.setIntentAndStart = setIntentAndStart;
window.startPause = startPause;
window.launchCoach = () => window.UI.launchCoach();
window.logChoice = logChoice;
window.exportData = exportData;
window.resetLoop = resetLoop;

window.addEventListener("error", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(),
      message: e.message,
      source: e.filename,
      line: e.lineno,
      col: e.colno
    });
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    Storage.set("_lastError", {
      ts: new Date().toISOString(),
      message: String(e.reason || "Unhandled promise rejection")
    });
  } catch {}
});

// Init
(function init(){
  window.UI.showMenu();

  

  // src param
  const params = new URLSearchParams(window.location.search);
  const src = params.get("src");
  if (src) Storage.set("lastSrc", { src, ts: Date.now() });

  // applique spent si retour END
  window.Sessions.applySpentFromURL();
  window.Sessions.finalizeStaleSessionsToZero();


  // render
  window.UI.renderAll();

  // refresh banner périodique (au cas où)
  setInterval(() => {
  window.Sessions.finalizeStaleSessionsToZero();
  window.UI.renderAll();
}, 30000);

  
})();

