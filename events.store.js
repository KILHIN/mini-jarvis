// events.store.js
function getEvents(){
  const raw = Storage.get("events", []);
  const clean = sanitizeEvents(raw);
  // si nettoyage a changé quelque chose, on réécrit
  if (JSON.stringify(raw) !== JSON.stringify(clean)) Storage.set("events", clean);
  return clean;
}

function setEvents(v){ Storage.set("events", v); }

function addEvent(evt){
  const events = getEvents();
  events.push(evt);
  setEvents(events);
  return evt;
}

function findEventIndexBySessionId(sessionId){
  const events = getEvents();
  return events.findIndex(e => e.sessionId === sessionId);
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const e of events) {
    if (!e || typeof e !== "object") continue;

    // champs minimaux
    const mode = e.mode || e.type || "unknown";
    const ts = Number.isFinite(e.ts) ? e.ts : Date.now();
    const date = typeof e.date === "string" ? e.date : new Date(ts).toDateString();

    // sessionId (si présent) doit être unique
    const sid = typeof e.sessionId === "string" ? e.sessionId : null;
    if (sid) {
      if (seen.has(sid)) continue;
      seen.add(sid);
    }

    // minutes safe
    const minutes = Number.isFinite(e.minutes) ? e.minutes : 0;

    cleaned.push({
      ...e,
      mode,
      ts,
      date,
      minutes
    });
  }

  return cleaned;
}

// Expose minimal API
window.EventsStore = {
  getEvents,
  setEvents,
  addEvent,
  findEventIndexBySessionId
};

