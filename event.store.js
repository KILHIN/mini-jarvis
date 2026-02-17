// events.store.js
function getEvents(){ return Storage.get("events", []); }
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

// Expose minimal API
window.EventsStore = {
  getEvents,
  setEvents,
  addEvent,
  findEventIndexBySessionId
};

