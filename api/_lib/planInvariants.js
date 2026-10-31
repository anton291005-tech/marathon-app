"use strict";

/**
 * Harte Plan-Invarianten als Code (nicht als Prompt-Regel). `enforcePlanInvariants` läuft einmal über den
 * zusammengeführten Plan, egal ob er von Claude (phasedFullPlanGenerator) oder vom deterministischen
 * Generator stammt. `checkPlanInvariants` prüft dieselben Regeln und liefert Verstöße (Tests, Log).
 *
 * Reihenfolge in enforcePlanInvariants:
 *   1 Plan endet mit dem Rennen · 2 Anfahrt (Renntag −2/−1) · 3 genau ein Long Run pro Woche
 *   4 keine harte Einheit am Vortag von Long Run/Rennen · 5 Long-Run-Progression · 6 Wochenumfang aufs Ziel
 *   7 Long-Run-Anteil ≤ 30 %/33 % (Überschuss wird gestrichen, nie auf Intervall/Tempo gelegt)
 *   8 Bausteine → km, Titel und Beschreibung aus den Bausteinen (planSessionText.js), nie aus Claudes Freitext
 *
 * Reine Funktionen, keine I/O, keine Nutzerinhalte im Log.
 */

const {
  shapeHardSession,
  renderSession,
  kmFromDesc,
  isValidStructure,
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
const HIGH_VOLUME_WEEKLY_KM = 120;
const LONG_RUN_START_FRACTION = 0.65;
const LONG_RUN_DELOAD_FACTOR = 0.8;
const LONG_RUN_AFTER_PEAK_FRACTIONS = [0.7, 0.5];
const LONG_RUN_TOLERANCE_KM = 0.15;

/** 33 % nur in Peak-Wochen ab 120 km, sonst 30 % (wie planWorkoutUtils.applyLongRunCapPerWeek). */
function longRunShare(ctx, weekNumber, weekKm) {
  const peak = ctx.weekPhaseSchedule?.[weekNumber - 1]?.phase === "peak";
  return peak && weekKm >= HIGH_VOLUME_WEEKLY_KM ? LONG_RUN_SHARE_HIGH_VOLUME : LONG_RUN_SHARE;
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
    days.push(w ? { ...w } : restDay(d));
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

  // 3 — genau ein Long Run pro Woche (außer in der Rennwoche)
  const weeks = groupByWeek(days, startYmd);
  const raceWeek = weeks.length;
  weeks.forEach((idxs, wi) => {
    const wn = wi + 1;
    const longs = idxs.filter((i) => days[i].sessionType === "long");
    if (wn === raceWeek) {
      longs.forEach((i) => {
        days[i] = asEasy(days[i]);
      });
      return;
    }
    if (idxs.length < 5) {
      // Stub-Woche (Planstart mitten in der Woche): zu kurz für einen Long Run
      longs.forEach((i) => {
        days[i] = asEasy(days[i]);
      });
    } else if (longs.length > 1) {
      const keep = longs.reduce((a, b) => (days[b].km > days[a].km ? b : a));
      longs.forEach((i) => {
        if (i !== keep) days[i] = asEasy(days[i]);
      });
    } else if (longs.length === 0) {
      const onDow = idxs.find(
        (i) => !approachIdx.has(i) && days[i].sessionType === "easy" && dowOf(dayOf(days[i])) === longRunDow,
      );
      if (onDow != null) days[onDow] = asLong(days[onDow]);
    }
  });

  // 4 — keine harte Einheit am Vortag eines Long Runs oder des Rennens
  fixHardBeforeLong(days, last);

  // 5 — Long-Run-Ziele je Woche
  const longTargets = planLongRuns(days, weeks, ctx, ultra);

  // 6 — Wochenumfang aufs Ziel (nur lockere Läufe sind frei, Struktur-Einheiten behalten ihre Form)
  const caps = approachCaps(ctx.raceKm);
  const hb = hardBounds(ctx.raceKm);
  const easyMin = easyMinKm(ctx.raceKm);
  weeks.forEach((idxs, wi) => {
    const target = ctx.weeklyKmTargets?.[wi];
    if (!(target > 0)) return;
    const raceKmInWeek = idxs.includes(last) ? round1(ctx.raceKm) : 0;
    const longIdx = idxs.find((i) => days[i].sessionType === "long");
    const longKm = longIdx != null ? Math.min(longTargets.get(longIdx) ?? 0, Math.max(0, target - raceKmInWeek)) : 0;

    const hard = idxs.filter((i) => isHard(days[i]));
    let easy = idxs.filter((i) => days[i].sessionType === "easy" && i !== last);
    const remaining = round1(target - raceKmInWeek - longKm);

    const hardItems = () =>
      hard.map((i) => ({
        weight: 1.15,
        min: hb.min,
        max: days[i].sessionType === "interval" ? hb.maxInterval : hb.maxTempo,
      }));
    const easyItems = () =>
      easy.map((i) => ({
        weight: approachIdx.has(i) ? 0.6 : 1,
        min: approachIdx.has(i) ? 3 : easyMin,
        max: i === last - 1 ? caps.dMinus1 : i === last - 2 ? caps.dMinus2 : Math.max(easyMin, 0.45 * target),
      }));

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

  // 7 — Long-Run-Anteil: Überschuss aus der Woche streichen (nie auf harte Einheiten legen)
  if (!ultra) {
    weeks.forEach((idxs, wi) => {
      const longIdx = idxs.find((i) => days[i].sessionType === "long");
      if (longIdx == null) return;
      const total = idxs.reduce((s, i) => s + (isRunSession(days[i]) || days[i].sessionType === "race" ? days[i].km : 0), 0);
      const others = total - days[longIdx].km;
      if (others <= 0) return;
      const share = longRunShare(ctx, wi + 1, total);
      const maxLong = Math.floor(((share / (1 - share)) * others) * 10) / 10;
      if (days[longIdx].km > maxLong) days[longIdx] = { ...days[longIdx], km: maxLong };
    });
  }

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

function finalizeSession(w, index, days, ctx) {
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

/** Verschiebt harte Einheiten vom Vortag eines Long Runs/Rennens auf einen lockeren Tag, sonst herabstufen. */
function fixHardBeforeLong(days, last) {
  const conflicts = (i) =>
    isHard(days[i]) && days[i + 1] && (days[i + 1].sessionType === "long" || days[i + 1].sessionType === "race");
  const hardNeighbour = (i) => (isHard(days[i - 1]) ? true : isHard(days[i + 1]));
  const swap = (a, b) => {
    const tmp = days[a].dateIso;
    days[a] = { ...days[a], dateIso: days[b].dateIso };
    days[b] = { ...days[b], dateIso: tmp };
    [days[a], days[b]] = [days[b], days[a]];
  };

  for (let i = 0; i <= last; i += 1) {
    if (!conflicts(i)) continue;
    const order = [-1, -2, -3, 2, 3];
    let moved = false;
    for (const delta of order) {
      const j = i + delta;
      if (j < 0 || j > last - 3) continue;
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

/** Long-Run-Ziel je Einheit (Map Index → km): wächst bis 2–3 Wochen vor dem Rennen, danach fallend. */
function planLongRuns(days, weeks, ctx, ultra) {
  const result = new Map();
  const startMonday = mondayOf(ctx.startYmd);
  const longs = [];
  days.forEach((w, i) => {
    if (w.sessionType === "long") longs.push({ i, ymd: dayOf(w), wn: weekIndexOf(dayOf(w), startMonday) });
  });
  if (longs.length === 0) return result;

  const minDays = longRunMinDaysBeforeRace(ctx.distKey);
  let peak = 0;
  longs.forEach((l, k) => {
    if (diffDays(ctx.raceYmd, l.ymd) >= minDays) peak = k;
  });

  const peakTarget = ctx.weeklyKmTargets?.[longs[peak].wn - 1] ?? 0;
  const share = longRunShare(ctx, longs[peak].wn, peakTarget);
  const lpk = ultra
    ? ctx.peakLongRunKm
    : Math.min(share * peakTarget, Math.max(ctx.peakLongRunKm, 0.22 * peakTarget));
  const lstart = LONG_RUN_START_FRACTION * lpk;

  longs.forEach((l, k) => {
    let v;
    if (k <= peak) {
      const t = peak === 0 ? 1 : k / peak;
      v = lstart + (lpk - lstart) * t;
      if (ctx.isDeload?.[l.wn - 1]) v *= LONG_RUN_DELOAD_FACTOR;
    } else {
      v = lpk * (LONG_RUN_AFTER_PEAK_FRACTIONS[Math.min(k - peak, LONG_RUN_AFTER_PEAK_FRACTIONS.length) - 1]);
    }
    if (!ultra) {
      const weekTarget = ctx.weeklyKmTargets?.[l.wn - 1] ?? 0;
      if (weekTarget > 0) v = Math.min(v, longRunShare(ctx, l.wn, weekTarget) * weekTarget);
    }
    result.set(l.i, round1(v));
  });
  return result;
}

// ── Prüfung ─────────────────────────────────────────────────────────────────────────────────
/**
 * Prüft die Invarianten I1–I4 an einer fertigen Workout-Liste.
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
  const weekRunCount = [];
  days.forEach((w) => {
    const wn = weekIndexOf(dayOf(w), startMonday);
    weekKm[wn - 1] = (weekKm[wn - 1] ?? 0) + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0);
    weekRunCount[wn - 1] = (weekRunCount[wn - 1] ?? 0) + (isRunSession(w) ? 1 : 0);
    if (w.sessionType === "long") (weekLongs[wn - 1] ??= []).push(w);
  });
  const totalWeeks = ctx.totalWeeks ?? weekKm.length;
  const peakWeek = totalWeeks - (ctx.taperWeeks ?? 1);

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
    if (!ultra) {
      longs.forEach((w) => {
        const wn = weekIndexOf(dayOf(w), startMonday);
        const total = (weekKm[wn - 1] ?? 0) + (wn === totalWeeks ? ctx.raceKm : 0);
        if ((weekRunCount[wn - 1] ?? 0) < 2 || total <= 0) return;
        const share = longRunShare(ctx, wn, total);
        if (w.km / total > share + 0.005) problems.push(`I2: Long Run ${w.km} km = ${Math.round((w.km / total) * 100)} % der Woche ${wn}`);
      });
    }
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
  dayOf,
  addDays,
  diffDays,
  mondayOf,
  dowOf,
  weekIndexOf,
  HARD_TYPES,
};
