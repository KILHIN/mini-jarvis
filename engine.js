const Engine = {
  todayKey() {
    return new Date().toDateString();
  },

  calcTodayTime(history) {
    const t = this.todayKey();
    return history.filter(e => e.date === t).reduce((s, e) => s + e.duration, 0);
  },

  last7DaysData(history) {
    const data = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      data[d.toDateString()] = 0;
    }
    history.forEach(e => {
      if (Object.prototype.hasOwnProperty.call(data, e.date)) data[e.date] += e.duration;
    });
    return data;
  },

  trendPrediction(history, THRESH_ORANGE, THRESH_RED) {
    const values = Object.values(this.last7DaysData(history));
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    const prev3 = (values[0] + values[1] + values[2]) / 3;
    const last3 = (values[4] + values[5] + values[6]) / 3;
    const delta = last3 - prev3;

    let trendText = "Tendance: stable.";
    if (delta > 5) trendText = "Tendance: augmentation.";
    else if (delta < -5) trendText = "Tendance: baisse.";

    const weeklyProjection = Math.round(avg * 7);

    let risk = "faible";
    if (avg >= THRESH_RED) risk = "élevé";
    else if (avg >= THRESH_ORANGE) risk = "modéré";

    return { avg: Math.round(avg), weeklyProjection, trendText, risk };
  },

  jarvisPressure(behavior) {
    const total = (behavior.useful || 0) + (behavior.easy || 0);
    if (total < 5) return 0;
    const easyRate = (behavior.easy || 0) / total;
    if (easyRate >= 0.75) return 3;
    if (easyRate >= 0.60) return 2;
    if (easyRate >= 0.45) return 1;
    return 0;
  },

  intentStats7d(intents) {
    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const recent = intents.filter(x => now - x.ts <= windowMs);

    const counts = { reply: 0, fun: 0, auto: 0, total: 0 };
    recent.forEach(x => {
      if (counts[x.intent] !== undefined) counts[x.intent]++;
      counts.total++;
    });

    const pct = (n) => counts.total === 0 ? 0 : Math.round((n / counts.total) * 100);

    return {
      total: counts.total,
      pReply: pct(counts.reply),
      pFun: pct(counts.fun),
      pAuto: pct(counts.auto)
    };
  },

  intentStatsToday(intents) {
    const t = this.todayKey();
    const today = intents.filter(x => x.date === t);

    const counts = { reply: 0, fun: 0, auto: 0, total: 0 };
    today.forEach(x => {
      if (counts[x.intent] !== undefined) counts[x.intent]++;
      counts.total++;
    });

    const pct = (n) => counts.total === 0 ? 0 : Math.round((n / counts.total) * 100);

    return {
      total: counts.total,
      pAuto: pct(counts.auto),
      pConscious: pct(counts.reply + counts.fun)
    };
  },

  // Boucle (pure)
  loopStatus(openPings) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const recent = openPings.filter(t => now - t <= windowMs);
    return { count15: recent.length, inLoop: recent.length >= 3 };
  },

  // Générateur de texte Jarvis (pure)
  coachSuggestion({ history, behavior, thresholds, intents7, nowDate = new Date() }) {
    const { THRESH_ORANGE, THRESH_RED } = thresholds;

    const hour = nowDate.getHours();
    const day = nowDate.getDay();
    const isWeekend = (day === 0 || day === 6);

    const totalToday = this.calcTodayTime(history);
    const pred = this.trendPrediction(history, THRESH_ORANGE, THRESH_RED);
    const pressure = this.jarvisPressure(behavior);

    const sessionCountToday = history.filter(e => e.date === this.todayKey()).length;

    let state = "GREEN";
    if (totalToday >= THRESH_RED || pred.avg >= THRESH_RED) state = "RED";
    else if (totalToday >= THRESH_ORANGE || pred.avg >= THRESH_ORANGE) state = "ORANGE";

    const actions = {
      focus: [
        { title: "10 min — micro-tâche utile", steps: "Choisis 1 truc concret. Timer 10 min. Exécution pure." },
        { title: "8 min — inbox / messages", steps: "Traite 5 messages ou 1 mail. Stop après." },
        { title: "10 min — rangement express", steps: "Une zone. Résultat visible en 10 min." }
      ],
      body: [
        { title: "6 min — mobilité", steps: "Cou + épaules + hanches. 3 mouvements, 2 minutes chacun." },
        { title: "10 min — marche", steps: "Sans téléphone. Revenir lucide." },
        { title: "5 min — respiration", steps: "4s inspire / 6s expire, 5 minutes." }
      ],
      brain: [
        { title: "10 min — lecture", steps: "5 pages. Pas de multitâche." },
        { title: "10 min — apprentissage", steps: "Mini contenu + note 3 points." },
        { title: "7 min — écriture", steps: "3 lignes: ce que tu veux vraiment faire aujourd’hui." }
      ],
      social: [
        { title: "3 min — message utile", steps: "Message simple et positif." },
        { title: "10 min — appel court", steps: "10 min max. Un vrai échange." },
        { title: "5 min — planification", steps: "Propose un café / sport / sortie." }
      ]
    };

    let poolPrimary = actions.brain, poolSecondary = actions.body, poolTertiary = actions.focus;
    if (!isWeekend && hour >= 9 && hour <= 18) {
      poolPrimary = actions.focus; poolSecondary = actions.brain; poolTertiary = actions.body;
    } else if (hour >= 21) {
      poolPrimary = actions.body; poolSecondary = actions.brain; poolTertiary = actions.social;
    }

    const friction =
      `Sessions aujourd’hui: ${sessionCountToday}. Total: ${totalToday} min. ` +
      `Etat: ${state}. ${pred.trendText} | Pression: ${pressure}/3.` +
      (intents7 && intents7.total ? ` | Intent Auto (7j): ${intents7.pAuto}%.` : "");

    if (state === "RED") {
      const pick = poolSecondary[0];
      const alt1 = actions.body[1];
      const alt2 = actions.brain[0];
      return `Analyse: surcharge détectée.\n${friction}\n\nRecommandation:\n• ${pick.title}\nProchain pas: ${pick.steps}\n\nAlternatives:\n• ${alt1.title}\n• ${alt2.title}`;
    }

    if (state === "ORANGE") {
      const pick = (pressure >= 2) ? actions.body[1] : poolPrimary[0];
      const alt1 = (pressure >= 2) ? actions.brain[2] : poolSecondary[0];
      const alt2 = (pressure >= 2) ? actions.social[0] : poolTertiary[0];
      const header = (pressure >= 2) ? "Analyse: dérive modérée. Correction imposée." : "Analyse: dérive modérée.";
      return `${header}\n${friction}\n\nRecommandation:\n• ${pick.title}\nProchain pas: ${pick.steps}\n\nAlternatives:\n• ${alt1.title}\n• ${alt2.title}`;
    }

    const pick = (pressure >= 2) ? actions.focus[0] : poolPrimary[1];
    const alt1 = (pressure >= 2) ? actions.body[0] : poolSecondary[1];
    const alt2 = (pressure >= 2) ? actions.brain[2] : poolTertiary[1];
    const header = (pressure >= 2) ? "Analyse: contrôle acceptable. Optimisation requise." : "Analyse: contrôle acceptable.";
    return `${header}\n${friction}\n\nRecommandation:\n• ${pick.title}\nProchain pas: ${pick.steps}\n\nAlternatives:\n• ${alt1.title}\n• ${alt2.title}`;
  }
};

