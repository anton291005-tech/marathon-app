/**
 * Marathon-Zeitprognose aus den letzten ~42 Tagen Trainingslogs.
 * Heuristisch stabil — keine VDOT-/Wissenschafts-Präzision.
 */

import { isSessionLogDone, parseSessionDateLabel } from "./appSmartFeatures";

// --- Typen (an Session-Shape aus App.tsx angelehnt) ---

export type PlanSession = {
  id: string;
  day: string;
  date: string;
  type: string;
  title: string;
  km: number;
  desc?: string | null;
  pace?: string | null;
};

export type PlanWeek = {
  wn: number;
  phase: string;
  label?: string;
  dates?: string;
  km: number;
  focus?: string;
  s: PlanSession[];
};

export type SessionLog = {
  feeling?: number;
  actualKm?: string;
  notes?: string;
  done?: boolean;
  skipped?: boolean;
  at?: string;
  /** Zugeordneter Apple-Health-/Workout-Lauf (runId stabil über healthRuns) */
  assignedRun?: {
    runId: string;
    startDate: string;
    duration: number;
    distanceKm: number;
  };
};

export type TrainingWindowEntry = {
  session: PlanSession;
  weekNumber: number;
  phase: string;
  date: Date;
  /** Geplantes Lauf-/Volumen-Äquivalent in km (Rad/Kraft geschätzt). */
  plannedKmEquiv: number;
  log: SessionLog | undefined;
};

const WINDOW_DAYS = 42;
/** Mindest-Kriterien für eine belastbare Prognose */
const MIN_DONE_SESSIONS = 8;
const MIN_DONE_KM = 28;
const MIN_LONG_RUNS_IN_WINDOW = 1;

/**
 * Long Runs bleiben der Haupttreiber, aber moderater Boost — sonst überstimmen sie
 * den Rest zu stark, wenn die Kurz-Einheiten bereits gedämpft sind.
 */
const LONG_RUN_SIGNAL_BOOST = 1.12;

/** Marathon-spezifische Länge: ohne mindestens zwei solche Läufe bleibt die Prognose konservativer. */
const LONG_DEEP_KM = 26;
const MIN_LONG_DEEP_COUNT = 2;

/**
 * Zusätzliche Dämpfung für kurze/intensive Einheiten relativ zu Long Runs.
 * (Die Basis-Gewichte w bleiben; hier kommt ein zweiter Hebel nur für die Last-Summe.)
 */
function getShortIntensityDamping(session: PlanSession): number {
  if (session.type === "long" || session.type === "rest") return 1;
  if (session.type === "interval") return 0.42;
  if (session.type === "tempo") return 0.48;
  if (session.type === "race") return 0.55;
  if (session.type === "easy") return 0.88;
  if (session.type === "strength" || session.type === "bike") return 0.75;
  return 0.85;
}

/**
 * Hero-Einheiten (stark über Plan) sollen die Gesamtlast nicht explodieren lassen:
 * Bonus-Anteil von kmPlanFactor wird abgeschwächt.
 */
function dampenKmPlanFactor(factor: number): number {
  if (factor <= 1) return factor;
  return 1 + (factor - 1) * 0.45;
}

/**
 * Obergrenze: selbst bei perfektem 42-Tage-Fenster nicht mehr als ~2,5 % schneller als die Zielzeit
 * annehmen (sonst wirkt die Prognose wie ein Garantie-Sub).
 */
const BEST_CASE_TIME_MULTIPLIER_FLOOR = 0.975;

/**
 * Regression zum Mittel: reduziert Tag-zu-Tag-Sprünge, ohne localStorage.
 * Nur nachhaltige Trends verschieben die Prognose spürbar.
 */
const LOAD_RATIO_REGRESSION_TO_MEAN = 0.38;

