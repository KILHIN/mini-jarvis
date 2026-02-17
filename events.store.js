/* =========================================================
   EVENTS STORE — Single Source of Truth
   ========================================================= */

/* ---------------------------------------------------------
   1) INTERNAL HELPERS
   --------------------------------------------------------- */

function isValidObject(v){
  return v && typeof v === "object";
}

function normalizeEvent(e){
  if (!isValidObject(e)) return null;

  const ts = Number.isFinite(e.ts) ? e.ts : Date.now();

  return {
    // ---- Core identity ----
    id: e.id || (e.sessionId ? e.sessionId : Math.random().toString(36).slice(2)),
    sessionId: typeof e.sessionId === "string" ? e.sessionId : null,

    // ---- Classification ----
    type: e.type || e.mode || "unknown",   // future-proof
    mode: e.mode || e.type || "unknown",

    app: e.app || "instagram",

    // ---- Time ----
    ts,
    date: typeof e.date === "string" ? e.date : new Date(ts).toDateString(),

    startedAt: Number.isFinite(e.startedAt) ? e.startedAt : null,
    endedAt: Number.isFinite(e.endedAt) ? e.endedAt : null,

    // ---- Duration ----
    minutesPlanned: Number.isFinite(e.minutesPlanned) ? e.minutesPlanned : 10,
    minutesActual: Number.isFinite(e.minutesActual) ? e.minutesActual : null,
    minutes: Number.isFinite(e.minutes) ? e.minutes : 0,

    // ---- State flags ----
    intent: typeof e.intent === "string" ? e.intent : null,
    cancelled: !!e.cancelled,
    finalized: !!e.finalized,
    staleFinalized: !!e.staleFinalized
  };
}


/* ---------------------------------------------------------
   2) SANITIZATION
   --------------------------------------------------------- */

function sanitizeEvents(events){
  if (!Array.isArray(events)) return [];

  const seenSessionIds = new Set();
  const cleaned = [];

  for (const raw of events){
    const e = normalizeEvent(raw);
    if (!e) continue;

    // Evite doublon sessionId
    if (e.sessionId){
      if (seenSessionIds.has(e.sessionId)) continue;
      seenSessionIds.add(e.sessionId);
    }

    cleaned.push(e);
  }

  return cleaned;
}


/* ---------------------------------------------------------
   3) PUBLIC API
   --------------------------------------------------------- */

function getEvents(){
  const raw = Storage.get("events", []);
  const clean = sanitizeEvents(raw);

  // Réécriture uniquement si différence de longueur
  if (raw.length !== clean.length){
    Storage.set("events", clean);
  }

  return clean;
}

function setEvents(events){
  const clean = sanitizeEvents(events);
  Storage.set("events", clean);
}

function addEvent(evt){
  const events = getEvents();
  const normalized = normalizeEvent(evt);
  if (!normalized) return null;

  events.push(normalized);
  setEvents(events);
  return normalized;
}

function findEventIndexBySessionId(sessionId){
  if (!sessionId) return -1;
  const events = getEvents();
  return events.findIndex(e => e.sessionId === sessionId);
}


/* ---------------------------------------------------------
   4) ANALYTICS HELPERS (C-READY)
   --------------------------------------------------------- */

function getTodayEvents(){
  const today = new Date().toDateString();
  return getEvents().filter(e => e.date === today);
}

function getTotalMinutesToday(){
  return getTodayEvents().reduce((sum, e) => sum + (e.minutes || 0), 0);
}

function getEventsByType(type){
  return getEvents().filter(e => e.type === type);
}


/* ---------------------------------------------------------
   5) EXPORT GLOBAL
   --------------------------------------------------------- */

window.EventsStore = {
  getEvents,
  setEvents,
  addEvent,
  findEventIndexBySessionId,

  // analytics helpers
  getTodayEvents,
  getTotalMinutesToday,
  getEventsByType
};