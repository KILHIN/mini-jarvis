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
window.launchCoach = () => window.UI.launchCoach();
window.logChoice = logChoice;
window.exportData = exportData;
window.resetLoop = resetLoop;
window.logOutcome = logOutcome;

/* =========================================================
   8) INIT
   ========================================================= */

(function init(){
  try {
    // 1) Sanity checks
    if (!window.Storage) throw new Error("Storage manquant");
    if (!window.EventsStore) throw new Error("EventsStore manquant (events.store.js)");
    if (!window.Sessions) throw new Error("Sessions manquant (sessions.js)");
    if (!window.Engine) throw new Error("Engine manquant (engine.js)");
    if (!window.UI) throw new Error("UI manquant (ui.js)");

    // 2) Base UI
    window.UI.showMenu();

    // 3) URL params
    const params = new URLSearchParams(window.location.search);
    const src = params.get("src");
    if (src) Storage.set("lastSrc", { src, ts: Date.now() });

    // 4) Session apply + stale finalize
    window.Sessions.applySpentFromURL();
    window.Sessions.finalizeStaleSessionsToZero();

    // 5) Render
    window.UI.renderAll();

    // 6) periodic stale check
    setInterval(() => {
      window.Sessions.finalizeStaleSessionsToZero();
      window.UI.renderAll();
    }, 30000);

  } catch (e) {
    // Fallback visible même sur iPhone (pas besoin de console)
    try { Storage.set("_lastError", { ts:new Date().toISOString(), type:"init", message:String(e) }); } catch {}
    document.body.innerHTML =
      `<div style="padding:16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#fff;background:#0e1117;">
        <h2 style="margin:0 0 10px;">Intent — erreur de chargement</h2>
        <p style="opacity:.8;margin:0 0 10px;">Un script a planté ou manque. Détail :</p>
        <pre style="white-space:pre-wrap;background:rgba(255,255,255,.06);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);">${String(e)}</pre>
        <p style="opacity:.7;margin-top:10px;">Astuce : vérifie qu’il n’y a pas de 404 sur un fichier .js (noms exacts) et que analytics.js / ui.js / engine.js sont bien commit sur GitHub.</p>
      </div>`;
  }
})();