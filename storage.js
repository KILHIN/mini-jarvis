/* =========================================================
   STORAGE LAYER — Single Source of Truth
   ========================================================= */

/* ---------------------------------------------------------
   1) CORE STORAGE WRAPPER
   --------------------------------------------------------- */

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Storage.get parse error:", key);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage.set failed:", key);
      // fallback minimal protection
      alert("Stockage saturé ou erreur locale.");
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },

  clearAll() {
    try {
      localStorage.clear();
    } catch {}
  }
};


/* ---------------------------------------------------------
   2) META (Schema versioning)
   --------------------------------------------------------- */

function getMeta() {
  return Storage.get("_meta", { schemaVersion: 1 });
}

function setMeta(meta) {
  Storage.set("_meta", meta);
}

/*
  ensureSchema()
  - permet de migrer les données anciennes
  - ne casse jamais les données existantes
*/
function ensureSchema() {
  const meta = getMeta();
  const currentVersion = meta.schemaVersion || 1;

  /* -------------------------
     v1 → v2
     - Ajout minutesPlanned sur allow
  ------------------------- */

  if (currentVersion < 2) {
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

  /* -------------------------
     Future migrations go here
  ------------------------- */
}


/* ---------------------------------------------------------
   3) SAFE HELPERS (future-proof)
   --------------------------------------------------------- */

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}


/* ---------------------------------------------------------
   4) DEV UTILITIES (optional)
   --------------------------------------------------------- */

function debugDump() {
  return {
    meta: Storage.get("_meta", null),
    events: Storage.get("events", []),
    activeSessionId: Storage.get("activeSessionId", null),
    lastError: Storage.get("_lastError", null)
  };
}


/* ---------------------------------------------------------
   5) EXPORT GLOBAL
   --------------------------------------------------------- */

window.Storage = Storage;
window.ensureSchema = ensureSchema;