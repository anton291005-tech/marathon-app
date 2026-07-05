/**
 * Read-only Textgenerierung für Recovery — keine Netzwerk-Calls, stabil.
 */

import type {
  AiReasoningMode,
  DailyRecoveryComputed,
  RecoveryConfidenceModel,
  RecoveryDailyRow,
  RecoveryInsight,
  RecoveryInsightDataMode,
  SemanticUncertaintyState,
} from "./recoveryTypes";
import { baselineValues, buildPlanWeekToDateMap, computeDailyRecoverySeries, median } from "./recoveryScoringEngine";
import {
  aiReasoningModeFromSemantic,
  insightDataModeFromSemantic,
  rollupSemanticUncertaintyState,
} from "./recoverySemanticLayer";
import { last7CalendarDays, ymd } from "./recoveryCalendarUtils";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import { getAppNow } from "../core/time/timeSystem";
import { computeRecoveryLoadSnapshot, type RecoveryLoadSnapshot } from "./homeRecoveryScore";

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export type RecoveryWarningFlags = {
  hrvDown3Plus: boolean;
  sleepDeficit2Nights: boolean;
  rhrElevatedPersistent: boolean;
  stressCombo: boolean;
};

export function detectRecoveryWarnings(
  rowsByDate: Map<string, RecoveryDailyRow>,
  baselineHrv: number | null,
  baselineSleep: number | null,
  baselineRhr: number | null,
  now: Date = getAppNow(),
): RecoveryWarningFlags {
  const last7 = last7CalendarDays(now);
  let hrvDown3Plus = false;
  if (baselineHrv) {
    const tail3 = last7.slice(-3);
    const vals = tail3.map((d) => rowsByDate.get(d)?.hrvMs);
    if (vals.every((v): v is number => typeof v === "number")) {
      hrvDown3Plus = vals.every((v) => v < baselineHrv * 0.92);
    }
  }

  let deficitNights = 0;
  if (baselineSleep) {
    for (const d of last7) {
      const h = rowsByDate.get(d)?.sleepHours;
      if (h !== undefined && h < baselineSleep - 0.95) deficitNights += 1;
    }
  }
  const sleepDeficit2Nights = deficitNights >= 2;

  let rhrElevatedPersistent = false;
  if (baselineRhr && last7.length >= 5) {
    const elevated = last7.filter((d) => {
      const r = rowsByDate.get(d)?.restingHr;
      return typeof r === "number" && r > baselineRhr + 3.5;
    }).length;
    if (elevated >= 5) rhrElevatedPersistent = true;
  }

  const ind = [hrvDown3Plus, sleepDeficit2Nights, rhrElevatedPersistent].filter(Boolean).length;
  const stressCombo = ind >= 2;

  return { hrvDown3Plus, sleepDeficit2Nights, rhrElevatedPersistent, stressCombo };
}

/** Thresholds aligned with Home score load nudges (`homeRecoveryScore.ts`). */
const ACUTE_CHRONIC_HIGH = 0.12;
const ACUTE_CHRONIC_LOW = -0.1;
const TODAY_LOAD_HEAVY = 10;

function sleepTrendSentence(args: {
  avgSleep: number | null;
  baselineSleep: number | null;
  nightsWithData: number;
  sparseData: boolean;
}): string | null {
  const { avgSleep, baselineSleep, nightsWithData, sparseData } = args;
  if (nightsWithData === 0) return null;
  if (nightsWithData < 3) {
    return sparseData
      ? "Schlaf der letzten Woche ist nur teilweise erfasst."
      : null;
  }
  if (avgSleep === null || !baselineSleep) return null;
  const diff = avgSleep - baselineSleep;
  if (diff < -0.35) {
    return sparseData
      ? "Schlaf wirkt tendenziell unter deinem üblichen Niveau."
      : "Schlaf der letzten sieben Tage liegt unter deinem üblichen Niveau.";
  }
  if (diff > 0.35) {
    return sparseData
      ? "Schlaf wirkt tendenziell über deinem Mittel."
      : "Schlaf der letzten sieben Tage liegt über deinem Mittel.";
  }
  return sparseData
    ? "Schlaf wirkt nahe deinem üblichen Niveau."
    : "Schlaf der letzten sieben Tage ist nahe deinem üblichen Niveau.";
}

