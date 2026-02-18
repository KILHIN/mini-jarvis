/* =========================================================
   ANALYTICS — Risk score & profile (Strict mode A)
   Pure functions. No DOM. No Storage.
   ========================================================= */

const Analytics = {};

/* ---------------------------
   Helpers
---------------------------- */

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function minutesToday(events){
  const today = new Date().toDateString();
  return events.filter(e => e.date === today).reduce((s,e)=> s + (e.minutes||0), 0);
}

function recentAllowEvents(events, days=7){
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  return events.filter(e => e.mode === "allow" && e.ts && (now - e.ts <= windowMs));
}

function loopStatus(openPings){
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recent = (openPings || []).filter(t => now - t <= windowMs);
  return { count15: recent.length, inLoop: recent.length >= 3 };
}

/* ---------------------------
   Reasons (explainability)
---------------------------- */

function pushReason(reasons, code, detail, weight){
  reasons.push({ code, detail, weight });
}

/* ---------------------------
   Strict Risk Score (0–100)
---------------------------- */

Analytics.computeRisk = function({
  events,
  thresholds,
  openPings = [],
  now = new Date()
}){
  const THRESH_ORANGE = thresholds.THRESH_ORANGE;
  const THRESH_RED = thresholds.THRESH_RED;

  const totalToday = minutesToday(events);

  // Trend via Engine (déjà robuste)
  const trend = Engine.trendPrediction(events, THRESH_ORANGE, THRESH_RED); // avg, delta implied by trendText
  const intents7 = Engine.intentStats7d(events); // pAuto
  const pressure = Engine.jarvisPressure(events); // 0..3
  const loop = loopStatus(openPings);

  const hour = now.getHours();
  const isLate = hour >= 22;          // strict
  const isWork = hour >= 9 && hour <= 18; // strict

  // ---------------- Score components (strict)
  // Base
  let score = 8;
  const reasons = [];

  // A) Today minutes vs thresholds (heavy)
  if (totalToday >= THRESH_RED) {
    score += 42;
    pushReason(reasons, "TODAY_RED", `Temps aujourd’hui >= ${THRESH_RED}m`, 42);
  } else if (totalToday >= THRESH_ORANGE) {
    const part = clamp((totalToday - THRESH_ORANGE) / (THRESH_RED - THRESH_ORANGE), 0, 1);
    const add = Math.round(24 + 12 * part); // 24..36
    score += add;
    pushReason(reasons, "TODAY_ORANGE", `Temps aujourd’hui >= ${THRESH_ORANGE}m`, add);
  } else {
    // même en vert, on ajoute un peu si > 15m
    if (totalToday >= 15){
      const add = Math.round(6 * (totalToday / THRESH_ORANGE)); // 3..6
      score += add;
      pushReason(reasons, "TODAY_BUILDUP", `Temps aujourd’hui ${totalToday}m`, add);
    }
  }

  // B) Trend (strict)
  if (trend.trendText.includes("augmentation")) {
    score += 14;
    pushReason(reasons, "TREND_UP", "Tendance en augmentation (7j)", 14);
  } else if (trend.trendText.includes("baisse")) {
    score -= 6;
    pushReason(reasons, "TREND_DOWN", "Tendance en baisse (7j)", -6);
  }

  // C) Auto intent (very heavy strict)
  if (intents7.total >= 4) {
    if (intents7.pAuto >= 60) {
      score += 26;
      pushReason(reasons, "AUTO_HIGH", `Auto élevé (${intents7.pAuto}%)`, 26);
    } else if (intents7.pAuto >= 40) {
      score += 16;
      pushReason(reasons, "AUTO_MED", `Auto modéré (${intents7.pAuto}%)`, 16);
    } else if (intents7.pAuto >= 25) {
      score += 8;
      pushReason(reasons, "AUTO_LOW", `Auto présent (${intents7.pAuto}%)`, 8);
    }
  }

  // D) Loop (very heavy)
  if (loop.inLoop) {
    const add = 22 + Math.min(10, (loop.count15 - 3) * 4); // 22..32
    score += add;
    pushReason(reasons, "LOOP", `Boucle détectée (${loop.count15} ouvertures / 15 min)`, add);
  }

  // E) Pressure (strict)
  if (pressure === 3) { score += 16; pushReason(reasons, "PRESSURE_3", "Évitement systématique", 16); }
  else if (pressure === 2) { score += 10; pushReason(reasons, "PRESSURE_2", "Biais de confort", 10); }
  else if (pressure === 1) { score += 5; pushReason(reasons, "PRESSURE_1", "Dérive légère", 5); }

  // F) Time context (strict)
  if (isLate) { score += 12; pushReason(reasons, "LATE", "Après 22h (fatigue)", 12); }
  if (isWork) { score += 7; pushReason(reasons, "WORK_HOURS", "Heures productives", 7); }

  // Clamp
  score = clamp(Math.round(score), 0, 100);

  // Tier label
  let tier = "faible";
  if (score >= 75) tier = "élevé";
  else if (score >= 45) tier = "modéré";

  // Sort reasons by absolute weight desc, keep top 3
  reasons.sort((a,b) => Math.abs(b.weight) - Math.abs(a.weight));
  const top = reasons.slice(0, 3);

  return {
    score,
    tier,
    topReasons: top,
    debug: {
      totalToday,
      intents7,
      pressure,
      loop,
      trend
    }
  };
};
Analytics.computeProfile = function({ events, now = new Date() }) {
  const allow = events.filter(e => e.mode === "allow" && Number.isFinite(e.minutes));
  if (allow.length < 6) {
    return { traits: [], summary: "Profil: pas assez de données." };
  }

  const isWeekday = (d) => {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  };

  let night = 0, work = 0, auto = 0, shortB = 0, longB = 0, total = 0;

  for (const e of allow) {
    const d = new Date(e.ts || Date.now());
    const h = d.getHours();
    const m = e.minutes || 0;

    total++;

    if (h >= 22) night++;
    if (isWeekday(d) && h >= 9 && h <= 18) work++;

    if (e.intent === "auto") auto++;
    if (m > 0 && m <= 3) shortB++;
    if (m >= 12) longB++;
  }

  const pct = (x) => Math.round((x / total) * 100);

  const traits = [];

  // Strict thresholds
  if (pct(night) >= 30) traits.push({ key:"night", label:`Night scroller (${pct(night)}%)` });
  if (pct(work) >= 35) traits.push({ key:"work", label:`Work-hours leak (${pct(work)}%)` });
  if (pct(auto) >= 40) traits.push({ key:"auto", label:`Auto bias (${pct(auto)}%)` });
  if (pct(shortB) >= 40) traits.push({ key:"short", label:`Short bursts (${pct(shortB)}%)` });
  if (pct(longB) >= 20) traits.push({ key:"long", label:`Long binges (${pct(longB)}%)` });

  if (traits.length === 0) traits.push({ key:"stable", label:"Profil stable (aucun pattern fort)" });

  return {
    traits,
    summary: `Profil (n=${total}) : ` + traits.map(t => t.label).join(" • ")
  };
};
window.Analytics = Analytics;
Analytics.actionPerformance = function(events){

  const outcomes = events.filter(e => e.mode === "outcome");

  const stats = {
    primary: { done:0, partial:0, ignored:0 },
    alt1: { done:0, partial:0, ignored:0 },
    alt2: { done:0, partial:0, ignored:0 }
  };

  for (const o of outcomes){
    if (!stats[o.actionKey]) continue;
    if (!stats[o.actionKey][o.result] && o.result !== 0) continue;
    stats[o.actionKey][o.result]++;
  }

  function score(s){
    const total = s.done + s.partial + s.ignored;
    if (total === 0) return 0;
    return (
      (s.done * 2 + s.partial * 1 - s.ignored * 2) / total
    );
  }

  return {
    primary: score(stats.primary),
    alt1: score(stats.alt1),
    alt2: score(stats.alt2)
  };
};
