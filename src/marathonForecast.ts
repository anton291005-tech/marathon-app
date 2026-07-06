/**
 * Single Source of Truth für Marathon-Zeitprognose (Home + Leistung).
 * Basis: echte Lauf-Paces (Health-Duration/Distanz) + Plan-Umsetzung + Recovery.
 */

import {
  berlinWallClockYmd,
  calendarDaysBetweenYmd,
  isSessionLogDone,
  parseSessionDateLabel,
} from "./appSmartFeatures";
import { getAppNow } from "./core/time/timeSystem";
import type { StoredHealthRun } from "./healthRuns";
import {
  getStoredHealthRunCanonicalType,
  storedHealthRunDistanceKmNumeric,
} from "./healthRuns";
import {
  formatDuration,
  getConsistencyScore,
  getEffectiveKm,
  getPlannedKmEquiv,
  getTrainingWindowData,
  type MarathonPredictionResult,
  type PlanSession,
  type PlanWeek,
  type SessionLog,
} from "./marathonPrediction";
import { getSessionPlannedDistanceKm } from "./sessionDistance";

const MARATHON_KM = 42.195;
const RIEGEL_EXPONENT = 1.06;
const MIN_RUN_KM = 8;
const PACE_LOOKBACK_DAYS = 56;
const FORECAST_MIN_SECONDS = 2 * 3600 + 20 * 60; // 2:20
const FORECAST_MAX_SECONDS = 5 * 3600; // 5:00
const FAST_PR_CLAMP_THRESHOLD_SECONDS = 3 * 3600 + 30 * 60; // 3:30
const FAST_PR_MIN_SECONDS = 2 * 3600 + 15 * 60; // 2:15
const MIN_PACE_SAMPLES = 2;
const WETTKAMPF_SESSION_TYPES = new Set(["tempo", "interval", "race"]);
const AUSDAUER_SESSION_TYPES = new Set(["long", "easy"]);
const WETTKAMPF_PACE_FACTOR = 1.04;
const EASY_PACE_TO_RACE_FACTOR = 0.88;
const PR_BLEND_TRAINING_WEIGHT = 0.65;
const PR_BLEND_ANCHOR_WEIGHT = 0.35;
const PR_ANCHOR_FACTOR = 1.08;
const PR_MAX_SLOWDOWN_FACTOR = 1.15;

export type ForecastInput = {
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  healthRuns: StoredHealthRun[];
  now?: Date;
  /** Recovery 0–100: niedrig → leicht konservativere Prognose. */
  homeRecoveryScore0_100?: number | null;
  /** Nur für Sub-3-Wahrscheinlichkeit — nicht als Zeit-Baseline. */
  targetSeconds?: number | null;
  /** Historischer Marathon-PR in Sekunden (optional). */
  personalBestSeconds?: number | null;
};

export type MarathonForecast = {
  ready: boolean;
  message: string;
  predictedSeconds: number | null;
  predictedTime: string | null;
  rangeLabel: string | null;
  rangeLowSeconds: number | null;
  rangeHighSeconds: number | null;
  consistencyScore: number | null;
  sub3ProbabilityPercent: number | null;
  sub250ProbabilityPercent: number | null;
  /** Diagnostik (nicht UI-pflichtig) */
  paceSampleCount: number;
  maxLongRunKm: number | null;
  weeklyVolumeAdherence: number | null;
};

