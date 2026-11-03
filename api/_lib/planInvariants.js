"use strict";

/**
 * Harte Plan-Invarianten als Code (nicht als Prompt-Regel). `enforcePlanInvariants` läuft einmal über den
 * zusammengeführten Plan, egal ob er von Claude (phasedFullPlanGenerator) oder vom deterministischen
 * Generator stammt. `checkPlanInvariants` prüft dieselben Regeln und liefert Verstöße (Tests, Log).
 *
 * Reihenfolge in enforcePlanInvariants:
 *   1 Plan endet mit dem Rennen · 2 Anfahrt (Renntag −2/−1) · 3 genau ein Long Run pro Woche
 *   4 keine harte Einheit am Vortag von Long Run/Rennen · 4b keine zwei harten Tage hintereinander (I8)
 *   5 Long-Run-Ziele: Progression (I2), Anteil 20 % bis `longRunCap` (I10), lang genug für den Wochenumfang ohne
 *     lockeren Lauf über dem Long Run (I9) · 6 Wochenumfang aufs Ziel, lockere Läufe höchstens so lang wie der Long Run
 *   7 Abgleich mit den tatsächlichen km (Bausteine runden harte Einheiten): Anteil und I9
 *   7b/7d I2 und I1 wiederherstellen, nur durch Kürzen · 7c Taper liegt unter der Woche davor
 *   8 Bausteine → km, Titel und Beschreibung aus den Bausteinen (planSessionText.js), nie aus Claudes Freitext
 *
 * Die Verschiebungen (4, 4b) laufen vor jeder km-Verteilung, damit 5–7 mit der endgültigen Wochenform rechnen.
 * Vorrang bei Konflikten (freigegeben von Anton am 2026-11-01/02): in Wochen mit höchstens drei Läufen liegt die
 * Obergrenze des Anteils bei 50 % (mit I9 wäre der Long Run sonst nie länger als das Intervall); I2 geht vor der
 * 20-%-Untergrenze. Reichen die
 * Läufe einer Woche nicht für ihr km-Ziel (z. B. drei Läufe, kurzes Intervall), bleibt die Woche darunter;
 * I1 hält 7d trotzdem, indem es frühere Wochen kürzt.
 *
 * Reine Funktionen, keine I/O, keine Nutzerinhalte im Log.
 */

const {
  shapeHardSession,
  renderSession,
  kmFromDesc,
  isValidStructure,
  buildStructure,
  structureKm,
  cleanPace,
  zoneForSession,
  fmtKm,
  BANNED_TEXT,
} = require("./planSessionText");

const DAY_MS = 86400000;
const HARD_TYPES = new Set(["interval", "tempo"]);
const RUN_TYPES = new Set(["easy", "long", "interval", "tempo"]);

const LONG_RUN_SHARE = 0.3;
const LONG_RUN_SHARE_HIGH_VOLUME = 0.33;
const LONG_RUN_MIN_SHARE = 0.2;
const THREE_RUN_LONG_SHARE = 0.5;
/** Gegen flache Pläne: Entlastung/Taper höchstens 90 %; im Check Umfang ≥ 103 %, längster Long Run ≥ 105 % des Starts. */
const FLAT_FACTOR = 0.9;
const MIN_VOLUME_GROWTH = 1.03;
const MIN_LONG_GROWTH = 1.05;
const HARD_WEIGHT = 1.15;
const HIGH_VOLUME_WEEKLY_KM = 120;
const LONG_RUN_START_FRACTION = 0.65;
const LONG_RUN_DELOAD_FACTOR = 0.8;
const LONG_RUN_AFTER_PEAK_FRACTIONS = [0.7, 0.5];
const LONG_RUN_TOLERANCE_KM = 0.15;
/** Wochenanstieg und Rennwoche (Spiegel von weeklyVolumeProgression.js, dort für die Ziele). */
const MAX_WEEKLY_GROWTH = 1.1;
const RACE_WEEK_MAX_SHARE = 0.4;
/** Anstieg der Aufbaukette mindestens 7 %, wenn die Läufe alle Wochen gleich begrenzen (über I1 ≥ 3 %, I2 ≥ 5 %). */
const FLAT_RAMP = 0.07;
/** Ändert der Code die km eines lockeren Laufs um mehr als 30 %, passt Claudes Titel nicht mehr. */
const EASY_TITLE_KM_CHANGE = 0.3;
/** Lockerer Lauf höchstens 60 % des Long Runs (freigegeben von Anton am 2026-11-03). */
const EASY_TO_LONG_MAX = 0.6;

/** 33 % nur in Peak-Wochen ab 120 km, sonst 30 % (wie planWorkoutUtils.applyLongRunCapPerWeek). */
function longRunShare(ctx, weekNumber, weekKm) {
  const peak = ctx.weekPhaseSchedule?.[weekNumber - 1]?.phase === "peak";
  return peak && weekKm >= HIGH_VOLUME_WEEKLY_KM ? LONG_RUN_SHARE_HIGH_VOLUME : LONG_RUN_SHARE;
}

/**
 * Obergrenze des Long-Run-Anteils (I10): 30 %/33 %, in Wochen mit höchstens drei Läufen 50 % (nur ein Lauf: 100 %).
 * Mit drei Läufen und I9 (kein lockerer Lauf länger als der Long Run) wäre der Long Run bei 30 % bzw. bei der
 * Gleichverteilung nie länger als das Intervall, der Plan bliebe flach — 50 % freigegeben von Anton am 2026-11-02.
 */
function longRunCap(ctx, weekNumber, weekKm, runCount, mix) {
  const share = longRunShare(ctx, weekNumber, weekKm);
  if (runCount === 1) return 1;
  const base = runCount > 0 && runCount <= 3 ? Math.max(share, THREE_RUN_LONG_SHARE) : share;
  return Math.max(base, mixShareFloor(mix));
}

/**
 * Vorrang I9 (lockerer Lauf ≤ 60 % des Long Runs) vor der Obergrenze des Anteils: in Wochen mit wenigen, vor allem
 * lockeren Läufen kann der Long Run sonst gar nicht unter der Grenze bleiben (zwei Läufe: L ≤ 50 % verlangt den
 * lockeren Lauf ≥ L, I9 erlaubt 0,6 × L — Schritt 7 würde beide bis auf 0 kürzen). Die Grenze steigt dann auf den
 * Anteil, den der Long Run hat, wenn alle lockeren Läufe 60 % und harte Einheiten 115 % von ihm lang sind.
 * In üblichen Wochen (z. B. 2 harte + 3 lockere: 20 %) bleibt es bei 30 %/33 %/50 %.
 */
function mixShareFloor(mix) {
  if (!mix || !(mix.easy > 0 || mix.hard > 0)) return 0;
  return 1 / (1 + EASY_TO_LONG_MAX * (mix.easy ?? 0) + HARD_WEIGHT * (mix.hard ?? 0));
}

/** Zahl der lockeren und harten Läufe einer Woche (ohne Long Run und Rennen). */
function weekMix(list) {
  return {
    easy: list.filter((w) => w.sessionType === "easy" && w.sport !== "rest").length,
    hard: list.filter((w) => isHard(w)).length,
  };
}

/**
 * Folgepunkt (f): wie viele km eine volle Woche mit `runDays` Läufen höchstens trägt — ein Long Run bis `longMaxKm`
 * und bis zur Anteilsgrenze (30 %, bei höchstens drei Läufen 50 %), `hardDays` harte Einheiten bis zu ihrer
 * Obergrenze (und wie in Schritt 6 höchstens 1,15 × Long Run), die übrigen lockeren Läufe bis 60 % des Long Runs.
 * Gibt die größte Woche zurück, die diese Läufe vollständig tragen. Reichen die Anteile schon im Kleinen nicht
 * (z. B. zwei Läufe: 50 % + 30 %), ist es das, was die Läufe mit dem längsten erlaubten Long Run tragen.
 */
function weekCapacityKm({ runDays, hardDays, longMaxKm, raceKm }) {
  const carry = carryFn({ runDays, hardDays, longMaxKm, raceKm });
  if (!(longMaxKm > 0)) return 0;
  if (carry(1) < 1) return round1(carry(longMaxKm / carry.share));
  let lo = 1;
  let hi = 1000;
  if (carry(hi) >= hi) return hi;
  for (let k = 0; k < 50; k += 1) {
    const mid = (lo + hi) / 2;
    if (carry(mid) >= mid) lo = mid;
    else hi = mid;
  }
  // Die Suche nähert sich der Grenze von unten: 54,39999… soll 54,4 ergeben
  return Math.floor(lo * 10 + 1e-6) / 10;
}

/**
 * Größte Woche bis `weekKm`, die diese Läufe vollständig tragen. Reichen die Anteile schon im Kleinen nicht (zwei
 * Läufe), das, was sie bei diesem Ziel tragen — die Woche bleibt dann ohnehin darunter.
 */
function weekCarryKm(params, weekKm) {
  const carry = carryFn(params);
  if (carry(weekKm) >= weekKm) return weekKm;
  if (carry(1) < 1) return carry(weekKm);
  return Math.min(weekKm, weekCapacityKm(params));
}

function carryFn({ runDays, hardDays, longMaxKm, raceKm }) {
  const n = Math.max(1, Math.round(runDays));
  const h = Math.max(0, Math.min(Math.round(hardDays), n - 1));
  const easyCount = n - 1 - h;
  const base = n === 1 ? 1 : n <= 3 ? Math.max(LONG_RUN_SHARE, THREE_RUN_LONG_SHARE) : LONG_RUN_SHARE;
  const share = n === 1 ? 1 : Math.max(base, mixShareFloor({ easy: easyCount, hard: h }));
  const hb = hardBounds(raceKm);
  // Obergrenze nach dem Formen (Bausteine runden: Intervall 16 km → 14,7 km)
  const shaped = (type, km) => structureKm(buildStructure(type, km, raceKm));
  const hardMax = [shaped("interval", hb.maxInterval), shaped("tempo", hb.maxTempo), shaped("interval", hb.maxInterval)].slice(0, h);
  const longCap = longMaxKm > 0 ? longMaxKm : Infinity;
  const carry = (week) => {
    const long = Math.min(share * week, longCap);
    return long + hardMax.reduce((sum, m) => sum + Math.min(m, HARD_WEIGHT * long), 0) + easyCount * EASY_TO_LONG_MAX * long;
  };
  carry.share = share;
  return carry;
}

