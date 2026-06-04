import {
  berlinWallClockYmd,
  calendarDaysBetweenYmd,
  isSessionLogDone,
  parseSessionDateLabel,
} from "../../appSmartFeatures";
import type { StoredHealthRun } from "../../healthRuns";
import { getStoredHealthRunCanonicalType, storedHealthRunDistanceKmNumeric } from "../../healthRuns";
import type { PlanSession, PlanWeek, SessionLog } from "../../marathonPrediction";
import { getEffectiveKm } from "../../marathonPrediction";
import type { AiContext } from "./types";
import { extractActivePaceSecPerKm, extractStructuredRunPaceSecPerKm } from "./intervalPaceExtraction";

const MARATHON_KM = 42.195;
const SUB3_SECONDS = 10800;
const LONG_WINDOW_DAYS = 8 * 7;
const TEMPO_WINDOW_DAYS = 6 * 7;
const RECENT_SLEEP_DAYS = 14;
const LONG_MIN_KM = 14;
const TEMPO_MARATHON_PACE_FACTOR = 1.17;

export type PaceBasedPrediction = {
  predictedMarathonTimeSeconds: number;
  predictedPaceSecPerKm: number;
  confidenceLevel: "high" | "medium" | "low";
  dataPointsUsed: number;
  primaryMethod: "long_run" | "tempo" | "combined";
  recoveryAdjustmentApplied: number;
  isSubThreeHourTarget: boolean;
  gapToSubThreeSeconds: number;
  interpretation: string;
};

type CompletedRunSample = {
  ymd: string;
  sessionType: string;
  distanceKm: number;
  durationSec: number;
  paceSecPerKm: number;
};

