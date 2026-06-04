/**
 * Single source of truth for recovery across UI, AI, and training hooks.
 * `REACT_APP_EXTENDED_RECOVERY` is read only inside this module (no `productFlags` re-export).
 */

import { isSessionLogDone, parseSessionDateLabel } from "../appSmartFeatures";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import { buildLast7InsightFromState } from "./aiInsightGenerator";
import { buildRecoveryWeekRollups } from "./recoveryRollupBuilder";
import { buildPlanWeekToDateMap, computeDailyRecoverySeries } from "./recoveryScoringEngine";
import { computeHomeRecoveryScoreBreakdown, type HomeRecoveryScoreBreakdown } from "./homeRecoveryScore";
import { last7CalendarDays, ymd } from "./recoveryCalendarUtils";
import { computeVariance } from "./latentRecoveryState";
import {
  INSUFFICIENT_DATA_SESSION_RECOVERY,
  sessionRecoveryFromScore0To100,
  type LegacySessionRecovery,
} from "./recoveryLegacySignals";
import type { DailyRecoveryComputed, RecoveryDailyRow, RecoveryInsight, RecoveryWeekRollup } from "./recoveryTypes";
import {
  addCalendarDaysYmd,
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "./recoveryStorage";

/** Platzhalter-Hash für Bootstrap-Metadaten (nicht gegen Live-Fingerprints validieren). */
export const RECOVERY_BOOTSTRAP_SNAPSHOT_HASH = "boot" as const;

export type RecoveryDomainKind = "initial" | "live" | "insufficient";

export type RecoveryLatentDomain = {
  R_t: number | null;
  confidence: number | null;
  trend7d: "improving" | "stable" | "declining" | "unknown";
  uncertaintyTier: "low" | "medium" | "high";
  rVariance7d: number | null;
};

export type RecoveryDomainState = {
  /** `initial` = sicherer Cold-Start; `live` = stabiler KPI-Pfad; `insufficient` = Gate / keine Datenbasis. */
  domainKind: RecoveryDomainKind;
  /**
   * `true` nur wenn Live-Snapshot kalendertreu und mit Serie konsistent.
   * `initial` / `insufficient`: `false`.
   */
  isBootConsistentSnapshot: boolean;
  /** 0–100 nur bei berechenbarem Modellpfad; sonst `null`. */
  homeRecoveryScore0_100: number | null;
  homeRecoveryWindowStartYmd: string;
  homeRecoveryWindowEndYmd: string;
  /** `true` wenn kein KPI berechnet werden konnte (kein Fake-Score). */
  isInsufficient: boolean;
  /** Coach / grid / share — bei `isInsufficient` Platzhalter „Keine Daten“. */
  sessionRecovery: LegacySessionRecovery;
  /** Display label aligned with sessionRecovery (SSOT string for training hooks / copy) */
  trainingRecoveryLabel: string;
  latent: RecoveryLatentDomain;
  series: DailyRecoveryComputed[];
  rollups: RecoveryWeekRollup[];
  insight: RecoveryInsight;
  /** Vollständiger KPI-Breakdown — nur wenn Modell-Serie vorhanden; sonst null. */
  homeRecoveryBreakdown: HomeRecoveryScoreBreakdown | null;
  /** Which scoring path produced `homeRecoveryScore0_100` (debug / pipeline classification). */
  homeRecoveryScoreSource: "live" | "fallback7d" | "loadOnly" | null;
};

const EMPTY_LATENT: RecoveryLatentDomain = {
  R_t: null,
  confidence: null,
  trend7d: "unknown",
  uncertaintyTier: "high",
  rVariance7d: null,
};

const EMPTY_INSIGHT: RecoveryInsight = {
  text: "",
  showWarning: false,
  dataMode: "low",
  recoveryConfidence: null,
  semanticUncertaintyState: "highUncertainty",
  aiReasoningMode: "deterministic",
};

const INITIAL_BOOT_INSIGHT: RecoveryInsight = {
  text: "",
  showWarning: false,
  dataMode: "low",
  recoveryConfidence: null,
  semanticUncertaintyState: "highUncertainty",
  aiReasoningMode: "deterministic",
};

function deriveLatentFromSeries(series: DailyRecoveryComputed[], now: Date): RecoveryLatentDomain {
  const todayYmd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const last7dates = last7CalendarDays(now);
  const last7R = last7dates
    .map((d) => series.find((s) => s.date === d)?.latentR)
    .filter((v): v is number => typeof v === "number");
  const todayRow = series.find((s) => s.date === todayYmd);
  const fallbackRow = series.length ? series[series.length - 1] : undefined;
  const stateRow = todayRow ?? fallbackRow;
  let trend7d: RecoveryLatentDomain["trend7d"] = "unknown";
  if (last7R.length >= 4) {
    const half = Math.floor(last7R.length / 2);
    const a = last7R.slice(0, half).reduce((x, y) => x + y, 0) / half;
    const b = last7R.slice(half).reduce((x, y) => x + y, 0) / (last7R.length - half);
    if (b - a > 2) trend7d = "improving";
    else if (a - b > 2) trend7d = "declining";
    else trend7d = "stable";
  }
  const rVariance7d = last7R.length >= 2 ? computeVariance(last7R) : null;
  return {
    R_t: stateRow?.latentR ?? null,
    confidence: stateRow?.recoveryConfidence.overallConfidence ?? null,
    trend7d,
    uncertaintyTier:
      stateRow?.semanticUncertaintyState === "lowUncertainty"
        ? "low"
        : stateRow?.semanticUncertaintyState === "mediumUncertainty"
          ? "medium"
          : "high",
    rVariance7d,
  };
}

export type GetRecoveryDomainStateArgs = {
  /** Optional cache key (user + calendar day); ignored by scoring, used by callers for logging. */
  recoveryDayKey?: string;
  now: Date;
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  recoveryDailyRows: RecoveryDailyRow[];
  loadStressIdx: number;
  /** YYYY-MM-DD — muss zum lokalen Kalendertag von `now` passen. */
  todayCalendarYmd: string;
  /** Snapshot von `marathonRecoveryHomeScoreByDay` zum Berechnungszeitpunkt (ohne zwischenzeitliche Writes). */
  homeScoreByDay: Record<string, number>;
  /** Hash aus Logs/Health/Plan — muss zu den übergebenen Fingerprints passen (kein Mix). */
  snapshotVersion?: string;
  /** Aktueller Eingabe-Fingerprint; bei Abweichung von `snapshotVersion` → insufficient. */
  recoveryInputVersion?: string;
  workoutsFingerprint?: string;
  healthFingerprint?: string;
  /** Z. B. `JSON.stringify(patches)|wIdx=…` — muss mit `snapshotVersion` konsistent sein. */
  planFingerprint?: string;
  /**
   * `false` nur beim ersten gültigen KPI je Installation (Cold-Start-Blend). Sonst `true` / weglassen.
   */
  hasEverComputedRecoveryScore?: boolean;
  /**
   * `false` bis zur ersten erfolgreichen Live-Berechnung (persistiert). Solange: fehlende Serie / Extended aus → `initial`, nicht `insufficient`.
   */
  bootPhaseComplete?: boolean;
};

/** Ein konsistenter Schnappschuss: eine Berechnung pro Objekt (Serie + Plan + Logs + Health-Zeilen). */
export type RecoveryComputationSnapshot = {
  now: Date;
  todayCalendarYmd: string;
  workoutsFingerprint: string;
  healthFingerprint: string;
  planFingerprint: string;
  snapshotVersionHash: string;
  /** `true` wenn Kalendertag zu `now` passt und Serie vorhanden. */
  isConsistent: boolean;
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  recoveryDailyRows: RecoveryDailyRow[];
  loadStressIdx: number;
  series: DailyRecoveryComputed[];
};

function defaultPlanFingerprint(plan: PlanWeek[]): string {
  try {
    return JSON.stringify(plan);
  } catch {
    return `len:${plan.length}`;
  }
}

function isNonEmptyString(s: string | undefined): boolean {
  return typeof s === "string" && s.length > 0;
}

/**
 * Leere Logs → Fingerprint `""` ist kanonisch und gültig.
 * Sobald Logs existieren, muss der Fingerprint nicht-leer sein.
 */
function workoutsFingerprintValid(logs: Record<string, SessionLog>, wi: string): boolean {
  const keys = Object.keys(logs || {}).length;
  if (keys === 0) return wi === "";
  return isNonEmptyString(wi);
}

/** Alle Fingerprints + Versionen vorhanden — sonst Cold-Start (`initial`), kein hartes Gate. */
export function isRecoverySnapshotInputsInitialized(args: GetRecoveryDomainStateArgs): boolean {
  const wi = args.workoutsFingerprint ?? recoveryWorkoutsVersionFingerprint(args.logs);
  const hi = args.healthFingerprint ?? recoveryHealthVersionFingerprint(args.recoveryDailyRows);
  const pi = args.planFingerprint ?? defaultPlanFingerprint(args.plan);
  return (
    isNonEmptyString(args.recoveryInputVersion) &&
    isNonEmptyString(args.snapshotVersion) &&
    workoutsFingerprintValid(args.logs, wi) &&
    isNonEmptyString(hi) &&
    isNonEmptyString(pi)
  );
}

export function getRecoverySnapshotMissingInputFields(args: GetRecoveryDomainStateArgs): string[] {
  const wi = args.workoutsFingerprint ?? recoveryWorkoutsVersionFingerprint(args.logs);
  const hi = args.healthFingerprint ?? recoveryHealthVersionFingerprint(args.recoveryDailyRows);
  const pi = args.planFingerprint ?? defaultPlanFingerprint(args.plan);
  const missing: string[] = [];
  if (!isNonEmptyString(args.recoveryInputVersion)) missing.push("recoveryInputVersion");
  if (!isNonEmptyString(args.snapshotVersion)) missing.push("snapshotVersion");
  if (!workoutsFingerprintValid(args.logs, wi)) missing.push("workoutsFingerprint");
  if (!isNonEmptyString(hi)) missing.push("healthFingerprint");
  if (!isNonEmptyString(pi)) missing.push("planFingerprint");
  return missing;
}

/**
 * Returns true once there is enough real data to compute a live recovery score:
 * - 5+ completed training sessions in the last 14 days, OR
 * - 5+ days with Apple Health data (sleep / HRV / resting HR) in the last 14 days.
 *
 * When true the initialization fingerprint gate is bypassed and `bootPhaseComplete`
 * is treated as true — avoiding a permanent boot state.
 */
function computeHasMinData(args: GetRecoveryDomainStateArgs): boolean {
  const now = args.now;
  const cutoffMs = now.getTime() - 14 * 24 * 60 * 60 * 1000;

  let recentRuns = 0;
  for (const week of args.plan) {
    for (const session of week.s) {
      if (session.type === "rest") continue;
      const log = args.logs[session.id];
      if (!isSessionLogDone(log)) continue;
      const d = parseSessionDateLabel(session.date);
      if (d && d.getTime() >= cutoffMs && d.getTime() <= now.getTime()) {
        recentRuns++;
      }
    }
  }
  if (recentRuns >= 5) return true;

  const cutoffYmd = ymd(new Date(cutoffMs));
  const healthDays = args.recoveryDailyRows.filter(
    (row) =>
      row.date >= cutoffYmd &&
      (row.sleepHours !== undefined || row.hrvMs !== undefined || row.restingHr !== undefined),
  ).length;
  return healthDays >= 5;
}

/**
 * Hard gate: no numeric recovery score without sufficient physiological data.
 * Spec:
 * - sleepDays >= 3 in the last 7 days
 * - AND (hrvDays >= 2 OR restingHrDays >= 2) in the last 7 days
 */
function computeHasPhysioData(args: GetRecoveryDomainStateArgs): boolean {
  const now = args.now;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    days.push(ymd(d));
  }
  const rowsByDate = new Map(args.recoveryDailyRows.map((r) => [r.date, r]));
  let sleepDays = 0;
  let hrvDays = 0;
  let rhrDays = 0;
  for (const k of days) {
    const row = rowsByDate.get(k);
    if (!row) continue;
    if (row.sleepHours !== undefined) sleepDays += 1;
    if (row.hrvMs !== undefined) hrvDays += 1;
    if (row.restingHr !== undefined) rhrDays += 1;
  }
  const coreOk = sleepDays >= 3;
  const auxOk = hrvDays >= 2 || rhrDays >= 2;
  return coreOk && auxOk;
}