/**
 * Schritt 5a (Folgepunkt f auf Wochenebene): Ziel je Woche höchstens das, was ihre tatsächlichen Läufe tragen
 * (Claude plant z. B. weniger Läufe als die Regeln). Danach in den vollen Aufbauwochen ohne Entlastung nicht fallend
 * und höchstens 1,1 × max(Vorwoche, Niveau vor der Entlastung) — sonst würde 7d spätere Engpässe durch Kürzen
 * früherer Wochen auflösen und dabei Long Runs neben festen harten Einheiten zerdrücken.
 */
function effectiveWeekTargets(days, weeks, ctx, last) {
  const out = weeks.map((_, wi) => ctx.weeklyKmTargets?.[wi]);
  weeks.forEach((idxs, wi) => {
    const target = out[wi];
    if (!(target > 0) || idxs.includes(last)) return;
    const runs = idxs.filter((i) => isRunSession(days[i]));
    if (!runs.some((i) => days[i].sessionType === "long")) return;
    const carry = weekCarryKm(
      {
        runDays: runs.length,
        hardDays: runs.filter((i) => isHard(days[i])).length,
        longMaxKm: ctx.longRunMaxKm?.[wi],
        raceKm: ctx.raceKm,
      },
      target,
    );
    out[wi] = Math.min(target, Math.floor(carry * 10 + 1e-6) / 10);
  });
  if (!ctx.weekPhaseSchedule) return out;
  const build = weeks
    .map((_, wi) => wi)
    .filter((wi) => ctx.weekPhaseSchedule[wi]?.phase !== "taper" && weeks[wi].length >= 7 && out[wi] > 0);
  const chain = build.filter((wi) => !ctx.isDeload?.[wi]);
  for (let k = chain.length - 2; k >= 0; k -= 1) out[chain[k]] = Math.min(out[chain[k]], out[chain[k + 1]]);
  // Begrenzen die Läufe alle Aufbauwochen auf dasselbe Niveau, wäre der Plan flach (I1/I2): dann beginnt die Kette
  // bei höchstens 93 % ihrer letzten Woche und steigt linear dorthin.
  if (chain.length >= 3) {
    const top = out[chain[chain.length - 1]];
    chain.forEach((wi, k) => {
      const ramp = top * (1 - FLAT_RAMP * (1 - k / (chain.length - 1)));
      out[wi] = Math.min(out[wi], Math.floor(ramp * 10 + 1e-6) / 10);
    });
  }
  let level = null;
  for (const wi of build) {
    if (wi > 0 && weeks[wi - 1].length >= 7 && out[wi - 1] > 0) {
      const cap = Math.floor(MAX_WEEKLY_GROWTH * Math.max(out[wi - 1], level ?? 0) * 10 + 1e-6) / 10;
      out[wi] = Math.min(out[wi], cap);
    }
    if (!ctx.isDeload?.[wi]) level = out[wi];
  }
  return out;
}

// ── Datums-Helfer (YYYY-MM-DD, UTC-basiert, ohne Zeitzonen-Effekte) ───────────────────────────
const ymdToMs = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const msToYmd = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ymd, n) => msToYmd(ymdToMs(ymd) + n * DAY_MS);
const diffDays = (a, b) => Math.round((ymdToMs(a) - ymdToMs(b)) / DAY_MS);
const dowOf = (ymd) => new Date(ymdToMs(ymd)).getUTCDay();
const mondayOf = (ymd) => addDays(ymd, -((dowOf(ymd) + 6) % 7));
const dayOf = (w) => String(w?.dateIso ?? "").slice(0, 10);
const round1 = (x) => Math.round(x * 10) / 10;
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const isHard = (w) => HARD_TYPES.has(w?.sessionType);
const isHardOrRace = (w) => isHard(w) || w?.sessionType === "race";
const isRunSession = (w) => RUN_TYPES.has(w?.sessionType) && w?.sport !== "rest";

function dayPriority(w) {
  switch (w?.sessionType) {
    case "race":
      return 5;
    case "long":
      return 4;
    case "interval":
    case "tempo":
      return 3;
    case "easy":
      return 2;
    case "rest":
      return 0;
    default:
      return 1;
  }
}