// --- Hilfsfunktionen ---

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDurationMinutes(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Erkennt wettkampfspezifische / MP-lastige Einheiten (Text + Phase). */
function isMarathonSpecificSession(session: PlanSession, phase: string): boolean {
  if (session.type === "race") return true;
  const blob = `${session.title} ${session.desc || ""}`;
  if (/MP|mit\s*MP|Marathon-?Pace|@?\s*4:0[0-5]/i.test(blob)) return true;
  if (phase === "SPEC" && (session.type === "tempo" || session.type === "long")) return true;
  return false;
}

/**
 * Gewichtung nach Einheitstyp (Spezifikation).
 * Long mit MP-Bezug zählt als wettkampfspezifisch (1.6), reine Long Runs als 1.8.
 */
export function getSessionWeight(session: PlanSession, phase: string): number {
  if (session.type === "rest") return 0;
  if (session.type === "long") {
    return isMarathonSpecificSession(session, phase) ? 1.6 : 1.8;
  }
  if (session.type === "tempo") return 1.5;
  if (session.type === "interval") return 1.4;
  if (session.type === "easy") return 1.0;
  if (session.type === "strength") return 0.6;
  if (session.type === "bike") return 0.5;
  if (session.type === "race") return 1.6;
  return 1.0;
}

export function getPlannedKmEquiv(session: PlanSession): number {
  if (session.km > 0) return session.km;
  if (session.type === "bike") return 12;
  if (session.type === "strength") return 8;
  return 0;
}

export function getEffectiveKm(session: PlanSession, log: SessionLog | undefined): number {
  if (!isSessionLogDone(log)) return 0;
  const ar = log?.assignedRun;
  if (ar && typeof ar.distanceKm === "number" && Number.isFinite(ar.distanceKm) && ar.distanceKm > 0) {
    return ar.distanceKm;
  }
  const parsed = parseFloat(String(log?.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return session.km > 0 ? session.km : getPlannedKmEquiv(session);
}

/**
 * Faktor aus Vergleich Ist-km zu geplant: neutral bei ~Plan,
 * Strafe bei deutlich weniger, kleiner Bonus bei etwas mehr (gedeckelt).
 */
export function getKmPlanFactor(actualKm: number, plannedKm: number): number {
  if (plannedKm <= 0) return 1;
  const ratio = actualKm / plannedKm;
  if (ratio >= 0.88 && ratio <= 1.12) return 1;
  if (ratio < 0.88) {
    // stärker strafen je weiter unter ~88 %
    return Math.max(0.35, 0.55 + 0.45 * (ratio / 0.88));
  }
  // etwas mehr: kleiner Bonus, max ~1.06
  const over = ratio - 1.12;
  return Math.min(1.06, 1 + Math.min(over / 0.35, 1) * 0.06);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Kalendertag der Session ≤ heute (Sessions am heutigen Tag gelten als fällig/vergangen für die Auswertung). */
export function isScheduledOnOrBeforeToday(sessionDate: Date, now: Date): boolean {
  const sd = new Date(sessionDate);
  sd.setHours(0, 0, 0, 0);
  const nd = new Date(now);
  nd.setHours(0, 0, 0, 0);
  return sd.getTime() <= nd.getTime();
}

/** Sammelt alle Sessions im Fenster [now - WINDOW_DAYS, now]. */
export function getTrainingWindowData(
  plan: PlanWeek[],
  logs: Record<string, SessionLog>,
  now: Date = new Date()
): TrainingWindowEntry[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - WINDOW_DAYS);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const out: TrainingWindowEntry[] = [];

  for (const week of plan) {
    for (const session of week.s) {
      const d = parseSessionDateLabel(session.date);
      if (!d || d < start || d > end) continue;
      out.push({
        session,
        weekNumber: week.wn,
        phase: week.phase,
        date: d,
        plannedKmEquiv: getPlannedKmEquiv(session),
        log: logs[session.id],
      });
    }
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

type StreakWindowResult = {
  /** Anteil erledigter past-Trainings-Sessions im Fenster [0–1]. */
  completionRate: number;
  /** Verhältnis Σ Ist-km zu Σ Plan-km (nur erledigte Einheiten). */
  kmAdherence: number;
  /** 0–1 aus aufeinanderfolgenden „guten“ Kalenderwochen im Fenster. */
  weekStreakFactor: number;
};

function computeStreakComponents(entries: TrainingWindowEntry[], now: Date): StreakWindowResult {
  const pastTrainable = entries.filter(
    (e) => e.session.type !== "rest" && isScheduledOnOrBeforeToday(e.date, now)
  );

  if (pastTrainable.length === 0) {
    return { completionRate: 0, kmAdherence: 0, weekStreakFactor: 0 };
  }

  const doneCount = pastTrainable.filter((e) => isSessionLogDone(e.log)).length;
  const completionRate = pastTrainable.length > 0 ? doneCount / pastTrainable.length : 0;

  let sumPlannedDone = 0;
  let sumActualDone = 0;
  for (const e of pastTrainable) {
    if (!isSessionLogDone(e.log)) continue;
    const planned = e.plannedKmEquiv > 0 ? e.plannedKmEquiv : getPlannedKmEquiv(e.session);
    sumPlannedDone += planned;
    sumActualDone += getEffectiveKm(e.session, e.log);
  }
  const kmAdherence =
    sumPlannedDone > 0 ? Math.min(1.2, sumActualDone / sumPlannedDone) : completionRate;

  // Kalenderwochen (Mo–So) im Fenster: wie viele Wochen nacheinander ≥70 % erledigt?
  const byWeek = new Map<string, { total: number; done: number }>();
  for (const e of pastTrainable) {
    const wd = new Date(e.date);
    const mondayOffset = (wd.getDay() + 6) % 7;
    const monday = new Date(wd);
    monday.setDate(wd.getDate() - mondayOffset);
    const key = monday.toISOString().slice(0, 10);
    const cur = byWeek.get(key) || { total: 0, done: 0 };
    cur.total += 1;
    if (isSessionLogDone(e.log)) cur.done += 1;
    byWeek.set(key, cur);
  }
  const weekKeys = Array.from(byWeek.keys()).sort();
  let streak = 0;
  for (let i = weekKeys.length - 1; i >= 0; i--) {
    const { total, done } = byWeek.get(weekKeys[i])!;
    if (total > 0 && done / total >= 0.7) streak += 1;
    else break;
  }
  const weekStreakFactor = Math.min(1, streak / 4);

  return { completionRate, kmAdherence, weekStreakFactor };
}

/**
 * Consistency Score 0–100: Anteil erledigt, km-Verhältnis, kurzer Wochen-Streak-Bonus.
 */
export function getConsistencyScore(
  entries: TrainingWindowEntry[],
  now: Date = new Date()
): number {
  const { completionRate, kmAdherence, weekStreakFactor } = computeStreakComponents(entries, now);
  const raw =
    100 *
    (0.42 * Math.min(1, completionRate) +
      0.38 * Math.min(1, kmAdherence) +
      0.2 * weekStreakFactor);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export type MarathonPredictionResult = {
  ready: boolean;
  /** Wenn ready false: kurzer Hinweis fürs UI */
  message: string;
  predictedSeconds: number | null;
  predictedTime: string | null;
  rangeLabel: string | null;
  rangeLowSeconds: number | null;
  rangeHighSeconds: number | null;
  consistencyScore: number | null;
  sub3ProbabilityPercent: number | null;
  sub250ProbabilityPercent: number | null;
};

const DEFAULT_TARGET_SECONDS = 2 * 3600 + 49 * 60 + 50;

export function getMarathonPrediction(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  targetSeconds?: number | null;
  now?: Date;
}): MarathonPredictionResult {
  const now = args.now ?? new Date();
  const baseline = args.targetSeconds && args.targetSeconds > 0 ? args.targetSeconds : DEFAULT_TARGET_SECONDS;

  const entries = getTrainingWindowData(args.plan, args.logs, now);

  const pastTrainable = entries.filter(
    (e) => e.session.type !== "rest" && isScheduledOnOrBeforeToday(e.date, now)
  );

  let doneSessions = 0;
  let doneKm = 0;
  let longRunsDone = 0;
  /** Erledigte Long Runs mit geplanten km > 26 (Marathon-spezifisches Volumen). */
  let longRunsDeepDone = 0;
  let missedTrainable = 0;
  let skippedTrainable = 0;

  let actualWeighted = 0;
  let plannedWeighted = 0;
  let longPlanned = 0;
  let longActual = 0;

  for (const e of pastTrainable) {
    const w = getSessionWeight(e.session, e.phase);
    const planned = e.plannedKmEquiv;
    const log = e.log;

    if (log?.skipped) skippedTrainable += 1;
    if (!isSessionLogDone(log) && !log?.skipped) missedTrainable += 1;

    if (isSessionLogDone(log)) {
      doneSessions += 1;
      const km = getEffectiveKm(e.session, log);
      doneKm += km;
      if (e.session.type === "long") {
        longRunsDone += 1;
        const plannedLong = planned > 0 ? planned : e.session.km;
        longPlanned += plannedLong;
        longActual += km;
        if (plannedLong > LONG_DEEP_KM) {
          longRunsDeepDone += 1;
        }
      }

      const boost = e.session.type === "long" ? LONG_RUN_SIGNAL_BOOST : 1;
      const intensityDamp = getShortIntensityDamping(e.session);
      const kmFactorRaw = getKmPlanFactor(km, planned > 0 ? planned : Math.max(km, 1));
      const kmFactor = dampenKmPlanFactor(kmFactorRaw);

      let volumeTerm = w * boost * intensityDamp * km * kmFactor;

      /**
       * Einzel-Deckel: verhindert, dass eine „Hero-Session“ die Gesamtlast übermäßig nach oben zieht
       * (intervall/tempo würden sonst trotz Dämpfung noch spiken).
       */
      const expectedSessionLoad = w * boost * intensityDamp * Math.max(planned, 1);
      const sessionCap = expectedSessionLoad * 1.18;
      if (volumeTerm > sessionCap) {
        volumeTerm = sessionCap;
      }

      actualWeighted += volumeTerm;
    }

    // Soll-Last: gleiche Dämpfung wie bei Ist, damit loadRatio vergleichbar bleibt
    if (w > 0 && planned > 0) {
      const boost = e.session.type === "long" ? LONG_RUN_SIGNAL_BOOST : 1;
      const intensityDamp = getShortIntensityDamping(e.session);
      plannedWeighted += w * boost * intensityDamp * planned;
    }
  }

  const missRatio =
    pastTrainable.length > 0 ? missedTrainable / pastTrainable.length : 0;
  const skipRatio =
    pastTrainable.length > 0 ? skippedTrainable / pastTrainable.length : 0;

  let loadRatio = plannedWeighted > 0 ? actualWeighted / plannedWeighted : 0;
  /**
   * Regression zum Mittel (1.0): kurzfristige Ausreißer im Lastverhältnis bewegen die Prognose weniger —
   * nur anhaltende Über-/Unterlast erzeugt größere Zeitschritte (ohne gespeicherten Vorher-Wert).
   */
  loadRatio = (1 - LOAD_RATIO_REGRESSION_TO_MEAN) * loadRatio + LOAD_RATIO_REGRESSION_TO_MEAN * 1;
  const longRatio =
    longPlanned > 0 ? longActual / longPlanned : longRunsDone > 0 ? 1 : 0;

  // Fehlende Einheiten + zu wenig Daten
  const consistencyScore = getConsistencyScore(entries, now);

  const ready =
    doneSessions >= MIN_DONE_SESSIONS &&
    doneKm >= MIN_DONE_KM &&
    longRunsDone >= MIN_LONG_RUNS_IN_WINDOW;

  if (!ready) {
    return {
      ready: false,
      message: "Noch nicht genug Daten für eine belastbare Prognose",
      predictedSeconds: null,
      predictedTime: null,
      rangeLabel: null,
      rangeLowSeconds: null,
      rangeHighSeconds: null,
      consistencyScore: doneSessions >= 3 ? consistencyScore : null,
      sub3ProbabilityPercent: null,
      sub250ProbabilityPercent: null,
    };
  }

  // Prognose: Baseline wird durch Trainingsquote und Ausfälle verschoben
  // Engere Klammer: extreme Last-Ratios dürfen die Zeit nicht unrealistisch nach unten ziehen
  const clampedLoad = Math.min(1.1, Math.max(0.38, loadRatio));

  const longVolumeBoost =
    longRunsDone > 0 && longRatio >= 0.85 ? 0.985 : longRunsDone > 0 && longRatio < 0.65 ? 1.045 : 1;

  /**
   * Zu wenige lange Long Runs (>26 km im Plan): Marathon-Volumen unsicher → konservativer (langsamer).
   */
  const longDepthShortfall = Math.max(0, MIN_LONG_DEEP_COUNT - longRunsDeepDone);
  const longDepthPenalty = 1 + 0.022 * longDepthShortfall;

  /**
   * Viele fehlende Einheiten: nichtlinear bestrafen — bei hohem Miss-Anteil spürbar langsamer.
   */
  const missPenaltyLinear = 0.09 * missRatio;
  const missPenaltyCurve = 0.14 * missRatio * missRatio;

  let timeMultiplier =
    1 +
    0.09 * (1 - clampedLoad) +
    missPenaltyLinear +
    missPenaltyCurve +
    0.02 * skipRatio +
    (longVolumeBoost - 1);

  timeMultiplier *= longDepthPenalty;

  // Consistency: schlechte Konstanz weitet die erwartete Zeit nach oben
  timeMultiplier += ((100 - consistencyScore) / 100) * 0.048;

  let predictedSeconds = baseline * timeMultiplier;

  // Harte Untergrenze: nicht „garantiert“ schneller als plausibel zur eingestellten Zielzeit
  predictedSeconds = Math.max(predictedSeconds, baseline * BEST_CASE_TIME_MULTIPLIER_FLOOR);

  predictedSeconds = Math.max(2 * 3600 + 20 * 60, Math.min(4 * 3600 + 30 * 60, predictedSeconds));

  // Unsicherheitsband (von Consistency abhängig)
  const bandBase = 150 + (100 - consistencyScore) * 2.8;
  const rangeLow = predictedSeconds - bandBase;
  const rangeHigh = predictedSeconds + bandBase;

  const rangeLabel = `${formatDurationMinutes(rangeLow)}–${formatDurationMinutes(rangeHigh)}`;

  // Wahrscheinlichkeiten (logistisch, weiche Skala)
  const scale = 200 + (100 - consistencyScore) * 1.2;
  const sub3ProbabilityPercent = Math.round(100 * sigmoid((10800 - predictedSeconds) / scale));
  const sub250ProbabilityPercent = Math.round(100 * sigmoid((10200 - predictedSeconds) / scale));

  return {
    ready: true,
    message: "",
    predictedSeconds: Math.round(predictedSeconds),
    predictedTime: formatDuration(predictedSeconds),
    rangeLabel,
    rangeLowSeconds: Math.round(rangeLow),
    rangeHighSeconds: Math.round(rangeHigh),
    consistencyScore,
    sub3ProbabilityPercent,
    sub250ProbabilityPercent,
  };
}
