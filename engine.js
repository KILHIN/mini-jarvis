/* =========================================================
   ENGINE — Analytics & Decision Core
   Pure logic. No DOM. No Storage.
   ========================================================= */

const Engine = {};
const performance = Analytics.actionPerformance(events);

/* =========================================================
   1) TIME HELPERS
   ========================================================= */

Engine.todayKey = function() {
  return new Date().toDateString();
};

Engine.last7DaysMap = function(events) {
  const data = {};
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    data[d.toDateString()] = 0;
  }

  events.forEach(e => {
    if (data[e.date] !== undefined) {
      data[e.date] += (e.minutes || 0);
    }
  });

  return data;
};

Engine.totalToday = function(events) {
  const today = this.todayKey();
  return events
    .filter(e => e.date === today)
    .reduce((sum, e) => sum + (e.minutes || 0), 0);
};

/* =========================================================
   2) TREND & RISK
   ========================================================= */

Engine.trendPrediction = function(events, THRESH_ORANGE, THRESH_RED) {
  const values = Object.values(this.last7DaysMap(events));
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  const prev3 = (values[0] + values[1] + values[2]) / 3;
  const last3 = (values[4] + values[5] + values[6]) / 3;
  const delta = last3 - prev3;

  let trendText = "Tendance: stable.";
  if (delta > 5) trendText = "Tendance: augmentation.";
  else if (delta < -5) trendText = "Tendance: baisse.";

  let risk = "faible";
  if (avg >= THRESH_RED) risk = "élevé";
  else if (avg >= THRESH_ORANGE) risk = "modéré";

  return {
    avg: Math.round(avg),
    weeklyProjection: Math.round(avg * 7),
    trendText,
    risk
  };
};

Engine.stateFromThresholds = function(totalToday, avg7, THRESH_ORANGE, THRESH_RED) {
  if (totalToday >= THRESH_RED || avg7 >= THRESH_RED) return "RED";
  if (totalToday >= THRESH_ORANGE || avg7 >= THRESH_ORANGE) return "ORANGE";
  return "GREEN";
};

/* =========================================================
   3) INTENT & PRESSURE
   ========================================================= */

Engine.intentStats7d = function(events) {
  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000;

  const recent = events.filter(e =>
    e.intent &&
    e.ts &&
    (now - e.ts <= windowMs)
  );

  const counts = { reply: 0, fun: 0, auto: 0, total: 0 };

  recent.forEach(e => {
    if (counts[e.intent] !== undefined) counts[e.intent]++;
    counts.total++;
  });

  const pct = n => counts.total === 0 ? 0 : Math.round((n / counts.total) * 100);

  return {
    total: counts.total,
    pReply: pct(counts.reply),
    pFun: pct(counts.fun),
    pAuto: pct(counts.auto)
  };
};

Engine.jarvisPressure = function(events) {
  const coachEvents = events.filter(e => e.mode === "coach");
  const total = coachEvents.length;
  if (total < 5) return 0;

  const easy = coachEvents.filter(e => e.choice !== "primary").length;
  const easyRate = easy / total;

  if (easyRate >= 0.75) return 3;
  if (easyRate >= 0.60) return 2;
  if (easyRate >= 0.45) return 1;
  return 0;
};

/* =========================================================
   4) LOOP DETECTION
   ========================================================= */

Engine.loopStatus = function(openPings) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;

  const recent = openPings.filter(t => now - t <= windowMs);

  return {
    count15: recent.length,
    inLoop: recent.length >= 3
  };
};

/* =========================================================
   5) COACH GENERATOR
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

  const hour = nowDate.getHours();
  const isLate = hour >= 22;

  const actions = {
    deepFocus: "10 min — tâche unique, téléphone hors pièce.",
    walk: "10 min — marche sans téléphone.",
    breathing: "5 min — respiration 4/6.",
    microTask: "8 min — traite 1 tâche précise.",
    friction: "Écris pourquoi tu ouvres Instagram (1 phrase).",
    reading: "10 min — lecture concentrée.",
    hardStop: "Stop net. Écran fermé 15 min."
  };

  let recommendation = actions.reading;
  let reason = "";

  // 🔥 STRICT MODE LOGIC

  if (risk.score >= 80) {
    recommendation = actions.hardStop;
    reason = "Risque critique détecté.";
  }

  else if (risk.score >= 65) {
    recommendation = actions.walk;
    reason = "Risque élevé.";
  }

  else if (profile.traits.some(t => t.key === "night")) {
    recommendation = actions.breathing;
    reason = "Usage tardif détecté.";
  }

  else if (profile.traits.some(t => t.key === "work")) {
    recommendation = actions.microTask;
    reason = "Fuite en heures productives.";
  }

  else if (profile.traits.some(t => t.key === "auto")) {
    recommendation = actions.friction;
    reason = "Biais automatique détecté.";
  }

  else if (profile.traits.some(t => t.key === "long")) {
    recommendation = actions.walk;
    reason = "Sessions longues répétées.";
  }

  else if (profile.traits.some(t => t.key === "short")) {
    recommendation = actions.deepFocus;
    reason = "Micro-bursts fréquents.";
  }

  else {
    recommendation = actions.reading;
    reason = "Optimisation légère.";
  }

  const explanation =
    `Risk ${risk.score}/100 (${risk.tier}).\n` +
    `Profil: ${profile.traits.map(t=>t.key).join(", ")}.\n` +
    `Signal dominant: ${reason}`;

  return `${explanation}\n\nRecommandation:\n• ${recommendation}`;
};

// Pondération simple
const actionScores = {
  primary: performance.primary,
  alt1: performance.alt1,
  alt2: performance.alt2
};

// choisir la meilleure action historiquement efficace
const bestAction = Object.entries(actionScores)
  .sort((a,b)=> b[1] - a[1])[0][0];

/* =========================================================
   EXPORT
   ========================================================= */

window.Engine = Engine;