export function buildRecoveryComputationSnapshot(
  args: Pick<GetRecoveryDomainStateArgs, "now" | "todayCalendarYmd" | "plan" | "logs" | "recoveryDailyRows" | "loadStressIdx"> & {
    workoutsFingerprint: string;
    healthFingerprint: string;
    planFingerprint: string;
  },
): RecoveryComputationSnapshot | null {
  const ymdNow = ymd(new Date(args.now.getFullYear(), args.now.getMonth(), args.now.getDate()));
  const isCalendarAligned = args.todayCalendarYmd === ymdNow;
  const planMap = buildPlanWeekToDateMap(args.plan);
  const series = computeDailyRecoverySeries(
    args.recoveryDailyRows,
    planMap,
    args.plan,
    args.logs,
    args.now,
  ).series;
  if (series.length === 0) return null;
  const snapshotVersionHash = recoverySnapshotVersionHash({
    workoutsFingerprint: args.workoutsFingerprint,
    healthFingerprint: args.healthFingerprint,
    planFingerprint: args.planFingerprint,
  });
  return {
    now: args.now,
    todayCalendarYmd: args.todayCalendarYmd,
    workoutsFingerprint: args.workoutsFingerprint,
    healthFingerprint: args.healthFingerprint,
    planFingerprint: args.planFingerprint,
    snapshotVersionHash,
    isConsistent: isCalendarAligned && series.length > 0,
    plan: args.plan,
    logs: args.logs,
    recoveryDailyRows: args.recoveryDailyRows,
    loadStressIdx: args.loadStressIdx,
    series,
  };
}

