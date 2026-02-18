/* =========================================================
   ENGINE — Analytics & Decision Core
   Pure logic. No DOM. No Storage.
   ========================================================= */

const Engine = {};

/* =========================================================
   1) TIME HELPERS
   ========================================================= */

Engine.todayKey = function() {
  return new Date().toDateString();
};

Engine.totalToday = function(events) {
  const today = this.todayKey();
  return events
    .filter(e => e.date === today)
    .reduce((sum, e) => sum + (e.minutes || 0), 0);
};

/* =========================================================
   2) COACH (ADAPTIVE + LEARNING SAFE VERSION)
   ========================================================= */

Engine.coachSuggestion = function({
  events,
  thresholds,
  openPings = [],
  nowDate = new Date()
}){

  const { THRESH_ORANGE, THRESH_RED } = thresholds;

  const risk = Analytics.computeRisk({
    events,
    thresholds,
    openPings,
    now: nowDate
  });

  const profile = Analytics.computeProfile({ events });

  const performance = Analytics.actionPerformance
    ? Analytics.actionPerformance(events)
    : { primary:0, alt1:0, alt2:0 };

  const actions = {
    primary: "10 min — tâche unique, téléphone hors pièce.",
    alt1: "10 min — marche sans téléphone.",
    alt2: "5 min — respiration 4/6."
  };

  // --- Base logic (strict first)
  let baseKey = "primary";

  if (risk.score >= 80) baseKey = "alt1";
  else if (risk.score >= 65) baseKey = "alt1";
  else if (profile.traits.some(t => t.key === "night")) baseKey = "alt2";
  else if (profile.traits.some(t => t.key === "work")) baseKey = "primary";
  else if (profile.traits.some(t => t.key === "auto")) baseKey = "primary";

  // --- Learning adjustment
  const scores = {
    primary: performance.primary,
    alt1: performance.alt1,
    alt2: performance.alt2
  };

  // find best historically effective action
  const best = Object.entries(scores)
    .sort((a,b)=> b[1] - a[1])[0][0];

  // If user consistently succeeds with another action, bias toward it
  let finalKey = baseKey;
  if (scores[best] > scores[baseKey] + 0.5){
    finalKey = best;
  }

  const explanation =
    `Risk ${risk.score}/100 (${risk.tier}).\n` +
    `Profil: ${profile.traits.map(t=>t.key).join(", ") || "stable"}.\n` +
    `Action optimisée via apprentissage.`;

  return `${explanation}\n\nRecommandation:\n• ${actions[finalKey]}`;
};

/* =========================================================
   EXPORT
   ========================================================= */

window.Engine = Engine;