// ── Workout-Fabriken ───────────────────────────────────────────────────────────────────────
function restDay(ymd) {
  return {
    id: `inv-${ymd}-rest`,
    dateIso: `${ymd}T12:00:00.000Z`,
    sport: "rest",
    sessionType: "rest",
    title: "Ruhetag",
    km: 0,
    desc: "Ruhetag.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function asRest(w) {
  return { ...restDay(dayOf(w)), id: w.id || restDay(dayOf(w)).id, dateIso: w.dateIso, phase: w.phase };
}

function asEasy(w) {
  return {
    ...w,
    sport: "run",
    sessionType: "easy",
    title: "Lockerer Dauerlauf",
    desc: "Lockerer Dauerlauf in Zone 2.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function asLong(w) {
  return {
    ...w,
    sport: "run",
    sessionType: "long",
    title: "Langer Lauf",
    desc: "Langer, ruhiger Lauf in Zone 2.",
    pace: null,
    structured: null,
    intensity: "medium",
  };
}

function asRace(w, ctx) {
  return {
    ...w,
    sport: "run",
    sessionType: "race",
    title: ctx.raceTitle || "Rennen",
    km: round1(ctx.raceKm),
    desc: "Renntag. Starte kontrolliert und teile das Rennen ein.",
    pace: null,
    structured: null,
    intensity: "high",
  };
}

// ── Kennzahlen je Distanz ──────────────────────────────────────────────────────────────────
function approachCaps(raceKm) {
  return {
    dMinus1: Math.min(6, Math.max(3, round1(0.4 * raceKm))),
    dMinus2: Math.min(10, Math.max(4, round1(0.6 * raceKm))),
  };
}

function easyMinKm(raceKm) {
  return raceKm <= 10 ? 4 : 5;
}

function hardBounds(raceKm) {
  const big = raceKm > 30;
  return { min: 6, maxInterval: big ? 16 : 14, maxTempo: big ? 24 : 20 };
}

function longRunMinDaysBeforeRace(distKey) {
  return distKey === 5 || distKey === 10 || distKey === 15 ? 14 : 21;
}

/** Rennwoche: höchstens eine harte Einheit, so kurz und frühestens so viele Tage vor dem Rennen (Anton, 2026-11-03). */
const RACE_WEEK_HARD_MAX_KM = 8;
/** Rennwoche für AK 5: Renntag −6 bis Renntag. */
const RACE_WINDOW_DAYS = 7;
function raceWeekHardMinGap(distKey) {
  if (distKey === 42.2 || distKey === "ultra") return 4;
  if (distKey === 21.1 || distKey === 15) return 3;
  return 2;
}

/** Position im Wochenraster Mo = 0 … So = 6. */
const weekPos = (dow) => (dow + 6) % 7;

/** Gewicht und Grenzen eines lockeren Laufs bei der Verteilung des Wochenumfangs (Schritt 5 und 6). */
function easyBounds(i, last, approachIdx, target, ctx) {
  const caps = approachCaps(ctx.raceKm);
  const easyMin = easyMinKm(ctx.raceKm);
  return {
    weight: approachIdx.has(i) ? 0.6 : 1,
    min: approachIdx.has(i) ? 3 : easyMin,
    max: i === last - 1 ? caps.dMinus1 : i === last - 2 ? caps.dMinus2 : Math.max(easyMin, 0.45 * target),
  };
}

function hardMaxKm(w, raceKm) {
  const hb = hardBounds(raceKm);
  return w.sessionType === "interval" ? hb.maxInterval : hb.maxTempo;
}

/**
 * Kürzester Long Run, mit dem die Woche ihr Ziel `volume` erreicht, wenn kein lockerer Lauf länger sein darf
 * als 60 % des Long Runs (I9) und harte Einheiten wie in Schritt 6 etwas mehr als ein lockerer Lauf tragen.
 */
function minLongForVolume(days, idxs, volume, target, ctx, approachIdx, last) {
  const hardMax = idxs.filter((i) => isHard(days[i])).map((i) => hardMaxKm(days[i], ctx.raceKm));
  const easyMax = idxs
    .filter((i) => days[i].sessionType === "easy" && i !== last)
    .map((i) => easyBounds(i, last, approachIdx, target, ctx).max);
  const capacity = (L) =>
    L +
    hardMax.reduce((s, m) => s + Math.min(m, HARD_WEIGHT * L), 0) +
    easyMax.reduce((s, m) => s + Math.min(m, EASY_TO_LONG_MAX * L), 0);
  // capacity(volume) ≥ volume gilt immer (der Long Run allein trägt das Ziel), die Suche endet also in [0, volume]
  let lo = 0;
  let hi = volume;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (capacity(mid) >= volume) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 10) / 10;
}

/**
 * Fehlt einer Woche der Long Run (Claude hat ihn z. B. als lockeren Lauf auf den Samstag gelegt), wird der längste
 * lockere Lauf umgelabelt (km der Quelle); gibt es keinen, der längste Lauf überhaupt (AK 3). Bei gleicher Länge der,
 * der im Wochenraster am nächsten am Long-Run-Tag liegt. Anfahrtstage scheiden aus.
 */
function pickLongRunCandidate(days, idxs, approachIdx, longRunDow) {
  const open = idxs.filter((i) => !approachIdx.has(i));
  const easy = open.filter((i) => days[i].sessionType === "easy");
  const pool = easy.length > 0 ? easy : open.filter((i) => isHard(days[i]));
  if (pool.length === 0) return null;
  const kmOf = (i) => (Number.isFinite(days[i]._srcKm) ? days[i]._srcKm : days[i].km) || 0;
  const distance = (i) => Math.abs(weekPos(dowOf(dayOf(days[i]))) - weekPos(longRunDow));
  return pool.reduce((a, b) => (kmOf(b) > kmOf(a) || (kmOf(b) === kmOf(a) && distance(b) < distance(a)) ? b : a));
}

/** I9: Obergrenze eines lockeren Laufs bei einem Long Run von `longKm` (auf 0,1 km abgerundet). */
function easyCapFor(longKm) {
  return longKm > 0 ? Math.floor(EASY_TO_LONG_MAX * longKm * 10 + 1e-9) / 10 : Infinity;
}

/** km des letzten Long Runs vor Index `before` (Rennwoche und Wochen ohne Long Run). */
function lastLongKmBefore(days, before) {
  for (let i = before - 1; i >= 0; i -= 1) {
    if (days[i].sessionType === "long") return days[i].km;
  }
  return 0;
}

// ── Wochen-Struktur ────────────────────────────────────────────────────────────────────────
function weekIndexOf(ymd, firstMonday) {
  return Math.floor(diffDays(mondayOf(ymd), firstMonday) / 7) + 1;
}

function groupByWeek(days, startYmd) {
  const firstMonday = mondayOf(startYmd);
  const weeks = [];
  days.forEach((w, i) => {
    const wn = weekIndexOf(dayOf(w), firstMonday);
    if (!weeks[wn - 1]) weeks[wn - 1] = [];
    weeks[wn - 1].push(i);
  });
  return Array.from(weeks, (w) => w ?? []);
}

// ── Verteilung von km auf Einheiten (Wasserfüllung mit Min/Max) ─────────────────────────────
/**
 * Verteilt `total` km proportional zu `weight` auf die Items, begrenzt durch [min, max].
 * Verletzer werden auf ihre Grenze gesetzt, der Rest wird auf die übrigen Items verteilt.
 */
function distribute(total, items) {
  const out = new Array(items.length).fill(null);
  let free = items.map((_, i) => i);
  let remaining = total;
  for (let iter = 0; iter < items.length + 2 && free.length > 0; iter += 1) {
    const sumWeight = free.reduce((s, i) => s + items[i].weight, 0);
    const tooLow = [];
    const tooHigh = [];
    for (const i of free) {
      const share = (remaining * items[i].weight) / sumWeight;
      if (share < items[i].min) tooLow.push(i);
      else if (share > items[i].max) tooHigh.push(i);
    }
    if (tooLow.length === 0 && tooHigh.length === 0) {
      for (const i of free) out[i] = (remaining * items[i].weight) / sumWeight;
      free = [];
      break;
    }
    for (const i of tooLow) {
      out[i] = items[i].min;
      remaining -= items[i].min;
    }
    for (const i of tooHigh) {
      out[i] = items[i].max;
      remaining -= items[i].max;
    }
    free = free.filter((i) => out[i] == null);
  }
  const rounded = out.map((v) => round1(v ?? 0));
  const diff = round1(total - rounded.reduce((s, v) => s + v, 0));
  if (Math.abs(diff) >= 0.1) {
    let best = -1;
    rounded.forEach((v, i) => {
      const next = round1(v + diff);
      if (next >= items[i].min && next <= items[i].max && (best < 0 || v > rounded[best])) best = i;
    });
    if (best >= 0) rounded[best] = round1(rounded[best] + diff);
  }
  return rounded;
}

// ── Hauptfunktion ──────────────────────────────────────────────────────────────────────────
/**
 * @param {Array} input workouts (dateIso, sport, sessionType, km, …) — beliebige Quelle
 * @param {{
 *   startYmd: string, raceYmd: string, raceKm: number, raceTitle?: string, distKey: number|string,
 *   weeklyKmTargets: number[], isDeload?: boolean[], peakLongRunKm: number, longRunDow?: number,
 *   weekPhaseSchedule?: Array<{ phase: string }>,
 *   shapeSession?: (w: object, km: number, ctx: object) => object,
 * }} ctx
 * @returns {Array} neue, lückenlose Workout-Liste von Planstart bis Renntag (je Tag genau eine Einheit)
 */
function enforcePlanInvariants(input, ctx) {
  const { startYmd, raceYmd } = ctx;
  const ultra = ctx.distKey === "ultra";
  const longRunDow = ctx.longRunDow ?? 0;

  // 1 — Tage lückenlos von Start bis Renntag, eine Einheit pro Tag, nichts nach dem Rennen
  const byDay = new Map();
  for (const w of input ?? []) {
    const d = dayOf(w);
    if (!isYmd(d) || d < startYmd || d > raceYmd) continue;
    const prev = byDay.get(d);
    if (!prev || dayPriority(w) > dayPriority(prev)) byDay.set(d, w);
  }
  const days = [];
  for (let d = startYmd; d <= raceYmd; d = addDays(d, 1)) {
    const w = byDay.get(d);
    // _srcKm: km der Quelle, damit finalizeSession erkennt, wie stark der Code die km geändert hat
    days.push(w ? { ...w, _srcKm: Number.isFinite(w.km) ? w.km : null } : restDay(d));
  }
  const last = days.length - 1;
  if (last < 0) return days;

  days[last] = asRace(days[last], ctx);
  for (let i = 0; i < last; i += 1) {
    if (days[i].sessionType === "race") days[i] = asEasy(days[i]);
  }

  // 2 — Anfahrt: Renntag −2 und −1 nur locker oder frei
  for (const k of [1, 2]) {
    const i = last - k;
    if (i < 0) continue;
    const w = days[i];
    if (isHard(w) || w.sessionType === "long") days[i] = asEasy(w);
    else if (w.sessionType !== "easy" && w.sessionType !== "rest") days[i] = asRest(w);
  }
  const approachIdx = new Set([last - 1, last - 2].filter((i) => i >= 0));
  const weeks = groupByWeek(days, startYmd);
  const raceWeek = weeks.length;
  // "Rennwoche" für AK 5 = die 7 Tage bis zum Rennen (Renntag −6 … Renntag), nicht nur die Kalenderwoche: bei einem
  // Rennen am Montag oder Dienstag lägen die Tage davor sonst in der Vorwoche und ohne Grenze. Tage der Spitzenwoche
  // bleiben ausgenommen (Rennen Do–Sa mit nur einer Taper-Woche), sonst fiele die Spitze unter die Woche davor (I1).
  const taperWeekOf = new Map();
  weeks.forEach((idxs, wi) => {
    const taper = wi === weeks.length - 1 || !ctx.weekPhaseSchedule || ctx.weekPhaseSchedule[wi]?.phase === "taper";
    idxs.forEach((i) => taperWeekOf.set(i, taper));
  });
  const raceWeekIdx = new Set(
    Array.from({ length: Math.min(RACE_WINDOW_DAYS, last + 1) }, (_, k) => last - k).filter((i) => taperWeekOf.get(i)),
  );
  const hardMinGap = raceWeekHardMinGap(ctx.distKey);

  // 2b — Rennwoche: höchstens eine harte Einheit, frühestens `hardMinGap` Tage vor dem Rennen; die übrigen locker
  const raceWeekHard = [...raceWeekIdx].filter((i) => i !== last && isHard(days[i]));
  const allowedHard = raceWeekHard.filter((i) => last - i >= hardMinGap);
  const keepHard = allowedHard.length > 0 ? allowedHard[allowedHard.length - 1] : null;
  for (const i of raceWeekHard) {
    if (i !== keepHard) days[i] = asEasy(days[i]);
  }

  // 3 — genau ein Long Run pro Woche (außer in der Rennwoche). In den 7 Tagen bis zum Rennen liegt keiner; eine
  // Woche braucht ihn nur, wenn mindestens 5 ihrer Tage davor liegen (Stub-Woche am Start, Woche vor einem Rennen
  // am Montag bis Donnerstag).
  weeks.forEach((idxs, wi) => {
    const wn = wi + 1;
    for (const i of idxs) {
      if (raceWeekIdx.has(i) && days[i].sessionType === "long") days[i] = asEasy(days[i]);
    }
    const open = idxs.filter((i) => !raceWeekIdx.has(i));
    const longs = open.filter((i) => days[i].sessionType === "long");
    if (wn === raceWeek || open.length < 5) {
      longs.forEach((i) => {
        days[i] = asEasy(days[i]);
      });
    } else if (longs.length > 1) {
      const keep = longs.reduce((a, b) => (days[b].km > days[a].km ? b : a));
      longs.forEach((i) => {
        if (i !== keep) days[i] = asEasy(days[i]);
      });
    } else if (longs.length === 0) {
      const pick = pickLongRunCandidate(days, open, approachIdx, longRunDow);
      if (pick != null) days[pick] = asLong(days[pick]);
    }
  });

  // Verschoben wird nur innerhalb der Woche und nie in die letzten `hardMinGap` Tage vor dem Rennen.
  const moveGuard = { weeks, raceWeekIdx, hardMinGap };

  // 4 — keine harte Einheit am Vortag eines Long Runs oder des Rennens
  fixHardBeforeLong(days, last, moveGuard);

  // 4b — keine zwei harten Einheiten an aufeinanderfolgenden Tagen (I8)
  fixConsecutiveHard(days, last, weeks, approachIdx, new Set(ctx.restDows ?? []), moveGuard);

  // 5a — Wochenziele an die tatsächlichen Läufe koppeln
  const weekTargets = effectiveWeekTargets(days, weeks, ctx, last);
  const tctx = { ...ctx, weeklyKmTargets: weekTargets, raceWindow: raceWeekIdx };

  // 5 — Long-Run-Ziele je Woche
  const { targets: longTargets, maxKm: longMaxKm, order: longOrder } = planLongRuns(days, weeks, tctx, ultra, last, approachIdx);

  // 6 — Wochenumfang aufs Ziel (nur lockere Läufe sind frei, Struktur-Einheiten behalten ihre Form)
  const hb = hardBounds(ctx.raceKm);
  weeks.forEach((idxs, wi) => {
    const target = weekTargets[wi];
    if (!(target > 0)) return;
    const raceKmInWeek = idxs.includes(last) ? round1(ctx.raceKm) : 0;
    const longIdx = idxs.find((i) => days[i].sessionType === "long");
    const longKm = longIdx != null ? Math.min(longTargets.get(longIdx) ?? 0, Math.max(0, target - raceKmInWeek)) : 0;

    const hard = idxs.filter((i) => isHard(days[i]));
    let easy = idxs.filter((i) => days[i].sessionType === "easy" && i !== last);
    const remaining = round1(target - raceKmInWeek - longKm);

    const hardItems = () =>
      hard.map((i) => ({
        weight: HARD_WEIGHT,
        min: hb.min,
        max: raceWeekIdx.has(i) ? Math.min(hardMaxKm(days[i], ctx.raceKm), RACE_WEEK_HARD_MAX_KM) : hardMaxKm(days[i], ctx.raceKm),
      }));
    // I9: kein lockerer Lauf länger als 60 % des Long Runs derselben Woche (ohne Long Run: des letzten davor)
    const easyCap = longIdx != null ? easyCapFor(longKm) : easyCapFor(lastLongKmBefore(days, idxs[0]));
    const easyItems = () =>
      easy.map((i) => {
        const b = easyBounds(i, last, approachIdx, target, ctx);
        const max = Math.min(b.max, easyCap);
        return { ...b, max, min: Math.min(b.min, max) };
      });

    // Zu wenig Volumen für alle Einheiten: lockere Läufe von vorn streichen, Anfahrtstage zuletzt.
    const sumMin = () => hardItems().concat(easyItems()).reduce((s, it) => s + it.min, 0);
    while (sumMin() > remaining && easy.length > 0) {
      const drop = easy.find((i) => !approachIdx.has(i)) ?? easy[0];
      days[drop] = asRest(days[drop]);
      easy = easy.filter((i) => i !== drop);
    }

    const items = hardItems().concat(easyItems());
    const km = items.length > 0 ? distribute(remaining, items) : [];
    const shape = ctx.shapeSession ?? shapeHardSession;
    hard.forEach((i, k) => {
      days[i] = shape(days[i], km[k], ctx);
    });
    // Zweiter Durchgang: Strukturen runden die km der harten Einheiten, lockere Läufe gleichen den Rest aus.
    const hardActual = hard.reduce((s, i) => s + days[i].km, 0);
    const easyKm = easy.length > 0 ? distribute(round1(remaining - hardActual), easyItems()) : [];
    easy.forEach((i, k) => {
      days[i] = { ...days[i], km: easyKm[k] };
    });
    if (longIdx != null) days[longIdx] = { ...days[longIdx], km: round1(longKm) };
  });

  // 7 — Abgleich nach den Rundungen: Anteil 20 % (volle Wochen außer der Rennwoche) bis zur Obergrenze
  // (`longRunCap`, I10; Überschuss nie auf harte Einheiten gelegt), danach kein lockerer Lauf länger als der Long
  // Run (I9). Angehoben wird höchstens bis zur I2-Grenze aus Schritt 5. Kürzt 7 einen lockeren Lauf, ändert sich
  // der Anteil — daher mehrere Runden, bis nichts mehr korrigiert wird (jede Runde verkleinert den Abstand zur
  // Grenze um einen festen Faktor).
  if (!ultra) {
    weeks.forEach((idxs, wi) => {
      const longIdx = idxs.find((i) => days[i].sessionType === "long");
      if (longIdx == null) return;
      const fullWeek = idxs.length >= 7 && !idxs.some((i) => raceWeekIdx.has(i));
      const raiseLimit = longMaxKm.get(longIdx) ?? Infinity;
      for (let round = 0; round < 30; round += 1) {
        const total = idxs.reduce((s, i) => s + (isRunSession(days[i]) || days[i].sessionType === "race" ? days[i].km : 0), 0);
        const others = total - days[longIdx].km;
        if (others <= 0) return;
        const runCount = idxs.filter((i) => isRunSession(days[i])).length;
        const share = longRunCap(ctx, wi + 1, total, runCount, weekMix(idxs.filter((i) => i !== last).map((i) => days[i])));
        // ±1e-9: z. B. (1/3)/(2/3)·22 ergibt 10,999…, ohne Toleranz würde Math.floor auf 10,9 kürzen
        const shareMax = share >= 1 ? Infinity : Math.floor((share / (1 - share)) * others * 10 + 1e-9) / 10;
        const absMax = ctx.longRunMaxKm?.[wi] > 0 ? ctx.longRunMaxKm[wi] : Infinity;
        const maxLong = Math.min(shareMax, absMax);
        const minLong = fullWeek ? Math.ceil((LONG_RUN_MIN_SHARE / (1 - LONG_RUN_MIN_SHARE)) * others * 10 - 1e-9) / 10 : 0;
        const before = days[longIdx].km;
        const raised = Math.min(minLong, maxLong, Math.max(before, raiseLimit));
        const longKm = before > maxLong ? maxLong : before < minLong ? raised : before;
        let changed = longKm !== before;
        if (changed) days[longIdx] = { ...days[longIdx], km: longKm };
        const cap = easyCapFor(longKm);
        for (const i of idxs) {
          if (days[i].sessionType === "easy" && i !== last && days[i].km > cap) {
            days[i] = { ...days[i], km: cap };
            changed = true;
          }
        }
        if (!changed) break;
      }
    });
  }

  // 7b/7d — I2 und I1 nach dem Abgleich. 7 kann Long Runs und damit ganze Wochen gekürzt haben (Woche mit drei
  // Läufen, deren Intervall kürzer ist als der Long Run). Beide Schritte kürzen nur, nie verlängern, und laufen im
  // Wechsel, bis nichts mehr gekürzt wird:
  //   7b I2: vor der Spitze kein Long Run länger als der nächste der Kette, nach der Spitze jeder kürzer als die
  //      Spitze und höchstens so lang wie der davor; in derselben Woche kein lockerer Lauf darüber (I9)
  //   7d I1: liegt eine Aufbauwoche unter der Woche davor, wird die frühere auf ihren Umfang gekürzt (Long Run und
  //      lockere Läufe im gleichen Verhältnis, damit I9 und der Anteil halten)
  const weekOfDay = new Map();
  weeks.forEach((idxs) => idxs.forEach((i) => weekOfDay.set(i, idxs)));
  const weekRunKm = (idxs) =>
    idxs.reduce((s, i) => s + (days[i].sport !== "rest" && days[i].sessionType !== "race" ? days[i].km : 0), 0);
  const easyMin = easyMinKm(ctx.raceKm);
  const capEasyAtLong = (idxs, longKm) => {
    const cap = easyCapFor(longKm);
    for (const j of idxs) {
      if (days[j].sessionType === "easy" && j !== last && days[j].km > cap) days[j] = { ...days[j], km: cap };
    }
  };
  const shortenLong = (i, km) => {
    if (!(days[i].km > km + 1e-9)) return false;
    days[i] = { ...days[i], km };
    capEasyAtLong(weekOfDay.get(i) ?? [], km);
    return true;
  };
  const shrinkWeek = (idxs, goalKm) => {
    const free = idxs.filter(
      (i) => days[i].sessionType === "long" || (days[i].sessionType === "easy" && i !== last && !approachIdx.has(i)),
    );
    const freeKm = free.reduce((s, i) => s + days[i].km, 0);
    const f = freeKm > 0 ? Math.max(0, (goalKm - (weekRunKm(idxs) - freeKm)) / freeKm) : 1;
    if (f >= 1) return false;
    for (const i of free) {
      const floorKm = days[i].sessionType === "easy" ? Math.min(easyMin, days[i].km) : 0;
      days[i] = { ...days[i], km: Math.max(floorKm, round1(days[i].km * f)) };
    }
    const longIdx = idxs.find((i) => days[i].sessionType === "long");
    if (longIdx != null) capEasyAtLong(idxs, days[longIdx].km);
    return true;
  };
  const buildChain = ctx.weekPhaseSchedule
    ? weeks
        .map((_, wi) => wi)
        .filter((wi) => ctx.weekPhaseSchedule[wi]?.phase !== "taper" && weeks[wi].length >= 7 && !ctx.isDeload?.[wi])
    : [];
  const keepLongRunShape = () => {
    if (!longOrder) return false;
    let changed = false;
    const run = [...longOrder.chain, longOrder.peak];
    for (let k = run.length - 2; k >= 0; k -= 1) changed = shortenLong(run[k], days[run[k + 1]].km) || changed;
    for (const i of longOrder.otherBefore) changed = shortenLong(i, days[longOrder.peak].km) || changed;
    let ceiling = round1(days[longOrder.peak].km - 0.1);
    for (const i of longOrder.after) {
      changed = shortenLong(i, ceiling) || changed;
      ceiling = days[i].km;
    }
    return changed;
  };
  // 7e (AK 2): volle Aufbauwochen höchstens 1,1 × max(Vorwoche, Niveau vor der Entlastung). Die Ziele halten das
  // schon ein; bleibt eine Woche unter ihrem Ziel (zu wenige Läufe), darf die nächste trotzdem nicht springen.
  const growthWeeks = ctx.weekPhaseSchedule
    ? weeks.map((_, wi) => wi).filter((wi) => ctx.weekPhaseSchedule[wi]?.phase !== "taper")
    : [];
  const keepGrowth = () => {
    let changed = false;
    let level = null;
    for (const wi of growthWeeks) {
      const full = weeks[wi].length >= 7;
      const prevFull = wi > 0 && weeks[wi - 1].length >= 7;
      if (full && prevFull && wi > 0) {
        const ref = Math.max(weekRunKm(weeks[wi - 1]), level ?? 0);
        const cap = MAX_WEEKLY_GROWTH * ref;
        if (weekRunKm(weeks[wi]) > cap + 0.05) changed = shrinkWeek(weeks[wi], Math.floor(cap * 10) / 10) || changed;
      }
      if (full && !ctx.isDeload?.[wi]) level = weekRunKm(weeks[wi]);
    }
    return changed;
  };
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = keepLongRunShape();
    for (let k = buildChain.length - 1; k > 0; k -= 1) {
      const prev = weeks[buildChain[k - 1]];
      const curKm = weekRunKm(weeks[buildChain[k]]);
      if (curKm < weekRunKm(prev) * 0.97 - 0.5) changed = shrinkWeek(prev, curKm) || changed;
    }
    changed = keepGrowth() || changed;
    if (!changed) break;
  }

  // 7c — Entlastung und Taper (I1): Tragen die Aufbauwochen ihr Ziel nicht (zu wenige Läufe für I9 und den Anteil),
  // bleiben Entlastung und Taper trotzdem spürbar darunter — Entlastung ≤ 90 % der Woche davor, volle Taper-Woche
  // ≤ 90 % der tatsächlichen Spitze, jede Taper-Woche unter der Woche davor. Gekürzt wird wie in 7d, danach
  // streicht 7c überzählige km lockerer Läufe (auch an den Anfahrtstagen).
  const FLAT_MARGIN_KM = 0.3;
  const peakBuildKm = Math.max(
    0,
    ...weeks.filter((_, wi) => ctx.weekPhaseSchedule?.[wi]?.phase !== "taper").map((idxs) => weekRunKm(idxs)),
  );
  weeks.forEach((idxs, wi) => {
    if (wi === 0 || !ctx.weekPhaseSchedule) return;
    const taper = ctx.weekPhaseSchedule[wi]?.phase === "taper";
    if (!taper && ctx.isDeload?.[wi] && idxs.length >= 7) shrinkWeek(idxs, FLAT_FACTOR * weekRunKm(weeks[wi - 1]) - FLAT_MARGIN_KM);
    if (taper && idxs.length >= 7 && !idxs.includes(last)) shrinkWeek(idxs, FLAT_FACTOR * peakBuildKm - FLAT_MARGIN_KM);
    if (!taper) return;
    const before = weekRunKm(weeks[wi - 1]);
    const goal = idxs.length >= 7 ? Math.min(before - 0.1, FLAT_FACTOR * peakBuildKm - FLAT_MARGIN_KM) : before - 0.1;
    let excess = weekRunKm(idxs) > goal ? round1(weekRunKm(idxs) - goal) : 0;
    const easy = idxs.filter((i) => days[i].sessionType === "easy" && i !== last).sort((a, b) => days[b].km - days[a].km);
    for (const i of easy) {
      if (!(excess > 0)) break;
      const cut = round1(Math.min(excess, days[i].km - Math.min(easyMin, days[i].km)));
      if (cut <= 0) continue;
      days[i] = { ...days[i], km: round1(days[i].km - cut) };
      excess = round1(excess - cut);
    }
  });

  // 7c kürzt Long Runs in Taper-Wochen; danach gilt der I2-Verlauf wieder (nur Kürzen, Taper sinkt dabei höchstens)
  keepLongRunShape();

  // 7g — Rennwoche (die 7 Tage bis zum Rennen) ohne Rennen höchstens 40 % der tatsächlichen Spitze (AK 5): lockere
  // Läufe bis zur Mindestlänge kürzen, dann die harte Einheit bis zu ihrer Mindestlänge, dann lockere Läufe streichen
  // (kürzeste zuerst, Anfahrtstage zuletzt; Renntag −1/−2 dürfen laut I3 frei sein)
  {
    const raceWeek = [...raceWeekIdx].sort((a, b) => a - b);
    const others = weeks
      .slice(0, -1)
      .filter((_, wi) => ctx.weekPhaseSchedule?.[wi]?.phase !== "taper")
      .map((idxs) => weekRunKm(idxs));
    const peakKm = Math.max(0, ...others);
    let excess = peakKm > 0 ? round1(weekRunKm(raceWeek) - Math.floor(RACE_WEEK_MAX_SHARE * peakKm * 10) / 10) : 0;
    const easyRuns = () => raceWeek.filter((i) => days[i].sessionType === "easy" && i !== last);
    for (const i of easyRuns().sort((a, b) => days[b].km - days[a].km)) {
      if (!(excess > 0)) break;
      const cut = round1(Math.min(excess, days[i].km - Math.min(easyMin, days[i].km)));
      if (cut <= 0) continue;
      days[i] = { ...days[i], km: round1(days[i].km - cut) };
      excess = round1(excess - cut);
    }
    const shape = ctx.shapeSession ?? shapeHardSession;
    for (const i of raceWeek.filter((k) => isHard(days[k]))) {
      if (!(excess > 0)) break;
      const goalKm = Math.max(hb.min, round1(days[i].km - excess));
      if (goalKm >= days[i].km) continue;
      const before = days[i].km;
      days[i] = shape(days[i], goalKm, ctx);
      excess = round1(excess - (before - days[i].km));
    }
    const removable = easyRuns().sort((a, b) => Number(approachIdx.has(a)) - Number(approachIdx.has(b)) || days[a].km - days[b].km);
    for (const i of removable) {
      if (!(excess > 0)) break;
      excess = round1(excess - days[i].km);
      days[i] = asRest(days[i]);
    }
  }

  // 7f — I9 zum Schluss: kein lockerer Lauf über 60 % des Long Runs der Woche (ohne Long Run: des letzten davor)
  weeks.forEach((idxs) => {
    const longIdx = idxs.find((i) => days[i].sessionType === "long");
    const cap = easyCapFor(longIdx != null ? days[longIdx].km : lastLongKmBefore(days, idxs[0]));
    for (const i of idxs) {
      if (days[i].sessionType === "easy" && i !== last && days[i].km > cap) days[i] = { ...days[i], km: cap };
    }
  });

  // 8 — Bausteine und Text: km = Summe der Bausteine, Titel/Beschreibung daraus erzeugt
  return days.map((w, i) => finalizeSession(w, i, days, ctx));
}

