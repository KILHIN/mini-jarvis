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
  nowDate = new Date()
}) {

  const { THRESH_ORANGE, THRESH_RED } = thresholds;

  const hour = nowDate.getHours();
  const day = nowDate.getDay();
  const isWeekend = (day === 0 || day === 6);

  const totalToday = this.totalToday(events);
  const trend = this.trendPrediction(events, THRESH_ORANGE, THRESH_RED);
  const pressure = this.jarvisPressure(events);
  const intents7 = this.intentStats7d(events);

  const state = this.stateFromThresholds(
    totalToday,
    trend.avg,
    THRESH_ORANGE,
    THRESH_RED
  );

  const actions = {
    focus: [
      { title: "10 min — micro-tâche utile", steps: "Choisis 1 tâche claire. 10 min. Exécution pure." },
      { title: "8 min — inbox", steps: "5 messages ou 1 mail. Stop net." }
    ],
    body: [
      { title: "10 min — marche", steps: "Sans téléphone. Retour au calme." },
      { title: "5 min — respiration", steps: "4s inspire / 6s expire." }
    ],
    brain: [
      { title: "10 min — lecture", steps: "5 pages. Zéro multitâche." },
      { title: "7 min — écriture", steps: "3 lignes : ce que tu veux vraiment faire." }
    ]
  };

  let poolPrimary = actions.brain;
  let poolSecondary = actions.body;

  if (!isWeekend && hour >= 9 && hour <= 18) {
    poolPrimary = actions.focus;
    poolSecondary = actions.brain;
  } else if (hour >= 21) {
    poolPrimary = actions.body;
  }

  const friction =
    `Total aujourd’hui: ${totalToday} min | Etat: ${state}. ${trend.trendText} | Pression: ${pressure}/3.` +
    (intents7.total ? ` | Auto (7j): ${intents7.pAuto}%.` : "");

  if (state === "RED") {
    const pick = poolSecondary[0];
    return `Analyse: surcharge détectée.\n${friction}\n\nRecommandation:\n• ${pick.title}\n${pick.steps}`;
  }

  if (state === "ORANGE") {
    const pick = (pressure >= 2) ? actions.body[0] : poolPrimary[0];
    return `Analyse: dérive modérée.\n${friction}\n\nRecommandation:\n• ${pick.title}\n${pick.steps}`;
  }

  const pick = (pressure >= 2) ? actions.focus[0] : poolPrimary[1];
  return `Analyse: contrôle acceptable.\n${friction}\n\nOptimisation:\n• ${pick.title}\n${pick.steps}`;
};


/* =========================================================
   EXPORT
   ========================================================= */

window.Engine = Engine;