export function formatRaceClockGerman(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatPaceGerman(secPerKm: number): string {
  const s = Math.round(Math.max(1, secPerKm));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}/km`;
}

function utcWeekdayFromYmd(ymd: string): number {
  const [y, mo, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  if (![y, mo, d].every((n) => Number.isFinite(n))) return 0;
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function addDaysToYmd(ymd: string, delta: number): string | null {
  const [y, mo, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  if (![y, mo, d].every((n) => Number.isFinite(n))) return null;
  const t = Date.UTC(y, mo - 1, d) + delta * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Calendar Mon–Sun (UTC date arithmetic on Berlin YMD). */
export function computeWeekPlanCompletionPercent(context: AiContext, now: Date = new Date(context.todayIso)): number {
  const todayYmd = berlinWallClockYmd(now);
  const dow = utcWeekdayFromYmd(todayYmd);
  const mondayDelta = (dow + 6) % 7;
  const weekStart = addDaysToYmd(todayYmd, -mondayDelta);
  const weekEnd = weekStart ? addDaysToYmd(weekStart, 6) : null;
  if (!weekStart || !weekEnd) return 0;

  const year = now.getFullYear();
  let due = 0;
  let done = 0;
  for (const w of context.plan as PlanWeek[]) {
    for (const s of w.s) {
      if (s.type === "rest") continue;
      const dt = parseSessionDateLabel(s.date, year);
      if (!dt) continue;
      const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (ymd < weekStart || ymd > weekEnd) continue;
      if (ymd > todayYmd) continue;
      due += 1;
      if (isSessionLogDone(context.logs[s.id] as SessionLog | undefined)) done += 1;
    }
  }
  if (due <= 0) return 0;
  return Math.round((100 * done) / due);
}

function riegelMarathonSeconds(runSeconds: number, d1Km: number): number {
  if (!(d1Km > 0) || !(runSeconds > 0)) return NaN;
  return runSeconds * Math.pow(MARATHON_KM / d1Km, 1.06);
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

function extractDistanceKmForPace(
  s: PlanSession,
  log: SessionLog | undefined,
  byId: Map<string, StoredHealthRun>,
): number | null {
  if (!isSessionLogDone(log)) return null;
  const kmEff = getEffectiveKm(s, log);
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

function paceSecPerKmFromLog(
  s: PlanSession,
  log: SessionLog | undefined,
  byId: Map<string, StoredHealthRun>,
): number | null {
  const dist = extractDistanceKmForPace(s, log, byId);
  const dur = extractDurationSec(log, byId);
  if (!(dist && dist > 0 && dur && dur > 0)) return null;
  const totalPace = dur / dist;

  const ar = log?.assignedRun;
  if (!ar?.runId) return totalPace;

  const h = byId.get(ar.runId);
  const laps = h?.laps;
  const sessionType = s.type;

  if (sessionType === "interval" || sessionType === "tempo") {
    return extractActivePaceSecPerKm(laps, totalPace) ?? totalPace;
  }

  if (sessionType === "long" || sessionType === "easy") {
    if (laps && laps.length >= 4) {
      return extractStructuredRunPaceSecPerKm(laps, null, dist, totalPace) ?? totalPace;
    }
  }

  return totalPace;
}

function isLongType(t: string): boolean {
  return t === "long" || t === "long_run";
}

function isTempoType(t: string): boolean {
  return t === "tempo" || t === "interval";
}

function collectSamples(
  context: AiContext,
  now: Date,
  healthRuns: StoredHealthRun[],
): CompletedRunSample[] {
  const byId = healthRunById(healthRuns);
  const todayYmd = berlinWallClockYmd(now);
  const year = now.getFullYear();
  const out: CompletedRunSample[] = [];

  for (const w of context.plan as PlanWeek[]) {
    for (const s of w.s) {
      const dt = parseSessionDateLabel(s.date, year);
      if (!dt) continue;
      const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (ymd > todayYmd) continue;
      const daysBack = calendarDaysBetweenYmd(ymd, todayYmd);
      if (!Number.isFinite(daysBack) || daysBack < 0 || daysBack > LONG_WINDOW_DAYS) continue;

      const log = context.logs[s.id] as SessionLog | undefined;
      if (!isSessionLogDone(log)) continue;

      const pace = paceSecPerKmFromLog(s as PlanSession, log, byId);
      const dist = extractDistanceKmForPace(s as PlanSession, log, byId);
      const dur = extractDurationSec(log, byId);
      if (!(pace && dist && dur)) continue;

      out.push({
        ymd,
        sessionType: s.type,
        distanceKm: dist,
        durationSec: dur,
        paceSecPerKm: pace,
      });
    }
  }

  out.sort((a, b) => (a.ymd === b.ymd ? 0 : a.ymd < b.ymd ? -1 : 1));
  return out;
}

function weightedLongRunPrediction(longRuns: CompletedRunSample[]): number | null {
  const eligible = longRuns.filter((r) => isLongType(r.sessionType) && r.distanceKm >= LONG_MIN_KM);
  if (eligible.length < 2) return null;
  const recent = [...eligible].sort((a, b) => (a.ymd === b.ymd ? 0 : a.ymd < b.ymd ? 1 : -1)).slice(0, 3);
  const weights = [3, 2, 1];
  let num = 0;
  let den = 0;
  recent.forEach((run, i) => {
    const w = weights[i] ?? 1;
    const pred = riegelMarathonSeconds(run.durationSec, run.distanceKm);
    if (Number.isFinite(pred)) {
      num += w * pred;
      den += w;
    }
  });
  if (den <= 0) return null;
  return num / den;
}

function tempoPrediction(samples: CompletedRunSample[], todayYmd: string): number | null {
  const recentCut = addDaysToYmd(todayYmd, -TEMPO_WINDOW_DAYS);
  if (!recentCut) return null;
  const tempos = samples.filter((r) => isTempoType(r.sessionType) && r.ymd >= recentCut);
  if (tempos.length === 0) return null;
  const avgPace = tempos.reduce((a, r) => a + r.paceSecPerKm, 0) / tempos.length;
  const marathonPace = avgPace * TEMPO_MARATHON_PACE_FACTOR;
  return marathonPace * MARATHON_KM;
}

type RecoveryAdjust = {
  factor: number;
  combinedDecimal: number;
  rhrDelta: number | null;
  sleepPenaltyApplied: boolean;
};

function computeRecoveryAdjustment(context: AiContext, todayYmd: string): RecoveryAdjust {
  let factor = 1;
  let combined = 0;
  let rhrDelta: number | null = null;
  let sleepPenaltyApplied = false;

  const rows = [...(context.recoveryDailyRows ?? [])].filter((r) => r?.date).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) {
    return { factor: 1, combinedDecimal: 0, rhrDelta: null, sleepPenaltyApplied: false };
  }

  const baselineVals = rows
    .slice(0, 7)
    .map((r) => r.restingHr)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  const baseline =
    baselineVals.length >= 3 ? baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length : null;

  const last14Start = addDaysToYmd(todayYmd, -(RECENT_SLEEP_DAYS - 1));
  if (!last14Start) {
    return { factor: 1, combinedDecimal: 0, rhrDelta: null, sleepPenaltyApplied: false };
  }
  const recentRows = rows.filter((r) => r.date >= last14Start && r.date <= todayYmd);
  const rhrRecent = recentRows
    .map((r) => r.restingHr)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  const avgRecentRhr = rhrRecent.length ? rhrRecent.reduce((a, b) => a + b, 0) / rhrRecent.length : null;

  if (baseline != null && avgRecentRhr != null) {
    rhrDelta = avgRecentRhr - baseline;
    if (rhrDelta > 5) {
      factor *= 1.02;
      combined -= 0.02;
    } else if (rhrDelta <= 0) {
      factor *= 0.99;
      combined += 0.01;
    }
  }

  const sleepVals = recentRows
    .map((r) => r.sleepHours)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  if (sleepVals.length >= 4) {
    const avgSleep = sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length;
    if (avgSleep < 7) {
      factor *= 1.01;
      combined -= 0.01;
      sleepPenaltyApplied = true;
    }
  }

  return { factor, combinedDecimal: combined, rhrDelta, sleepPenaltyApplied };
}

function confidenceFromCounts(longUsed: number, tempoUsed: number, combined: boolean): "high" | "medium" | "low" {
  if (longUsed >= 4 || (longUsed >= 3 && tempoUsed >= 3)) return "high";
  if (longUsed >= 3 || longUsed === 2 || tempoUsed >= 3) return "medium";
  if (combined && longUsed >= 2 && tempoUsed >= 1) return "medium";
  return "low";
}

function minutesRounded(seconds: number): number {
  return Math.max(1, Math.round(Math.abs(seconds) / 60));
}

function buildInterpretation(args: {
  prediction: Omit<PaceBasedPrediction, "interpretation">;
  longAvgPaceSecPerKm: number | null;
  longRunCount: number;
  tempoCount: number;
  recovery: RecoveryAdjust;
  longEquivSeconds: number | null;
  displayLongWindowCount: number;
}): string {
  const { prediction, longAvgPaceSecPerKm, longRunCount, tempoCount, recovery, displayLongWindowCount } = args;
  const nLong = displayLongWindowCount;
  const paceStr = longAvgPaceSecPerKm != null ? formatPaceGerman(longAvgPaceSecPerKm) : formatPaceGerman(prediction.predictedPaceSecPerKm);
  const timeStr = formatRaceClockGerman(prediction.predictedMarathonTimeSeconds);
  const sub3Pace = formatPaceGerman(SUB3_SECONDS / MARATHON_KM);

  let body = "";
  const lowPrefix =
    prediction.confidenceLevel === "low"
      ? "Noch wenige Daten verfügbar — mit mehr abgeschlossenen Einheiten wird die Prognose genauer. "
      : "";

  const recoveryClause =
    recovery.combinedDecimal < -0.01 && recovery.rhrDelta != null && recovery.rhrDelta > 5
      ? ` Deine Erholungswerte zeigen aktuell erhöhte Belastung (Ruhe-HF +${Math.round(recovery.rhrDelta)} bpm) — das fließt konservativ in die Prognose ein.`
      : "";

  if (prediction.isSubThreeHourTarget) {
    const under = minutesRounded(SUB3_SECONDS - prediction.predictedMarathonTimeSeconds);
    body =
      `${lowPrefix}Basierend auf deinen letzten ${nLong} langen Läufen (Ø ${paceStr}) prognostiziere ich eine Marathonzeit von ${timeStr} — das ist ${under} Minuten unter der 3-Stunden-Marke.${recoveryClause} Halte das aktuelle Niveau, du bist auf Kurs.`;
  } else if (prediction.gapToSubThreeSeconds <= 300) {
    const overMin = minutesRounded(prediction.gapToSubThreeSeconds);
    const focus =
      tempoCount < longRunCount
        ? "Priorisiere strukturierte Tempo- und Schwelleneinheiten, um die Geschwindigkeitsreserve zu erhöhen."
        : "Nutze die nächsten langen Läufe, um Marathonpace ökonomischer zu halten — gleichmäßige Pace statt Einbruch am Ende.";
    body =
      `${lowPrefix}Deine aktuelle Form deutet auf ${timeStr} hin — ${overMin} Minuten über Sub-3h. Das ist knapp. ${focus}${recoveryClause}`;
  } else {
    const lrEquiv =
      longAvgPaceSecPerKm != null && args.longEquivSeconds != null
        ? formatRaceClockGerman(args.longEquivSeconds)
        : timeStr;
    body =
      `${lowPrefix}Aktuell prognostiziere ich ${timeStr} für deinen Marathon. Um Sub-3h zu erreichen, brauchst du ${sub3Pace} Marathonpace. Deine aktuelle Long-Run-Pace von ${paceStr} entspricht einer rechnerischen Zielzeit von ${lrEquiv}.${recoveryClause} Verteile Tempo und Länge über mehr Wochen — ohne Sprünge bei der Intensität.`;
  }

  return body.replace(/\s+/g, " ").trim();
}

export function computePaceBasedPrediction(context: AiContext): PaceBasedPrediction | null {
  const now = new Date(context.todayIso);
  const healthRuns: StoredHealthRun[] = Array.isArray(context.healthRuns) ? context.healthRuns : [];
  const todayYmd = berlinWallClockYmd(now);

  const samples = collectSamples(context, now, healthRuns);
  const longRuns = samples.filter((r) => isLongType(r.sessionType) && r.distanceKm >= LONG_MIN_KM);
  if (longRuns.length < 2) return null;

  const longPred = weightedLongRunPrediction(longRuns);
  if (longPred == null || !Number.isFinite(longPred)) return null;

  const tempoPred = tempoPrediction(samples, todayYmd);

  let combinedSeconds = longPred;
  let primaryMethod: PaceBasedPrediction["primaryMethod"] = "long_run";
  if (tempoPred != null && Number.isFinite(tempoPred)) {
    combinedSeconds = 0.6 * longPred + 0.4 * tempoPred;
    primaryMethod = "combined";
  } else {
    primaryMethod = "long_run";
  }

  const recovery = computeRecoveryAdjustment(context, todayYmd);
  const adjustedSeconds = combinedSeconds * recovery.factor;
  const predictedMarathonTimeSeconds = Math.round(adjustedSeconds);
  const predictedPaceSecPerKm = predictedMarathonTimeSeconds / MARATHON_KM;

  const longRecent = [...longRuns].sort((a, b) => (a.ymd === b.ymd ? 0 : a.ymd < b.ymd ? 1 : -1)).slice(0, 3);
  const longAvgPaceSecPerKm =
    longRecent.length > 0 ? longRecent.reduce((a, r) => a + r.paceSecPerKm, 0) / longRecent.length : null;

  const tempoWindowStart = addDaysToYmd(todayYmd, -TEMPO_WINDOW_DAYS);
  const tempoCount =
    tempoWindowStart != null
      ? samples.filter((r) => isTempoType(r.sessionType) && r.ymd >= tempoWindowStart).length
      : 0;

  const confidenceLevel = confidenceFromCounts(longRuns.length, tempoCount, tempoPred != null);
  const dataPointsUsed = longRuns.length + tempoCount;

  const isSubThreeHourTarget = predictedMarathonTimeSeconds < SUB3_SECONDS;
  const gapToSubThreeSeconds = predictedMarathonTimeSeconds - SUB3_SECONDS;

  const basePred: Omit<PaceBasedPrediction, "interpretation"> = {
    predictedMarathonTimeSeconds,
    predictedPaceSecPerKm,
    confidenceLevel,
    dataPointsUsed,
    primaryMethod,
    recoveryAdjustmentApplied: recovery.combinedDecimal,
    isSubThreeHourTarget,
    gapToSubThreeSeconds,
  };

  const recentLong = [...longRuns].sort((a, b) => (a.ymd === b.ymd ? 0 : a.ymd < b.ymd ? 1 : -1)).slice(0, 3);
  const avgDistRecentLong =
    recentLong.length > 0 ? recentLong.reduce((a, r) => a + r.distanceKm, 0) / recentLong.length : null;
  const longEquivSeconds =
    longAvgPaceSecPerKm != null && avgDistRecentLong != null && avgDistRecentLong > 0
      ? riegelMarathonSeconds(longAvgPaceSecPerKm * avgDistRecentLong, avgDistRecentLong)
      : null;

  const interpretation = buildInterpretation({
    prediction: basePred,
    longAvgPaceSecPerKm,
    longRunCount: longRuns.length,
    tempoCount,
    recovery,
    longEquivSeconds: longEquivSeconds != null && Number.isFinite(longEquivSeconds) ? longEquivSeconds : null,
    displayLongWindowCount: longRecent.length,
  });

  return { ...basePred, interpretation };
}