function hrvTrendSentence(args: {
  avgHrv: number | null;
  baselineHrv: number | null;
  daysWithData: number;
  sparseData: boolean;
}): string | null {
  const { avgHrv, baselineHrv, daysWithData, sparseData } = args;
  if (daysWithData < 3 || avgHrv === null || !baselineHrv) return null;
  const ratio = avgHrv / baselineHrv;
  if (ratio <= 0.94) {
    return sparseData
      ? "HRV wirkt tendenziell unter deiner üblichen Bandbreite."
      : "HRV liegt unter deiner üblichen Bandbreite.";
  }
  if (ratio >= 1.03) {
    return sparseData
      ? "HRV wirkt tendenziell in einem freundlichen Bereich."
      : "HRV liegt in einem freundlichen Bereich.";
  }
  return sparseData
    ? "HRV wirkt nahe deiner üblichen Bandbreite."
    : "HRV bewegt sich in vertrauter Bandbreite.";
}

function loadTrendSentence(load: RecoveryLoadSnapshot, warnings: RecoveryWarningFlags): string | null {
  const acuteHigh = load.acuteChronicDelta > ACUTE_CHRONIC_HIGH;
  const todayHeavy = load.todayLoad >= TODAY_LOAD_HEAVY;

  if (acuteHigh && todayHeavy) {
    return "Trainingslast ist erhöht — diese Woche mehr als die Vorwoche und heute bereits spürbar.";
  }
  if (acuteHigh) {
    return "Trainingslast der letzten sieben Tage liegt über der Vorwoche.";
  }
  if (todayHeavy) {
    return "Heute liegt spürbare Trainingslast an — Erholung einplanen.";
  }
  if (warnings.stressCombo || (warnings.hrvDown3Plus && warnings.sleepDeficit2Nights)) {
    return "Schlaf und HRV signalisieren zusammen erhöhte Belastung.";
  }
  if (warnings.hrvDown3Plus) {
    return "HRV war an mehreren Tagen niedriger als üblich.";
  }
  if (warnings.sleepDeficit2Nights) {
    return "An mehreren Nächten war der Schlaf kürzer als üblich.";
  }
  if (load.acuteChronicDelta < ACUTE_CHRONIC_LOW && load.todayLoad < 3) {
    return "Trainingslast ist gegenüber der Vorwoche eher niedrig.";
  }
  return null;
}

export function buildRecoveryInsightText(args: {
  dailyRows: RecoveryDailyRow[];
  warnings: RecoveryWarningFlags;
  baselineSleep: number | null;
  baselineHrv: number | null;
  loadSnapshot: RecoveryLoadSnapshot;
  now?: Date;
  dataMode: RecoveryInsightDataMode;
  recoveryConfidence: RecoveryConfidenceModel | null;
  semanticUncertaintyState: SemanticUncertaintyState | null;
  aiReasoningMode: AiReasoningMode | null;
  /** When false, emit a short fallback instead of an empty string. */
  hasRecoverySeries?: boolean;
}): RecoveryInsight {
  const {
    dailyRows,
    warnings,
    baselineSleep,
    baselineHrv,
    loadSnapshot,
    dataMode,
    recoveryConfidence,
    semanticUncertaintyState,
    aiReasoningMode,
  } = args;
  const now = args.now ?? getAppNow();
  const rowsByDate = new Map(dailyRows.map((r) => [r.date, r]));
  const last7dates = last7CalendarDays(now);
  const sparseData = dataMode === "low" || semanticUncertaintyState === "highUncertainty";

  const shouldWarn =
    warnings.stressCombo ||
    (warnings.hrvDown3Plus && warnings.sleepDeficit2Nights) ||
    (warnings.rhrElevatedPersistent && warnings.hrvDown3Plus) ||
    loadSnapshot.acuteChronicDelta > ACUTE_CHRONIC_HIGH ||
    loadSnapshot.todayLoad >= TODAY_LOAD_HEAVY;

  if (args.hasRecoverySeries === false) {
    return {
      text:
        "Zu wenig Daten für eine stabile Recovery-Aussage. Sobald Schlaf- und Vitaldaten vorliegen, wird der Verlauf aussagekräftiger.",
      showWarning: false,
      dataMode: "low",
      recoveryConfidence,
      semanticUncertaintyState: "highUncertainty",
      aiReasoningMode: "uncertain",
    };
  }

  const sleepHours = last7dates
    .map((d) => rowsByDate.get(d)?.sleepHours)
    .filter((v): v is number => typeof v === "number");
  const hrvVals = last7dates.map((d) => rowsByDate.get(d)?.hrvMs).filter((v): v is number => typeof v === "number");

  const sentences = [
    sleepTrendSentence({
      avgSleep: mean(sleepHours),
      baselineSleep,
      nightsWithData: sleepHours.length,
      sparseData,
    }),
    hrvTrendSentence({
      avgHrv: mean(hrvVals),
      baselineHrv,
      daysWithData: hrvVals.length,
      sparseData,
    }),
    loadTrendSentence(loadSnapshot, warnings),
  ].filter((s): s is string => !!s);

  const text =
    sentences.length > 0
      ? sentences.slice(0, 3).join(" ")
      : sparseData
        ? "Recovery-Verlauf der letzten Woche ist noch dünn datiert — mehr Schlaf- und Vitaldaten machen die Einordnung klarer."
        : "Recovery-Signale der letzten Woche sind insgesamt ausgeglichen.";

  return {
    text,
    showWarning: shouldWarn,
    dataMode,
    recoveryConfidence,
    semanticUncertaintyState,
    aiReasoningMode,
  };
}