const SUPPORT_DEFAULTS = {
  bike: { title: "Radfahren", desc: "Lockeres Radfahren in Zone 2." },
  strength: { title: "Krafttraining", desc: "Rumpf, Beine, funktionelle Übungen." },
  swim: { title: "Schwimmen", desc: "Lockeres Schwimmen." },
};

/**
 * Rad, Kraft, Schwimmen: gleiche Textregel wie bei Läufen. Titel/Beschreibung mit GA-Begriffen, Prozent, bpm,
 * Puls oder einer falschen Zone fallen auf einen Standardtext zurück; Freitext-Pace entfällt.
 */
function cleanSupportSession(w) {
  const fallback = SUPPORT_DEFAULTS[w.sessionType];
  const expectedZone = zoneForSession(w.sessionType, false);
  const clean = (text) => {
    if (typeof text !== "string" || !text.trim() || BANNED_TEXT.test(text)) return false;
    return (text.match(/Zone \d(?:–\d)?/g) ?? []).every((z) => z === expectedZone);
  };
  return {
    ...w,
    title: clean(w.title) ? w.title : (fallback?.title ?? "Training"),
    desc: clean(w.desc) ? w.desc : (fallback?.desc ?? "Training."),
    pace: cleanPace(w.pace),
  };
}

function finalizeSession(input, index, days, ctx) {
  const { _srcKm: srcKm, ...w } = input;
  if (w.sessionType === "easy" && srcKm > 0 && Math.abs(w.km - srcKm) / srcKm > EASY_TITLE_KM_CHANGE) {
    w.title = easyTitleFor(w.km, days.length - 1 - index);
  }
  if (w.sessionType === "rest") {
    // Titel immer "Ruhetag": Claudes Freitext ("Ruhetag vor Renntag" drei Tage vorher) wäre irreführend.
    const desc = typeof w.desc === "string" && w.desc.trim() && !BANNED_TEXT.test(w.desc) ? w.desc : "Ruhetag.";
    return { ...w, title: "Ruhetag", desc, structured: null, pace: null };
  }
  if (!RUN_TYPES.has(w.sessionType) && w.sessionType !== "race") return cleanSupportSession(w);
  let session = { ...w };
  if (isHard(session) && !isValidStructure(session.structured, session.km)) {
    session = shapeHardSession(session, session.km, ctx);
  }
  if (!isHard(session)) session = { ...session, structured: null };
  const wn = weekIndexOf(dayOf(session), mondayOf(ctx.startYmd));
  const text = renderSession(session, {
    isRecoveryWeek: ctx.isDeload?.[wn - 1] === true,
    raceTitle: ctx.raceTitle || "Rennen",
  });
  return {
    ...session,
    title: text.title,
    desc: text.desc,
    structured: text.structured,
    pace: cleanPace(session.pace),
    intensity: isHard(session) || session.sessionType === "race" ? "high" : session.sessionType === "long" ? "medium" : "low",
  };
}

