// import-export.js
function validatePayload(p) {
  if (!p || typeof p !== "object") return { ok: false, msg: "Fichier invalide." };

  // v2+ recommandé
  const events = Array.isArray(p.events) ? p.events : null;
  const legacy = Array.isArray(p.history) && Array.isArray(p.intents);

  if (!events && !legacy) return { ok: false, msg: "events manquants (ou ancien export history/intents)." };

  // sanity checks
  if (events) {
    if (events.length > 20000) return { ok: false, msg: "Trop d’événements (fichier suspect)." };
    for (const e of events.slice(0, 50)) {
      if (!e || typeof e !== "object") return { ok: false, msg: "events corrompus." };
    }
  }

  return { ok: true };
}

function applyReplace(p) {
  // Source de vérité
  if (Array.isArray(p.events)) localStorage.setItem("events", JSON.stringify(p.events));
  else localStorage.setItem("events", JSON.stringify([]));

  // Settings optionnels
  if (p._meta) localStorage.setItem("_meta", JSON.stringify(p._meta));
  if (p.lastSrc) localStorage.setItem("lastSrc", JSON.stringify(p.lastSrc));

  // Nettoyage legacy
  localStorage.removeItem("history");
  localStorage.removeItem("intents");
  localStorage.removeItem("activeSessionId");

  // erreurs/diag
  if (p._lastError) localStorage.setItem("_lastError", JSON.stringify(p._lastError));
}

window.ImportExport = {
  validate: validatePayload,
  applyReplace
};