export function buildLast7InsightFromState(args: {
  dailyRows: RecoveryDailyRow[];
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  now?: Date;
  /** @deprecated Insight text uses `computeRecoveryLoadSnapshot` (todayLoad + acute/chronic). Kept for callers. */
  loadStressIdx?: number;
  precomputedSeries?: DailyRecoveryComputed[];
}): RecoveryInsight {
  const now = args.now ?? getAppNow();
  const { series } = args.precomputedSeries
    ? { series: args.precomputedSeries }
    : computeDailyRecoverySeries(
        args.dailyRows,
        buildPlanWeekToDateMap(args.plan),
        args.plan,
        args.logs,
        now,
      );
  const rowsByDate = new Map(args.dailyRows.map((r) => [r.date, r]));
  const todayYmd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const last7dates = last7CalendarDays(now);

  const last7Series = last7dates
    .map((d) => series.find((s) => s.date === d))
    .filter((x): x is DailyRecoveryComputed => !!x);

  const semanticRoll = rollupSemanticUncertaintyState(last7Series.map((s) => s.semanticUncertaintyState));
  const semanticUncertaintyState = semanticRoll ?? "highUncertainty";
  const aiReasoningMode = aiReasoningModeFromSemantic(semanticUncertaintyState);
  const dataMode: RecoveryInsightDataMode = insightDataModeFromSemantic(semanticUncertaintyState);

  const recoveryConfidence: RecoveryConfidenceModel | null =
    last7Series.length > 0
      ? {
          dataCompleteness: mean(last7Series.map((s) => s.recoveryConfidence.dataCompleteness))!,
          signalQuality: mean(last7Series.map((s) => s.recoveryConfidence.signalQuality))!,
          physiologicalStability: mean(last7Series.map((s) => s.recoveryConfidence.physiologicalStability))!,
          overallConfidence: mean(last7Series.map((s) => s.recoveryConfidence.overallConfidence))!,
        }
      : null;

  const baselineSleep = median(baselineValues(rowsByDate, todayYmd, 56, (r) => r.sleepHours));
  const baselineHrv = median(baselineValues(rowsByDate, todayYmd, 42, (r) => r.hrvMs));
  const baselineRhr = median(baselineValues(rowsByDate, todayYmd, 42, (r) => r.restingHr));

  const warnings = detectRecoveryWarnings(rowsByDate, baselineHrv, baselineSleep, baselineRhr, now);
  const loadSnapshot = computeRecoveryLoadSnapshot({ plan: args.plan, logs: args.logs, now });

  return buildRecoveryInsightText({
    dailyRows: args.dailyRows,
    warnings,
    baselineSleep,
    baselineHrv,
    loadSnapshot,
    now,
    dataMode,
    recoveryConfidence,
    semanticUncertaintyState,
    aiReasoningMode,
    hasRecoverySeries: last7Series.length > 0,
  });
}