/** Titel eines lockeren Laufs aus Rolle und km (statt Claudes Titel, wenn der Code die km stark geändert hat). */
function easyTitleFor(km, daysBeforeRace) {
  if (daysBeforeRace >= 1 && daysBeforeRace <= 2) return "Lockerer Lauf vor dem Rennen";
  if (km <= 6) return "Kurzer lockerer Lauf";
  return "Lockerer Dauerlauf";
}

/** Tauscht zwei Einheiten samt Datum (jeder Tag behält genau eine Einheit). */
function swapDays(days, a, b) {
  const tmp = days[a].dateIso;
  days[a] = { ...days[a], dateIso: days[b].dateIso };
  days[b] = { ...days[b], dateIso: tmp };
  [days[a], days[b]] = [days[b], days[a]];
}

/** Verschiebt harte Einheiten vom Vortag eines Long Runs/Rennens auf einen lockeren Tag, sonst herabstufen. */
function fixHardBeforeLong(days, last, guard) {
  const weekOf = new Map();
  (guard?.weeks ?? []).forEach((idxs, wi) => idxs.forEach((i) => weekOf.set(i, wi)));
  // nie näher als `hardMinGap` ans Rennen und nie von außen in die Rennwoche (dort höchstens eine harte Einheit)
  const tooCloseToRace = (j, from) =>
    guard?.raceWeekIdx?.has(j) && (last - j < guard.hardMinGap || !guard.raceWeekIdx.has(from));
  const conflicts = (i) =>
    isHard(days[i]) && days[i + 1] && (days[i + 1].sessionType === "long" || days[i + 1].sessionType === "race");
  const hardNeighbour = (i) => (isHard(days[i - 1]) ? true : isHard(days[i + 1]));
  const swap = (a, b) => swapDays(days, a, b);

  for (let i = 0; i <= last; i += 1) {
    if (!conflicts(i)) continue;
    const order = [-1, -2, -3, 2, 3];
    let moved = false;
    for (const delta of order) {
      const j = i + delta;
      if (j < 0 || j > last - 3) continue;
      if (weekOf.get(j) !== weekOf.get(i) || tooCloseToRace(j, i)) continue;
      if (days[j].sessionType !== "easy") continue;
      swap(i, j);
      const ok = !conflicts(j) && !conflicts(i) && !hardNeighbour(j) && !(j > 0 && conflicts(j - 1));
      if (ok) {
        moved = true;
        break;
      }
      swap(i, j);
    }
    if (!moved) days[i] = asEasy(days[i]);
  }
}