/** Alias — gleiche Daten wie `buildRecoveryComputationSnapshot`. */
export const buildRecoveryInputSnapshot = buildRecoveryComputationSnapshot;

/**
 * Erster Snapshot / fehlende Live-Hashes: keine Validierungs-Failure — nur Metadaten mit `snapshotVersionHash === "boot"`.
 */
export function buildBootstrapRecoveryComputationSnapshot(
  args: Pick<GetRecoveryDomainStateArgs, "now" | "todayCalendarYmd" | "plan" | "logs" | "recoveryDailyRows" | "loadStressIdx"> & {
    workoutsFingerprint: string;
    healthFingerprint: string;
    planFingerprint: string;
  },
): RecoveryComputationSnapshot {
  const planMap = buildPlanWeekToDateMap(args.plan);
  let series: DailyRecoveryComputed[] = [];
  try {
    const extended = typeof process !== "undefined" && process.env.REACT_APP_EXTENDED_RECOVERY === "1";
    if (extended) {
      series = computeDailyRecoverySeries(
        args.recoveryDailyRows,
        planMap,
        args.plan,
        args.logs,
        args.now,
      ).series;
    }
  } catch {
    series = [];
  }
  return {
    now: args.now,
    todayCalendarYmd: args.todayCalendarYmd,
    workoutsFingerprint: args.workoutsFingerprint,
    healthFingerprint: args.healthFingerprint,
    planFingerprint: args.planFingerprint,
    snapshotVersionHash: RECOVERY_BOOTSTRAP_SNAPSHOT_HASH,
    isConsistent: false,
    plan: args.plan,
    logs: args.logs,
    recoveryDailyRows: args.recoveryDailyRows,
    loadStressIdx: args.loadStressIdx,
    series,
  };
}

