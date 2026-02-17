const Storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

function getMeta(){ return Storage.get("_meta", { schemaVersion: 1 }); }
function setMeta(m){ Storage.set("_meta", m); }

function ensureSchema() {
  const meta = getMeta();
  const v = meta.schemaVersion || 1;

  // v1 -> v2 : on s’assure que minutesPlanned existe sur allow
  if (v < 2) {
    const events = Storage.get("events", []);
    let changed = false;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e?.mode === "allow") {
        if (e.minutesPlanned == null) {
          events[i] = { ...e, minutesPlanned: 10 };
          changed = true;
        }
      }
    }

    if (changed) Storage.set("events", events);

    meta.schemaVersion = 2;
    setMeta(meta);
  }
}