type PaceRunSample = {
  ymd: string;
  sessionType: string;
  distanceKm: number;
  durationSec: number;
  paceSecPerKm: number;
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function formatDurationMinutes(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function riegelMarathonSeconds(runSeconds: number, distanceKm: number): number {
  if (!(distanceKm > 0) || !(runSeconds > 0)) return NaN;
  return runSeconds * Math.pow(MARATHON_KM / distanceKm, RIEGEL_EXPONENT);
}

function healthRunById(healthRuns: StoredHealthRun[]): Map<string, StoredHealthRun> {
  const m = new Map<string, StoredHealthRun>();
  for (const r of healthRuns) {
    if (r?.runId) m.set(r.runId, r);
  }
  return m;
}

function extractDurationSec(log: SessionLog | undefined, byId: Map<string, StoredHealthRun>): number | null {
  const ar = log?.assignedRun;
  if (ar?.runId) {
    const h = byId.get(ar.runId);
    const d = typeof ar.duration === "number" && ar.duration > 0 ? ar.duration : h?.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  }
  return null;
}

function extractDistanceKm(
  session: PlanSession,
  log: SessionLog | undefined,
  byId: Map<string, StoredHealthRun>,
): number | null {
  if (!isSessionLogDone(log)) return null;
  const kmEff = getEffectiveKm(session, log);
  const ar = log?.assignedRun;
  if (ar?.runId) {
    const h = byId.get(ar.runId);
    if (!h || getStoredHealthRunCanonicalType(h) !== "run") {
      return kmEff > 0 ? kmEff : null;
    }
    const dist =
      typeof ar.distanceKm === "number" && ar.distanceKm > 0
        ? ar.distanceKm
        : storedHealthRunDistanceKmNumeric(h) ?? kmEff;
    return dist > 0 ? dist : null;
  }
  return kmEff > 0 ? kmEff : null;
}

function isRunningSession(session: PlanSession): boolean {
  return session.type !== "rest" && session.type !== "strength" && session.type !== "bike";
}

function collectPaceRunSamples(
  plan: PlanWeek[],
  logs: Record<string, SessionLog>,
  healthRuns: StoredHealthRun[],
  now: Date,
): PaceRunSample[] {
  const byId = healthRunById(healthRuns);
  const todayYmd = berlinWallClockYmd(now);
  const year = now.getFullYear();
  const out: PaceRunSample[] = [];

  for (const week of plan) {
    for (const session of week.s ?? []) {
      if (!isRunningSession(session)) continue;
      const dt = parseSessionDateLabel(session.date, year);
      if (!dt) continue;
      const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (ymd > todayYmd) continue;
      const daysBack = calendarDaysBetweenYmd(ymd, todayYmd);
      if (!Number.isFinite(daysBack) || daysBack < 0 || daysBack > PACE_LOOKBACK_DAYS) continue;

      const log = logs[session.id];
      if (!isSessionLogDone(log)) continue;

      const dist = extractDistanceKm(session, log, byId);
      if (!(dist && dist >= MIN_RUN_KM)) continue;

      const dur = extractDurationSec(log, byId);
      if (!(dur && dur > 0)) continue;

      const pace = dur / dist;
      if (!Number.isFinite(pace) || pace <= 0) continue;

      out.push({
        ymd,
        sessionType: session.type,
        distanceKm: dist,
        durationSec: dur,
        paceSecPerKm: pace,
      });
    }
  }

  out.sort((a, b) => (a.ymd === b.ymd ? 0 : a.ymd < b.ymd ? -1 : 1));
  return out;
}

function computeMaxLongRunKm(
  plan: PlanWeek[],
  logs: Record<string, SessionLog>,
  healthRuns: StoredHealthRun[],
  now: Date,
): number | null {
  const byId = healthRunById(healthRuns);
  const todayYmd = berlinWallClockYmd(now);
  const year = now.getFullYear();
  let maxKm: number | null = null;

  for (const week of plan) {
    for (const session of week.s ?? []) {
      if (session.type !== "long") continue;
      const dt = parseSessionDateLabel(session.date, year);
      if (!dt) continue;
      const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (ymd > todayYmd) continue;
      const log = logs[session.id];
      if (!isSessionLogDone(log)) continue;
      const km = extractDistanceKm(session, log, byId);
      if (km != null && km > 0) {
        maxKm = maxKm == null ? km : Math.max(maxKm, km);
      }
    }
  }
  return maxKm;
}

/** Aktuelle Kalenderwoche (Mo–So): Ist-km / Plan-km für Lauf-Sessions. */
function computeWeeklyVolumeAdherence(
  plan: PlanWeek[],
  logs: Record<string, SessionLog>,
  healthRuns: StoredHealthRun[],
  now: Date,
): number | null {
  const byId = healthRunById(healthRuns);
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayBack = (sod.getDay() + 6) % 7;
  const weekStart = new Date(sod);
  weekStart.setDate(sod.getDate() - mondayBack);
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setDate(weekStart.getDate() + 7);
  const startMs = weekStart.getTime();
  const endMs = weekEndExclusive.getTime();
  const year = now.getFullYear();

  let planned = 0;
  let actual = 0;

  for (const week of plan) {
    for (const session of week.s ?? []) {
      if (!isRunningSession(session)) continue;
      const dt = parseSessionDateLabel(session.date, year);
      if (!dt) continue;
      const dayMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      if (dayMs < startMs || dayMs >= endMs) continue;
      const plannedKm = getSessionPlannedDistanceKm(session) || getPlannedKmEquiv(session);
      if (plannedKm > 0) planned += plannedKm;
      if (isSessionLogDone(logs[session.id])) {
        actual += extractDistanceKm(session, logs[session.id], byId) ?? getEffectiveKm(session, logs[session.id]);
      }
    }
  }

  if (planned <= 0) return null;
  return Math.min(1.25, actual / planned);
}

function compute42DayVolumeAdherence(
  plan: PlanWeek[],
  logs: Record<string, SessionLog>,
  healthRuns: StoredHealthRun[],
  now: Date,
): number | null {
  const byId = healthRunById(healthRuns);
  const entries = getTrainingWindowData(plan, logs, now);
  let planned = 0;
  let actual = 0;

  for (const e of entries) {
    if (!isRunningSession(e.session)) continue;
    const plannedKm = e.plannedKmEquiv > 0 ? e.plannedKmEquiv : getPlannedKmEquiv(e.session);
    if (plannedKm <= 0) continue;
    planned += plannedKm;
    if (isSessionLogDone(e.log)) {
      actual += extractDistanceKm(e.session, e.log, byId) ?? getEffectiveKm(e.session, e.log);
    }
  }

  if (planned <= 0) return null;
  return Math.min(1.2, actual / planned);
}

function averagePaceSecPerKm(samples: PaceRunSample[]): number | null {
  if (samples.length === 0) return null;
  const total = samples.reduce((sum, sample) => sum + sample.paceSecPerKm, 0);
  const avg = total / samples.length;
  return Number.isFinite(avg) && avg > 0 ? avg : null;
}

function baseSecondsFromSegmentedPaceSamples(samples: PaceRunSample[]): {
  baseSeconds: number | null;
  wettkampfSessionCount: number;
} {
  if (samples.length === 0) return { baseSeconds: null, wettkampfSessionCount: 0 };

  const wettkampfSamples = samples.filter((sample) => WETTKAMPF_SESSION_TYPES.has(sample.sessionType));
  const ausdauerSamples = samples.filter((sample) => AUSDAUER_SESSION_TYPES.has(sample.sessionType));
  const wettkampfPace = averagePaceSecPerKm(wettkampfSamples);
  const easyPace =
    averagePaceSecPerKm(ausdauerSamples) ??
    averagePaceSecPerKm(samples.filter((sample) => !WETTKAMPF_SESSION_TYPES.has(sample.sessionType)));

  let basisPaceSecPerKm: number | null = null;
  if (wettkampfSamples.length >= 1 && wettkampfPace != null) {
    basisPaceSecPerKm = wettkampfPace * WETTKAMPF_PACE_FACTOR;
  } else if (easyPace != null) {
    basisPaceSecPerKm = easyPace * EASY_PACE_TO_RACE_FACTOR;
  }

  if (basisPaceSecPerKm == null) {
    return { baseSeconds: null, wettkampfSessionCount: wettkampfSamples.length };
  }

  const marathonSeconds = basisPaceSecPerKm * MARATHON_KM;
  return {
    baseSeconds: Number.isFinite(marathonSeconds) && marathonSeconds > 0 ? marathonSeconds : null,
    wettkampfSessionCount: wettkampfSamples.length,
  };
}

function applyPersonalBestAnchor(
  trainingBasedSeconds: number,
  personalBestSeconds: number | null | undefined,
): number {
  if (
    personalBestSeconds == null ||
    !Number.isFinite(personalBestSeconds) ||
    personalBestSeconds <= 0
  ) {
    return trainingBasedSeconds;
  }

  const prAnchorSeconds = personalBestSeconds * PR_ANCHOR_FACTOR;
  const blended =
    PR_BLEND_TRAINING_WEIGHT * trainingBasedSeconds + PR_BLEND_ANCHOR_WEIGHT * prAnchorSeconds;
  return Math.min(blended, personalBestSeconds * PR_MAX_SLOWDOWN_FACTOR);
}

function forecastMinSeconds(personalBestSeconds: number | null | undefined): number {
  if (
    personalBestSeconds != null &&
    Number.isFinite(personalBestSeconds) &&
    personalBestSeconds > 0 &&
    personalBestSeconds < FAST_PR_CLAMP_THRESHOLD_SECONDS
  ) {
    return FAST_PR_MIN_SECONDS;
  }
  return FORECAST_MIN_SECONDS;
}

function volumeAdherenceTimeFactor(weekly: number | null, window42: number | null): number {
  const adherence = weekly ?? window42;
  if (adherence == null) return 1;
  if (adherence >= 0.88 && adherence <= 1.08) return 1;
  if (adherence < 0.88) {
    return 1 + 0.1 * (1 - Math.max(0.5, adherence));
  }
  return Math.max(0.985, 1 - 0.015 * Math.min(adherence - 1.08, 0.17));
}

function longRunDepthFactor(maxLongKm: number | null): number {
  if (maxLongKm == null) return 1.06;
  if (maxLongKm >= 26) return 1;
  if (maxLongKm >= 21) return 1.015;
  if (maxLongKm >= 18) return 1.03;
  return 1.055;
}

function recoveryTimeFactor(homeRecoveryScore0_100: number | null | undefined): number {
  if (homeRecoveryScore0_100 == null || !Number.isFinite(homeRecoveryScore0_100)) return 1;
  const r = Math.max(0, Math.min(100, homeRecoveryScore0_100));
  const raw = 1 + ((50 - r) / 50) * 0.038;
  return Math.max(0.98, Math.min(1.05, raw));
}

export function computeMarathonForecast(input: ForecastInput): MarathonForecast {
  const now = input.now ?? getAppNow();
  const paceSamples = collectPaceRunSamples(input.plan, input.logs, input.healthRuns, now);
  const entries = getTrainingWindowData(input.plan, input.logs, now);
  const consistencyScore = getConsistencyScore(entries, now);
  const maxLongRunKm = computeMaxLongRunKm(input.plan, input.logs, input.healthRuns, now);
  const weeklyVolumeAdherence = computeWeeklyVolumeAdherence(
    input.plan,
    input.logs,
    input.healthRuns,
    now,
  );
  const window42Adherence = compute42DayVolumeAdherence(input.plan, input.logs, input.healthRuns, now);

  if (paceSamples.length < MIN_PACE_SAMPLES) {
    return {
      ready: false,
      message:
        "Zu früh im Trainingsblock – Prognose wird geladen, sobald ausreichend Läufe mit Pace-Daten vorliegen.",
      predictedSeconds: null,
      predictedTime: null,
      rangeLabel: null,
      rangeLowSeconds: null,
      rangeHighSeconds: null,
      consistencyScore: paceSamples.length >= 1 ? consistencyScore : null,
      sub3ProbabilityPercent: null,
      sub250ProbabilityPercent: null,
      paceSampleCount: paceSamples.length,
      maxLongRunKm,
      weeklyVolumeAdherence,
    };
  }

  const { baseSeconds: trainingBaseSeconds, wettkampfSessionCount } =
    baseSecondsFromSegmentedPaceSamples(paceSamples);
  if (trainingBaseSeconds == null || !Number.isFinite(trainingBaseSeconds)) {
    return {
      ready: false,
      message: "Pace-Daten unvollständig – bitte Health-Läufe zuordnen.",
      predictedSeconds: null,
      predictedTime: null,
      rangeLabel: null,
      rangeLowSeconds: null,
      rangeHighSeconds: null,
      consistencyScore,
      sub3ProbabilityPercent: null,
      sub250ProbabilityPercent: null,
      paceSampleCount: paceSamples.length,
      maxLongRunKm,
      weeklyVolumeAdherence,
    };
  }

  let predictedSeconds = applyPersonalBestAnchor(trainingBaseSeconds, input.personalBestSeconds);
  predictedSeconds *= volumeAdherenceTimeFactor(weeklyVolumeAdherence, window42Adherence);
  predictedSeconds *= longRunDepthFactor(maxLongRunKm);
  predictedSeconds *= recoveryTimeFactor(input.homeRecoveryScore0_100);
  predictedSeconds += ((100 - consistencyScore) / 100) * 120;

  if (
    input.personalBestSeconds != null &&
    Number.isFinite(input.personalBestSeconds) &&
    input.personalBestSeconds > 0
  ) {
    predictedSeconds = Math.min(
      predictedSeconds,
      input.personalBestSeconds * PR_MAX_SLOWDOWN_FACTOR,
    );
  }

  const minSeconds = forecastMinSeconds(input.personalBestSeconds);
  predictedSeconds = Math.max(minSeconds, Math.min(FORECAST_MAX_SECONDS, predictedSeconds));
  predictedSeconds = Math.round(predictedSeconds);

  const bandBase = 150 + (100 - consistencyScore) * 2.8;
  const rangeLow = Math.max(minSeconds, predictedSeconds - bandBase);
  const rangeHigh = Math.min(FORECAST_MAX_SECONDS, predictedSeconds + bandBase);
  const rangeLabel = `${formatDurationMinutes(rangeLow)}–${formatDurationMinutes(rangeHigh)}`;

  const scale = 200 + (100 - consistencyScore) * 1.2;
  const sub3ProbabilityPercent = Math.round(100 * sigmoid((10800 - predictedSeconds) / scale));
  const sub250Scale = wettkampfSessionCount >= 1 ? scale : scale * 2.5;
  const sub250ProbabilityPercent = Math.round(
    100 * sigmoid((10200 - predictedSeconds) / sub250Scale),
  );

  return {
    ready: true,
    message: "",
    predictedSeconds,
    predictedTime: formatDuration(predictedSeconds),
    rangeLabel,
    rangeLowSeconds: Math.round(rangeLow),
    rangeHighSeconds: Math.round(rangeHigh),
    consistencyScore,
    sub3ProbabilityPercent,
    sub250ProbabilityPercent,
    paceSampleCount: paceSamples.length,
    maxLongRunKm,
    weeklyVolumeAdherence,
  };
}

export function marathonForecastToPredictionResult(forecast: MarathonForecast): MarathonPredictionResult {
  return {
    ready: forecast.ready,
    message: forecast.message,
    predictedSeconds: forecast.predictedSeconds,
    predictedTime: forecast.predictedTime,
    rangeLabel: forecast.rangeLabel,
    rangeLowSeconds: forecast.rangeLowSeconds,
    rangeHighSeconds: forecast.rangeHighSeconds,
    consistencyScore: forecast.consistencyScore,
    sub3ProbabilityPercent: forecast.sub3ProbabilityPercent,
    sub250ProbabilityPercent: forecast.sub250ProbabilityPercent,
  };
}

/** Adapter für bestehende UI (`MarathonPredictionCard`). */
export function getMarathonPrediction(args: ForecastInput): MarathonPredictionResult {
  return marathonForecastToPredictionResult(computeMarathonForecast(args));
}