function emptyDomainWindows(now: Date): { windowStartYmd: string; windowEndYmd: string } {
  const last7 = last7CalendarDays(now);
  return {
    windowStartYmd: last7[0] ?? "",
    windowEndYmd: last7[last7.length - 1] ?? "",
  };
}

/** Cold-Start: no numeric score; UI shows "Wird ermittelt". */
export function buildInitialRecoveryDomainState(now: Date): RecoveryDomainState {
  const { windowStartYmd, windowEndYmd } = emptyDomainWindows(now);
  return {
    domainKind: "initial",
    isBootConsistentSnapshot: false,
    homeRecoveryScore0_100: null,
    homeRecoveryWindowStartYmd: windowStartYmd,
    homeRecoveryWindowEndYmd: windowEndYmd,
    isInsufficient: false,
    sessionRecovery: INSUFFICIENT_DATA_SESSION_RECOVERY,
    trainingRecoveryLabel: INSUFFICIENT_DATA_SESSION_RECOVERY.label,
    latent: { ...EMPTY_LATENT },
    series: [],
    rollups: [],
    insight: { ...INITIAL_BOOT_INSIGHT },
    homeRecoveryBreakdown: null,
    homeRecoveryScoreSource: null,
  };
}

export function buildInsufficientRecoveryDomainState(now: Date): RecoveryDomainState {
  const { windowStartYmd, windowEndYmd } = emptyDomainWindows(now);
  return {
    domainKind: "insufficient",
    isBootConsistentSnapshot: false,
    homeRecoveryScore0_100: null,
    homeRecoveryWindowStartYmd: windowStartYmd,
    homeRecoveryWindowEndYmd: windowEndYmd,
    isInsufficient: true,
    sessionRecovery: INSUFFICIENT_DATA_SESSION_RECOVERY,
    trainingRecoveryLabel: INSUFFICIENT_DATA_SESSION_RECOVERY.label,
    latent: { ...EMPTY_LATENT },
    series: [],
    rollups: [],
    insight: { ...EMPTY_INSIGHT },
    homeRecoveryBreakdown: null,
    homeRecoveryScoreSource: null,
  };
}