Engine.calcTodayTimeFromEvents = function(events) {
  const t = this.todayKey();
  return events
    .filter(e => e.date === t)
    .reduce((s, e) => s + (e.minutes || 0), 0);
};

Engine.last7DaysDataFromEvents = function(events) {
  const data = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    data[d.toDateString()] = 0;
  }
  events.forEach(e => {
    if (Object.prototype.hasOwnProperty.call(data, e.date)) {
      data[e.date] += (e.minutes || 0);
    }
  });
  return data;
};

Engine.trendPredictionFromEvents = function(events, THRESH_ORANGE, THRESH_RED) {
  const values = Object.values(this.last7DaysDataFromEvents(events));
  const sum = values.reduce((a,b) => a + b, 0);
  const avg = sum / values.length;

  const prev3 = (values[0] + values[1] + values[2]) / 3;
  const last3 = (values[4] + values[5] + values[6]) / 3;
  const delta = last3 - prev3;

  let trendText = "Tendance: stable.";
  if (delta > 5) trendText = "Tendance: augmentation.";
  else if (delta < -5) trendText = "Tendance: baisse.";

  const weeklyProjection = Math.round(avg * 7);

  let risk = "faible";
  if (avg >= THRESH_RED) risk = "élevé";
  else if (avg >= THRESH_ORANGE) risk = "modéré";

  return { avg: Math.round(avg), weeklyProjection, trendText, risk };
};

Engine.intentStats7dFromEvents = function(events) {
  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter(e => (e.ts || 0) && (now - e.ts <= windowMs));

  const counts = { reply: 0, fun: 0, auto: 0, total: 0 };
  recent.forEach(e => {
    if (counts[e.intent] !== undefined) counts[e.intent]++;
    counts.total++;
  });

  const pct = (n) => counts.total === 0 ? 0 : Math.round((n / counts.total) * 100);
  return {
    total: counts.total,
    pReply: pct(counts.reply),
    pFun: pct(counts.fun),
    pAuto: pct(counts.auto)
  };
};

