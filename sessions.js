// sessions.js
function newSessionId(){
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function setActiveSessionId(sid){ Storage.set("activeSessionId", sid); }
function getActiveSessionId(){ return Storage.get("activeSessionId", null); }
function clearActiveSessionId(){ Storage.remove("activeSessionId"); }

function getActiveSession(events){
  const now = Date.now();
  const maxAgeMs = 3 * 60 * 60 * 1000; // 3h
  const activeId = getActiveSessionId();

  if (activeId){
    const e = events.find(x => x.sessionId === activeId);
    if (e && e.mode === "allow" && e.minutesActual == null && !e.cancelled && e.startedAt && (now - e.startedAt) <= maxAgeMs) {
      return e;
    }
  }

  for (let i = events.length - 1; i >= 0; i--){
    const e = events[i];
    if (e.mode === "allow" && e.minutesActual == null && !e.cancelled && e.startedAt && (now - e.startedAt) <= maxAgeMs) {
      return e;
    }
  }
  return null;
}

function stopActiveSession(){
  const events = window.EventsStore.getEvents();
  const active = getActiveSession(events);

  if (!active) {
    alert("Aucune session active à arrêter.");
    return;
  }

  const ok = confirm("Arrêter la session en cours ? (Elle comptera 0 min)");
  if (!ok) return;

  const idx = events.findIndex(e => e.sessionId === active.sessionId);
  if (idx === -1) return;

  events[idx] = {
    ...events[idx],
    cancelled: true,
    endedAt: Date.now(),
    minutesActual: 0,
    minutes: 0
  };

  window.EventsStore.setEvents(events);
  clearActiveSessionId();
}

function applySpentFromURL(){
  try{
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sid");
    const spentRaw = params.get("spent");

    if (!sid || spentRaw === null) return;

    const spent = Number.parseInt(spentRaw, 10);
    if (!Number.isFinite(spent) || spent < 0 || spent > 240) return;

    const events = window.EventsStore.getEvents();
    const idx = events.findIndex(e => e.sessionId === sid);
    if (idx === -1) return;
    if (events[idx]?.cancelled) return; // STOP utilisé

    events[idx] = {
      ...events[idx],
      minutesActual: spent,
      minutes: spent,
      endedAt: Date.now()
    };

    window.EventsStore.setEvents(events);

    const activeId = getActiveSessionId();
    if (activeId === sid) clearActiveSessionId();

    // Nettoie l’URL
    params.delete("sid");
    params.delete("spent");
    const clean = params.toString();
    const newUrl = window.location.pathname + (clean ? `?${clean}` : "");
    window.history.replaceState({}, "", newUrl);
  } catch(e){
    console.warn("applySpentFromURL error:", e);
  }
}

function formatHHMM(ts){
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${hh}:${mm}`;
}

window.Sessions = {
  newSessionId,
  setActiveSessionId,
  getActiveSessionId,
  clearActiveSessionId,
  getActiveSession,
  stopActiveSession,
  applySpentFromURL,
  formatHHMM
};