/**
 * I8 — keine zwei harten Einheiten (Intervall, Tempo, Rennen) an aufeinanderfolgenden Tagen. Die zweite Einheit
 * wandert innerhalb ihrer Woche auf einen lockeren, sonst freien Tag; nie auf einen Wunsch-Ruhetag (`restDows`),
 * nie in die Anfahrt, nie neben eine andere harte Einheit und nie vor einen Long Run (I4). Gibt es keinen
 * solchen Tag, wird sie zu einem lockeren Lauf.
 */
function fixConsecutiveHard(days, last, weeks, approachIdx, restDows, guard) {
  const hardAt = (k) => k >= 0 && k <= last && isHardOrRace(days[k]);
  const weekOf = new Map();
  weeks.forEach((idxs) => idxs.forEach((i) => weekOf.set(i, idxs)));

  for (let i = 1; i <= last; i += 1) {
    if (!hardAt(i) || !hardAt(i - 1)) continue;
    const mover = days[i].sessionType === "race" ? i - 1 : i;
    const otherHard = (k) => k !== mover && hardAt(k);
    let best = null;
    let bestScore = Infinity;
    for (const j of weekOf.get(mover) ?? []) {
      if (j === mover || j === last || approachIdx.has(j)) continue;
      if (guard?.raceWeekIdx?.has(j) && (last - j < guard.hardMinGap || !guard.raceWeekIdx.has(mover))) continue;
      const type = days[j].sessionType;
      if (type !== "easy" && type !== "rest") continue;
      if (type === "rest" && restDows.has(dowOf(dayOf(days[j])))) continue;
      if (otherHard(j - 1) || otherHard(j + 1)) continue;
      const next = days[j + 1];
      if (j + 1 !== mover && next && (next.sessionType === "long" || next.sessionType === "race")) continue;
      // Rangfolge: nicht direkt nach dem Long Run, lockerer vor freiem Tag, größter Abstand zur nächsten harten
      // Einheit, möglichst nah am ursprünglichen Tag.
      const gap = otherHard(j - 2) || otherHard(j + 2) ? 2 : 3;
      const afterLong = days[j - 1]?.sessionType === "long";
      const score = (afterLong ? 100 : 0) + (type === "rest" ? 10 : 0) - gap + Math.abs(j - mover) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best != null) swapDays(days, mover, best);
    else days[mover] = asEasy(days[mover]);
  }
}

/**
 * Long-Run-Ziel je Einheit: wächst bis 2–3 Wochen vor dem Rennen, danach fallend (I2).
 * Jede Woche bleibt zwischen ihrer Untergrenze und ihrer Obergrenze (`longRunCap`, I10; Ultra: peakLongRunKm).
 * Die Untergrenze: 20 % des Wochenziels (volle Wochen außer der Rennwoche, I10) und lang genug, dass Schritt 6
 * das Wochenziel erreicht, ohne dass ein lockerer Lauf länger wird als der Long Run (I9).
 * Vorrang bei Konflikt (freigegeben von Anton am 2026-11-01): I2 vor der Untergrenze. Kein Long Run wird länger
 * als die Spitze, nach der Spitze fällt die Reihe; eine Untergrenze darüber bleibt dann unerfüllt.
 *
 * @returns {{ targets: Map<number, number>, maxKm: Map<number, number>, order: object|null }} Ziel und I2-Grenze
 *   je Long Run (Index → km); bis zur I2-Grenze darf Schritt 7 einen Long Run anheben, ohne den Verlauf zu brechen.
 *   `order` (Indizes): Spitze, Kette davor (ohne Entlastung/Teilwochen), übrige davor, alle danach — für Schritt 7b.
 */
function planLongRuns(days, weeks, ctx, ultra, last, approachIdx) {
  const targets = new Map();
  const maxKm = new Map();
  const startMonday = mondayOf(ctx.startYmd);
  const longs = [];
  days.forEach((w, i) => {
    if (w.sessionType !== "long") return;
    const wn = weekIndexOf(dayOf(w), startMonday);
    const idxs = weeks[wn - 1] ?? [];
    const target = ctx.weeklyKmTargets?.[wn - 1] ?? 0;
    const raceKmInWeek = idxs.includes(last) ? round1(ctx.raceKm) : 0;
    const fullWeek = idxs.length >= 7;
    const runCount = idxs.filter((k) => isRunSession(days[k])).length;
    let ceil = Infinity;
    if (ultra) ceil = ctx.peakLongRunKm > 0 ? ctx.peakLongRunKm : Infinity;
    else if (target > 0) ceil = longRunCap(ctx, wn, target, runCount, weekMix(idxs.filter((k) => k !== last).map((k) => days[k]))) * target;
    // Folgepunkt (f): Long Run nie länger als für diese Woche vorgesehen, auch wenn wenige Läufe das Ziel tragen müssten
    const absMax = ctx.longRunMaxKm?.[wn - 1];
    if (absMax > 0) ceil = Math.min(ceil, absMax);
    let floor = 0;
    if (target > 0) {
      const fit = minLongForVolume(days, idxs, Math.max(0, target - raceKmInWeek), target, ctx, approachIdx, last);
      const minShare = !ultra && fullWeek && !idxs.includes(last) && !idxs.some((k) => ctx.raceWindow?.has(k)) ? LONG_RUN_MIN_SHARE * target : 0;
      floor = Math.min(ceil, Math.max(fit, minShare));
    }
    longs.push({ i, ymd: dayOf(w), wn, floor, ceil, fullWeek, deload: ctx.isDeload?.[wn - 1] === true });
  });
  if (longs.length === 0) return { targets, maxKm, order: null };

  const minDays = longRunMinDaysBeforeRace(ctx.distKey);
  let peak = 0;
  longs.forEach((l, k) => {
    if (diffDays(ctx.raceYmd, l.ymd) >= minDays) peak = k;
  });

  const peakTarget = ctx.weeklyKmTargets?.[longs[peak].wn - 1] ?? 0;
  const share = longRunShare(ctx, longs[peak].wn, peakTarget);
  const basePeak = ultra
    ? ctx.peakLongRunKm
    : Math.min(share * peakTarget, Math.max(ctx.peakLongRunKm, 0.22 * peakTarget));
  // Die Spitze bleibt der längste Lauf: sie trägt, soweit ihre Obergrenze es zulässt, die Untergrenzen der anderen Wochen.
  const neededAtPeak = longs.map((l, k) => (k > peak ? l.floor + 0.2 : l.floor));
  const lpk = Math.min(longs[peak].ceil, Math.max(basePeak, ...neededAtPeak));
  const lstart = LONG_RUN_START_FRACTION * lpk;

  const values = longs.map((l, k) => {
    let v;
    if (k <= peak) {
      const t = peak === 0 ? 1 : k / peak;
      v = lstart + (lpk - lstart) * t;
      if (l.deload) v *= LONG_RUN_DELOAD_FACTOR;
    } else {
      v = lpk * (LONG_RUN_AFTER_PEAK_FRACTIONS[Math.min(k - peak, LONG_RUN_AFTER_PEAK_FRACTIONS.length) - 1]);
    }
    return Math.min(l.ceil, Math.max(l.floor, v));
  });

  // Untergrenzen können den Verlauf stören: bis zur Spitze nicht fallend (Entlastung und Teilwochen ausgenommen)
  // und nie länger als die Spitze, nach der Spitze nie länger als der Long Run davor und immer kürzer als die
  // Spitze. Steigt der Wochenumfang nach dem längsten Lauf noch, trägt jede Woche nach der Spitze schon die
  // höchste Untergrenze der folgenden Wochen, soweit I2 das erlaubt.
  const chain = [];
  let previous = 0;
  for (let k = 0; k < peak; k += 1) {
    values[k] = Math.min(values[k], lpk);
    if (longs[k].deload || !longs[k].fullWeek) continue;
    values[k] = Math.min(longs[k].ceil, lpk, Math.max(values[k], previous));
    previous = values[k];
    chain.push(k);
  }
  values[peak] = Math.max(values[peak], Math.min(longs[peak].ceil, previous));
  const peakKm = round1(values[peak]);
  let ceiling = peakKm - 0.1;
  for (let k = peak + 1; k < longs.length; k += 1) {
    const laterFloor = Math.max(...longs.slice(k).map((l) => l.floor));
    values[k] = Math.min(ceiling, Math.max(values[k], laterFloor));
    maxKm.set(longs[k].i, round1(ceiling));
    ceiling = values[k];
  }
  // I2-Grenzen vor der Spitze: ein Glied der Kette bis zum nächsten Glied, die übrigen bis zur Spitze
  chain.push(peak);
  for (let k = 0; k < peak; k += 1) {
    const next = chain.find((c) => c > k);
    maxKm.set(longs[k].i, chain.includes(k) ? round1(values[next]) : peakKm);
  }
  maxKm.set(longs[peak].i, Math.floor(longs[peak].ceil * 10) / 10);

  longs.forEach((l, k) => {
    targets.set(l.i, round1(values[k]));
    maxKm.set(l.i, Math.min(maxKm.get(l.i), Math.floor(l.ceil * 10) / 10));
  });
  const order = {
    peak: longs[peak].i,
    chain: chain.filter((k) => k !== peak).map((k) => longs[k].i),
    otherBefore: longs.slice(0, peak).filter((_, k) => !chain.includes(k)).map((l) => l.i),
    after: longs.slice(peak + 1).map((l) => l.i),
  };
  return { targets, maxKm, order };
}