export function getRecoveryDomainState(args: GetRecoveryDomainStateArgs): RecoveryDomainState {
  const now = args.now;

  const workoutsFingerprint = args.workoutsFingerprint ?? recoveryWorkoutsVersionFingerprint(args.logs);
  const healthFingerprint = args.healthFingerprint ?? recoveryHealthVersionFingerprint(args.recoveryDailyRows);
  const planFingerprint = args.planFingerprint ?? defaultPlanFingerprint(args.plan);
  const recomputedVersion = recoverySnapshotVersionHash({
    workoutsFingerprint,
    healthFingerprint,
    planFingerprint,
  });

  const hasMinData = computeHasMinData(args);
  const hasPhysioData = computeHasPhysioData(args);
  // These are used only for optional diagnostics and legacy gating.
  isRecoverySnapshotInputsInitialized(args);
  getRecoverySnapshotMissingInputFields(args);

  if (!hasMinData) {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.assert(
        args.homeScoreByDay[args.todayCalendarYmd] == null,
        "Recovery: unexpected persisted score without hasMinData",
      );
    }
    return buildInitialRecoveryDomainState(now);
  }

  if (!hasPhysioData) {
    return buildInsufficientRecoveryDomainState(now);
  }

  if (
    args.snapshotVersion != null &&
    args.recoveryInputVersion != null &&
    args.snapshotVersion !== args.recoveryInputVersion
  ) {
    return buildInsufficientRecoveryDomainState(now);
  }

  if (args.snapshotVersion != null && recomputedVersion !== args.snapshotVersion) {
    return buildInsufficientRecoveryDomainState(now);
  }

  const snapshot = buildRecoveryComputationSnapshot({
    now: args.now,
    todayCalendarYmd: args.todayCalendarYmd,
    plan: args.plan,
    logs: args.logs,
    recoveryDailyRows: args.recoveryDailyRows,
    loadStressIdx: args.loadStressIdx,
    workoutsFingerprint,
    healthFingerprint,
    planFingerprint,
  });
  if (!snapshot) {
    return buildInsufficientRecoveryDomainState(now);
  }
  if (!snapshot.isConsistent) {
    return buildInsufficientRecoveryDomainState(now);
  }
  const { series, plan, logs, recoveryDailyRows, loadStressIdx } = snapshot;
  const snapNow = snapshot.now;

  const { windowStartYmd, windowEndYmd } = emptyDomainWindows(snapNow);

  const yday = addCalendarDaysYmd(args.todayCalendarYmd, -1);
  const yesterdayScore = args.homeScoreByDay[yday] ?? null;
  const todayPriorScore = args.homeScoreByDay[args.todayCalendarYmd] ?? null;
  const crossDayAnchor = yesterdayScore != null ? yesterdayScore : todayPriorScore;

  const homeRecoveryBreakdown = computeHomeRecoveryScoreBreakdown({
    series,
    plan,
    logs,
    now: snapNow,
    hasEverComputedRecoveryScore: args.hasEverComputedRecoveryScore,
    stabilityContext: {
      trainingGuardPreviousScore: crossDayAnchor,
      stabilityClampAnchor: crossDayAnchor,
      inertiaIntraDayPreviousScore: todayPriorScore,
      intraDayAnchorCalendarYmd: todayPriorScore != null ? args.todayCalendarYmd : null,
    },
  });
  const scoreNum = homeRecoveryBreakdown.score;

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.assert(snapshot.isConsistent === true, "Recovery: snapshot not consistent");
    // eslint-disable-next-line no-console
    console.assert(
      args.todayCalendarYmd === ymd(new Date(args.now.getFullYear(), args.now.getMonth(), args.now.getDate())),
      "Recovery: todayCalendarYmd vs now mismatch",
    );
    const cf = homeRecoveryBreakdown.contributingFactors;
    const breakdownSum = cf.base + cf.executionNudge + cf.trainingPenalty + cf.todayTrainingPenalty;
    if (Number.isFinite(breakdownSum) && Number.isFinite(scoreNum)) {
      // Roh-Modell vs. Endscore: nur grobe Schranke (Clamp / Trägheit / Runden).
      // eslint-disable-next-line no-console
      console.assert(
        Math.abs(breakdownSum - scoreNum) <= 24,
        "Recovery: breakdown sum vs final score drift",
      );
    }
  }

  const latent = deriveLatentFromSeries(series, snapNow);
  const rollups = buildRecoveryWeekRollups({
    plan,
    logs,
    dailyRows: recoveryDailyRows,
    now: snapNow,
    precomputedSeries: series,
  });
  const insight = buildLast7InsightFromState({
    dailyRows: recoveryDailyRows,
    plan,
    logs,
    now: snapNow,
    loadStressIdx,
    precomputedSeries: series,
  });

  const sessionRecovery = sessionRecoveryFromScore0To100(scoreNum);

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.assert(hasMinData === true && hasPhysioData === true, "Recovery: live score without required data gate");
  }

  return {
    domainKind: "live",
    isBootConsistentSnapshot: true,
    homeRecoveryScore0_100: Math.round(Math.max(0, Math.min(100, scoreNum))),
    homeRecoveryWindowStartYmd: windowStartYmd,
    homeRecoveryWindowEndYmd: windowEndYmd,
    isInsufficient: false,
    sessionRecovery,
    trainingRecoveryLabel: sessionRecovery.label,
    latent,
    series,
    rollups,
    insight,
    homeRecoveryBreakdown,
    homeRecoveryScoreSource: "live",
  };
}