// ── Prüfung ─────────────────────────────────────────────────────────────────────────────────
/**
 * Prüft die Invarianten I1–I6 und I8–I10 an einer fertigen Workout-Liste (I7, der Phasenname, hängt an den
 * Wochen, nicht an den Einheiten).
 * @returns {string[]} Verstöße als "<Code>: <Beschreibung>" (leer = alles in Ordnung)
 */
function checkPlanInvariants(workouts, ctx) {
  const problems = [];
  const days = [...workouts].filter((w) => isYmd(dayOf(w))).sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  const startMonday = mondayOf(ctx.startYmd);
  const ultra = ctx.distKey === "ultra";
  const raceIdx = days.findIndex((w) => w.sessionType === "race");
  const caps = approachCaps(ctx.raceKm);

  // I3 — Rennen ist die letzte Einheit, Anfahrt locker oder frei
  const races = days.filter((w) => w.sessionType === "race");
  if (races.length !== 1) problems.push(`I3: ${races.length} Rennen im Plan`);
  if (days.length > 0 && dayOf(days[days.length - 1]) !== ctx.raceYmd) problems.push("I3: Plan endet nicht am Renntag");
  if (raceIdx >= 0 && days[raceIdx] !== days[days.length - 1]) problems.push("I3: Einheit nach dem Rennen");
  for (const [k, cap] of [
    [1, caps.dMinus1],
    [2, caps.dMinus2],
  ]) {
    const w = days.find((x) => dayOf(x) === addDays(ctx.raceYmd, -k));
    if (!w) continue;
    if (w.sessionType !== "easy" && w.sessionType !== "rest") problems.push(`I3: Renntag −${k} ist ${w.sessionType}`);
    if (w.sessionType === "easy" && w.km > cap + 0.05) problems.push(`I3: Renntag −${k} mit ${w.km} km (max ${cap})`);
  }

  // I4 — keine harte Einheit am Vortag von Long Run oder Rennen
  days.forEach((w, i) => {
    const next = days[i + 1];
    if (isHard(w) && next && diffDays(dayOf(next), dayOf(w)) === 1 && (next.sessionType === "long" || next.sessionType === "race")) {
      problems.push(`I4: ${w.sessionType} am ${dayOf(w)} vor ${next.sessionType}`);
    }
  });

  // Wochenzusammenfassung
  const weekKm = [];
  const weekLongs = [];
  const weekEasyKm = [];
  const weekRunCount = [];
  const weekSessions = [];
  days.forEach((w) => {
    const wnOf = weekIndexOf(dayOf(w), startMonday);
    (weekSessions[wnOf - 1] ??= []).push(w);
  });
  const weekMixOf = (wn) => weekMix((weekSessions[wn - 1] ?? []).filter((w) => w.sessionType !== "race"));
  days.forEach((w) => {
    const wn = weekIndexOf(dayOf(w), startMonday);
    weekKm[wn - 1] = (weekKm[wn - 1] ?? 0) + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0);
    weekRunCount[wn - 1] = (weekRunCount[wn - 1] ?? 0) + (isRunSession(w) ? 1 : 0);
    if (w.sessionType === "long") (weekLongs[wn - 1] ??= []).push(w);
    if (w.sessionType === "easy") (weekEasyKm[wn - 1] ??= []).push(w.km);
  });
  const totalWeeks = ctx.totalWeeks ?? weekKm.length;
  const peakWeek = totalWeeks - (ctx.taperWeeks ?? 1);
  // Taper-Wochen, die in die 7 Tage bis zum Rennen reichen, zählen wie die Rennwoche (keine Anteilsregeln)
  const isTaperWeek = (wn) => wn === totalWeeks || !ctx.weekPhaseSchedule || ctx.weekPhaseSchedule[wn - 1]?.phase === "taper";
  const raceWindowStart = addDays(ctx.raceYmd, -(RACE_WINDOW_DAYS - 1));
  const touchesRaceWindow = (wn) => isTaperWeek(wn) && addDays(startMonday, wn * 7 - 1) >= raceWindowStart;
  const isShareBandWeek = (wn) => wn !== totalWeeks && !touchesRaceWindow(wn) && (ctx.weekDays?.[wn - 1] ?? 7) >= 7;

  // I1 — Umfang steigt bis zur Spitze (Entlastung ausgenommen), danach Taper fallend
  let previous = null;
  for (let w = 1; w <= peakWeek; w += 1) {
    const full = (ctx.weekDays?.[w - 1] ?? 7) >= 7;
    const km = weekKm[w - 1] ?? 0;
    if (ctx.isDeload?.[w - 1]) {
      if (w >= peakWeek - 1) problems.push(`I1: Entlastung in Woche ${w} (Peak ${peakWeek})`);
      continue;
    }
    if (!full) continue;
    if (previous != null && km < previous * 0.97 - 0.5) problems.push(`I1: Woche ${w} fällt auf ${round1(km)} km (zuvor ${round1(previous)})`);
    previous = km;
  }
  let before = weekKm[peakWeek - 1] ?? 0;
  for (let w = peakWeek + 1; w <= totalWeeks; w += 1) {
    const km = weekKm[w - 1] ?? 0;
    if (km > before + 0.05) problems.push(`I1: Taper-Woche ${w} steigt auf ${round1(km)} km (zuvor ${round1(before)})`);
    before = km;
  }

  // I1 — kein flacher Plan: Entlastung ≤ 90 % der Woche davor, volle Taper-Woche ≤ 90 % der Spitze, Spitze
  // ≥ 103 % der ersten vollen Aufbauwoche, sofern bis zur Spitze mindestens drei volle Wochen liegen (fängt Pläne,
  // die I9 und der Long-Run-Anteil auf eine Woche drücken)
  const buildKm = weekKm.slice(0, peakWeek);
  const peakBuildKm = Math.max(0, ...buildKm.map((km) => km ?? 0));
  for (let w = 2; w <= peakWeek; w += 1) {
    if (ctx.isDeload?.[w - 1] && (weekKm[w - 1] ?? 0) > FLAT_FACTOR * (weekKm[w - 2] ?? 0) + 0.05) {
      problems.push(`I1: Entlastung in Woche ${w} mit ${round1(weekKm[w - 1] ?? 0)} km (Woche davor ${round1(weekKm[w - 2] ?? 0)})`);
    }
  }
  for (let w = peakWeek + 1; w <= totalWeeks; w += 1) {
    if ((ctx.weekDays?.[w - 1] ?? 7) >= 7 && (weekKm[w - 1] ?? 0) > FLAT_FACTOR * peakBuildKm + 0.05) {
      problems.push(`I1: Taper-Woche ${w} mit ${round1(weekKm[w - 1] ?? 0)} km kaum unter der Spitze (${round1(peakBuildKm)})`);
    }
  }
  const firstBuild = buildKm.findIndex((km, i) => km > 0 && !ctx.isDeload?.[i] && (ctx.weekDays?.[i] ?? 7) >= 7);
  if (firstBuild >= 0 && firstBuild < peakWeek - 2 && peakBuildKm < MIN_VOLUME_GROWTH * buildKm[firstBuild] - 0.05) {
    problems.push(`I1: Umfang steigt nicht (Woche ${firstBuild + 1}: ${round1(buildKm[firstBuild])} km, Spitze ${round1(peakBuildKm)} km)`);
  }

  // I2 — Long Run wächst bis 2–3 Wochen vor dem Rennen, danach fallend, Anteil begrenzt
  const longs = days.filter((w) => w.sessionType === "long");
  weekLongs.forEach((list, wi) => {
    if (list && list.length > 1) problems.push(`I2: ${list.length} Long Runs in Woche ${wi + 1}`);
  });
  if (longs.length > 0) {
    const maxKm = Math.max(...longs.map((w) => w.km));
    const peakLong = longs.filter((w) => w.km === maxKm).pop();
    const minDays = longRunMinDaysBeforeRace(ctx.distKey);
    const gap = diffDays(ctx.raceYmd, dayOf(peakLong));
    if (gap < minDays || gap > minDays + 6) problems.push(`I2: längster Lauf ${gap} Tage vor dem Rennen (erwartet ${minDays}–${minDays + 6})`);
    if (longs[0] !== peakLong && maxKm < MIN_LONG_GROWTH * longs[0].km - 0.05) problems.push(`I2: Long Run wächst nicht (erster ${longs[0].km} km, längster ${maxKm} km)`);
    let prevLong = null;
    longs.forEach((w) => {
      const wn = weekIndexOf(dayOf(w), startMonday);
      if (diffDays(dayOf(w), dayOf(peakLong)) > 0) return;
      if (ctx.isDeload?.[wn - 1]) return;
      if ((ctx.weekDays?.[wn - 1] ?? 7) < 7) return;
      if (prevLong != null && w.km < prevLong - LONG_RUN_TOLERANCE_KM) problems.push(`I2: Long Run fällt in Woche ${wn} (${w.km} km)`);
      prevLong = w.km;
    });
    let afterPeak = peakLong.km;
    longs.forEach((w) => {
      if (diffDays(dayOf(w), dayOf(peakLong)) <= 0) return;
      if (w.km > afterPeak + LONG_RUN_TOLERANCE_KM) problems.push(`I2: Long Run steigt nach der Spitze (${w.km} km)`);
      afterPeak = w.km;
    });
    // Anteil am Wochenumfang: volle Wochen außer der Rennwoche prüft I10 (20–30 %), hier nur die Obergrenze der übrigen
    if (!ultra) {
      longs.forEach((w) => {
        const wn = weekIndexOf(dayOf(w), startMonday);
        if (isShareBandWeek(wn) || touchesRaceWindow(wn)) return;
        const total = (weekKm[wn - 1] ?? 0) + (wn === totalWeeks ? ctx.raceKm : 0);
        if ((weekRunCount[wn - 1] ?? 0) < 2 || total <= 0) return;
        const share = longRunCap(ctx, wn, total, weekRunCount[wn - 1], weekMixOf(wn));
        if (w.km / total > share + 0.005) problems.push(`I2: Long Run ${w.km} km = ${Math.round((w.km / total) * 100)} % der Woche ${wn}`);
      });
    }
  }

  // I8 — keine zwei harten Einheiten (Intervall, Tempo, Rennen) an aufeinanderfolgenden Tagen
  days.forEach((w, i) => {
    const next = days[i + 1];
    if (isHardOrRace(w) && isHardOrRace(next) && diffDays(dayOf(next), dayOf(w)) === 1) {
      problems.push(`I8: ${w.sessionType} am ${dayOf(w)} und ${next.sessionType} am Tag danach`);
    }
  });

  // I9 — lockerer Lauf ≤ 60 % des Long Runs derselben Woche (ohne Long Run: des letzten davor; Renntag −1/−2 haben
  // eigene Grenzen über I3, zählen hier aber mit)
  let lastLong = 0;
  weekKm.forEach((_, wi) => {
    const list = weekLongs[wi];
    const longest = list ? Math.max(...list.map((w) => w.km)) : lastLong;
    const easyMax = Math.max(0, ...(weekEasyKm[wi] ?? []));
    if (longest > 0 && easyMax > EASY_TO_LONG_MAX * longest + 0.05) {
      problems.push(`I9: Woche ${wi + 1}: lockerer Lauf ${easyMax} km über 60 % des Long Runs (${longest} km)`);
    }
    if (list) lastLong = longest;
  });

  // I11 — Anstieg der vollen Aufbauwochen ≤ 10 %: km[w] ≤ 1,1 × max(km[w−1], Niveau vor der Entlastung)
  let level = null;
  for (let w = 1; w <= peakWeek; w += 1) {
    const full = (ctx.weekDays?.[w - 1] ?? 7) >= 7;
    const prevFull = w > 1 && (ctx.weekDays?.[w - 2] ?? 7) >= 7;
    const km = weekKm[w - 1] ?? 0;
    if (full && prevFull) {
      const ref = Math.max(weekKm[w - 2] ?? 0, level ?? 0);
      if (km > MAX_WEEKLY_GROWTH * ref + 0.3) problems.push(`I11: Woche ${w} steigt auf ${round1(km)} km (Bezug ${round1(ref)} km)`);
    }
    if (full && !ctx.isDeload?.[w - 1]) level = km;
  }

  // I12 — genau ein Long Run in jeder Woche mit mindestens 5 Plantagen vor den 7 Tagen bis zum Rennen; dort keiner
  const weekDayCount = [];
  days.forEach((w) => {
    const wn = weekIndexOf(dayOf(w), startMonday);
    const inWindow = diffDays(ctx.raceYmd, dayOf(w)) < RACE_WINDOW_DAYS && isTaperWeek(wn);
    if (!inWindow) weekDayCount[wn - 1] = (weekDayCount[wn - 1] ?? 0) + 1;
    else if (w.sessionType === "long") problems.push(`I12: Long Run am ${dayOf(w)} in den 7 Tagen vor dem Rennen`);
  });
  for (let w = 1; w < totalWeeks; w += 1) {
    const count = weekLongs[w - 1]?.length ?? 0;
    if ((weekDayCount[w - 1] ?? 0) >= 5 && count !== 1) problems.push(`I12: Woche ${w} hat ${count} Long Runs`);
  }

  // I13 — Rennwoche (Renntag −6 bis −1): ≤ 40 % der Spitze; höchstens eine harte Einheit, ≤ 8 km, frühestens Renntag −N
  const inRaceWindow = (w) => {
    const gap = diffDays(ctx.raceYmd, dayOf(w));
    return gap >= 1 && gap < RACE_WINDOW_DAYS && isTaperWeek(weekIndexOf(dayOf(w), startMonday));
  };
  const raceWeekKm = days.filter((w) => inRaceWindow(w) && w.sport !== "rest").reduce((sum, w) => sum + w.km, 0);
  if (peakBuildKm > 0 && raceWeekKm > RACE_WEEK_MAX_SHARE * peakBuildKm + 0.3) {
    problems.push(`I13: Rennwoche ohne Rennen ${round1(raceWeekKm)} km (Spitze ${round1(peakBuildKm)} km)`);
  }
  const minGap = raceWeekHardMinGap(ctx.distKey);
  const raceWeekHard = days.filter((w) => isHard(w) && inRaceWindow(w));
  if (raceWeekHard.length > 1) problems.push(`I13: ${raceWeekHard.length} harte Einheiten in der Rennwoche`);
  for (const w of raceWeekHard) {
    if (w.km > RACE_WEEK_HARD_MAX_KM + 0.05) problems.push(`I13: harte Einheit am ${dayOf(w)} mit ${w.km} km in der Rennwoche`);
    if (diffDays(ctx.raceYmd, dayOf(w)) < minGap) problems.push(`I13: harte Einheit am ${dayOf(w)} weniger als ${minGap} Tage vor dem Rennen`);
  }

  // I10 — Long Run 20 % bis `longRunCap` des Wochenumfangs (volle Wochen, Rennwoche ausgenommen). I2 hat Vorrang:
  // vor der Spitze reicht die Untergrenze nur bis zum kürzesten späteren Long Run der Kette (Entlastung und
  // Teilwochen zählen nicht), nach der Spitze nur bis knapp unter den Long Run davor.
  if (!ultra && longs.length > 0) {
    const peakKm = Math.max(...longs.map((w) => w.km));
    const peakLong = longs.filter((w) => w.km === peakKm).pop();
    const inChain = (w) => {
      const wn = weekIndexOf(dayOf(w), startMonday);
      return !ctx.isDeload?.[wn - 1] && (ctx.weekDays?.[wn - 1] ?? 7) >= 7;
    };
    let previousLong = null;
    longs.forEach((w) => {
      const afterPeak = diffDays(dayOf(w), dayOf(peakLong)) > 0;
      const laterInChain = longs.filter((x) => x !== w && (x === peakLong || (dayOf(x) > dayOf(w) && dayOf(x) < dayOf(peakLong) && inChain(x))));
      const i2Bound = afterPeak ? (previousLong?.km ?? peakKm) - 0.1 : Math.min(...laterInChain.map((x) => x.km));
      previousLong = afterPeak ? w : previousLong;
      const wn = weekIndexOf(dayOf(w), startMonday);
      const total = weekKm[wn - 1] ?? 0;
      if (!isShareBandWeek(wn) || (weekRunCount[wn - 1] ?? 0) < 2 || total <= 0) return;
      const ratio = w.km / total;
      const share = longRunCap(ctx, wn, total, weekRunCount[wn - 1], weekMixOf(wn));
      const lowerKm = Math.min(LONG_RUN_MIN_SHARE * total, i2Bound);
      if (w.km < lowerKm - 0.005 * total || ratio > share + 0.005) {
        problems.push(`I10: Long Run ${w.km} km = ${Math.round(ratio * 100)} % der Woche ${wn} (erlaubt 20–${Math.round(share * 100)} %)`);
      }
    });
  }
  // I5 — km einer Einheit = Summe ihrer Bausteine (±10 %), km im Text = km der Einheit
  days.forEach((w) => {
    if (isHard(w)) {
      const sum = kmFromDesc(w.desc);
      if (!(sum > 0)) problems.push(`I5: ${w.sessionType} am ${dayOf(w)} ohne Bausteine im Text`);
      else if (Math.abs(sum - w.km) > 0.1 * w.km) problems.push(`I5: ${w.sessionType} am ${dayOf(w)}: ${w.km} km, Bausteine ${sum} km`);
    } else if ((w.sessionType === "easy" || w.sessionType === "long") && typeof w.desc === "string") {
      for (const m of w.desc.matchAll(/(\d+(?:,\d+)?)\s*km/g)) {
        if (m[1] !== fmtKm(w.km)) problems.push(`I5: Text nennt ${m[1]} km, Einheit hat ${w.km} km (${dayOf(w)})`);
      }
    }
  });

  // I6 — eine Zonensprache: keine GA-Begriffe, keine %HFmax/bpm im Text, Zone im Text = Zone der Einheit
  days.forEach((w) => {
    const text = `${w.title ?? ""} ${w.desc ?? ""}`;
    if (BANNED_TEXT.test(text)) problems.push(`I6: Pulsbegriff im Text am ${dayOf(w)}`);
    const wn = weekIndexOf(dayOf(w), startMonday);
    const zone = zoneForSession(w.sessionType, ctx.isDeload?.[wn - 1] === true);
    const mentioned = text.match(/Zone \d(?:–\d)?/g) ?? [];
    for (const z of mentioned) {
      if (z !== zone) problems.push(`I6: Text nennt ${z}, Einheit gehört zu ${zone} (${dayOf(w)})`);
    }
  });
  return problems;
}

module.exports = {
  enforcePlanInvariants,
  checkPlanInvariants,
  distribute,
  approachCaps,
  easyMinKm,
  hardBounds,
  longRunMinDaysBeforeRace,
  longRunCap,
  weekMix,
  raceWeekHardMinGap,
  RACE_WEEK_HARD_MAX_KM,
  weekCapacityKm,
  weekCarryKm,
  EASY_TO_LONG_MAX,
  dayOf,
  addDays,
  diffDays,
  mondayOf,
  dowOf,
  weekIndexOf,
  HARD_TYPES,
};
