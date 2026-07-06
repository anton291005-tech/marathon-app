/**
 * Wochen-Rollups für Recovery-Verlauf — keine Rohdaten-Queries, nur Aggregation aus Engine-Series.
 */

import { parseSessionDateLabel } from "../appSmartFeatures";
import { getAppNow } from "../core/time/timeSystem";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import type {
  AiReasoningMode,
  DailyRecoveryComputed,
  RecoveryConfidenceModel,
  RecoveryDailyRow,
  RecoveryWeekRollup,
  ScoreConfidence,
  SemanticUncertaintyState,
} from "./recoveryTypes";
import { buildPlanWeekToDateMap, computeDailyRecoverySeries, scoreConfidenceFromModel } from "./recoveryScoringEngine";
import { parseYmd, ymd, daysBetweenInclusive } from "./recoveryCalendarUtils";
import { weeklyTrainingStressIndex } from "./planTrainingLoad";
import { certaintyLabelDe, rollupAiReasoningMode, rollupSemanticUncertaintyState } from "./recoverySemanticLayer";

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function weekDateBounds(week: PlanWeek): { first: Date | null; last: Date | null } {
  let first: Date | null = null;
  let last: Date | null = null;
  for (const s of week.s ?? []) {
    const d = parseSessionDateLabel(s.date);
    if (!d) continue;
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return { first, last };
}

function rollupConfidence(daySeries: DailyRecoveryComputed[]): ScoreConfidence {
  if (daySeries.length === 0) return "insufficient";
  const overallMu = mean(daySeries.map((d) => d.recoveryConfidence.overallConfidence))!;
  const compMu = mean(daySeries.map((d) => d.recoveryConfidence.dataCompleteness))!;
  return scoreConfidenceFromModel(overallMu, compMu);
}

function meanRecoveryConfidence(daySeries: DailyRecoveryComputed[]): RecoveryConfidenceModel | null {
  if (daySeries.length === 0) return null;
  return {
    dataCompleteness: mean(daySeries.map((d) => d.recoveryConfidence.dataCompleteness))!,
    signalQuality: mean(daySeries.map((d) => d.recoveryConfidence.signalQuality))!,
    physiologicalStability: mean(daySeries.map((d) => d.recoveryConfidence.physiologicalStability))!,
    overallConfidence: mean(daySeries.map((d) => d.recoveryConfidence.overallConfidence))!,
  };
}

function confidenceBandLabel(o: number): string {
  if (o >= 0.72) return "Hoch";
  if (o >= 0.45) return "Mittel";
  return "Niedrig";
}

function dataQualityBadge(rc: RecoveryConfidenceModel | null): string | null {
  if (!rc) return null;
  if (rc.overallConfidence >= 0.72 && rc.signalQuality >= 0.78) return "Modellgenauigkeit: solide";
  if (rc.overallConfidence >= 0.45 && rc.signalQuality >= 0.55) return "Modellgenauigkeit: teilweise eingrenzbar";
  return "Eingeschränkte Modellgenauigkeit";
}

function latentBandHalfWidthFromTrend(trend7: number[]): number {
  if (trend7.length < 2) return 10;
  const mu = mean(trend7)!;
  const v = mean(trend7.map((x) => (x - mu) ** 2))!;
  const sd = Math.sqrt(v);
  return Math.max(5, Math.min(24, sd * 1.2 + 3));
}

function loadStressLabel(loadIdx: number): string {
  if (loadIdx >= 3.5) return "hoch";
  if (loadIdx >= 2.2) return "moderat";
  return "leicht";
}

export function buildRecoveryWeekRollups(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  dailyRows: RecoveryDailyRow[];
  now?: Date;
  /** When set, avoids a second full scoring pass (same series as computeDailyRecoverySeries). */
  precomputedSeries?: DailyRecoveryComputed[];
}): RecoveryWeekRollup[] {
  const now = args.now ?? getAppNow();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const planMap = buildPlanWeekToDateMap(args.plan);
  const rowsByDate = new Map(args.dailyRows.map((r) => [r.date, r]));
  const { series } = args.precomputedSeries
    ? { series: args.precomputedSeries }
    : computeDailyRecoverySeries(args.dailyRows, planMap, args.plan, args.logs, now);
  const smoothedByDate = new Map(series.map((s) => [s.date, s]));

  return args.plan.map((week, weekIndex) => {
    const { first, last } = weekDateBounds(week);
    const label = `W${week.wn}`;
    const loadIdx0 = weeklyTrainingStressIndex(week);

    if (!first || !last) {
      return {
        label,
        weekIndex,
        recoveryScore: 50,
        latentTrendBandHalfWidth: 14,
        sleepScoreAvg: null,
        hrvTrend: "unknown",
        loadMarker: loadIdx0,
        trend7: [50, 50, 50, 50, 50, 50, 50],
        sub: {
          sleepQualityLabel: "Hohe Unsicherheit im physiologischen Zustand",
          stabilityLabel: "Trend: neutral (unsicher)",
          loadBalanceLabel: `Trainingskontext · Belastung ${loadStressLabel(loadIdx0)}`,
        },
        hasHealthData: false,
        scoreConfidence: "insufficient",
        recoveryConfidence: null,
        confidenceBandLabel: "Niedrig",
        dataQualityBadge: "Eingeschränkte Modellgenauigkeit",
        semanticUncertaintyState: "highUncertainty",
        certaintyLabel: certaintyLabelDe("highUncertainty"),
        aiReasoningMode: rollupAiReasoningMode(["highUncertainty"]),
      };
    }

    if (first.getTime() > todayStart.getTime()) {
      return {
        label,
        weekIndex,
        recoveryScore: 50,
        latentTrendBandHalfWidth: 14,
        sleepScoreAvg: null,
        hrvTrend: "unknown",
        loadMarker: loadIdx0,
        trend7: [50, 50, 50, 50, 50, 50, 50],
        sub: {
          sleepQualityLabel: "Woche noch nicht begonnen",
          stabilityLabel: "Trend: neutral (Projektion)",
          loadBalanceLabel: `Erwartete Belastung: ${loadStressLabel(loadIdx0)}`,
        },
        hasHealthData: false,
        scoreConfidence: "insufficient",
        recoveryConfidence: null,
        confidenceBandLabel: "Niedrig",
        dataQualityBadge: "Reduzierte Messsicherheit",
        semanticUncertaintyState: "highUncertainty",
        certaintyLabel: certaintyLabelDe("highUncertainty"),
        aiReasoningMode: rollupAiReasoningMode(["highUncertainty"]),
      };
    }

    const days = daysBetweenInclusive(first, last).filter((d) => {
      const dd = parseYmd(d);
      return dd && dd.getTime() <= todayStart.getTime();
    });

    const hasHealth = days.some((d) => {
      const r = rowsByDate.get(d);
      return r && (r.sleepHours !== undefined || r.hrvMs !== undefined || r.restingHr !== undefined);
    });

    let recoveryScore: number | null = null;
    let sleepScoreAvg: number | null = null;
    let hrvTrend: RecoveryWeekRollup["hrvTrend"] = "unknown";
    const trend7: number[] = [];
    let scoreConfidence: ScoreConfidence = "insufficient";
    let recoveryConfidence: RecoveryConfidenceModel | null = null;
    let bandLabel = "—";
    let dqBadge: string | null = null;
    let semanticUncertaintyState: SemanticUncertaintyState | null = null;
    let certaintyLabel: string | null = null;
    let aiReasoningMode: AiReasoningMode | null = null;

    const daySeries = days.map((d) => smoothedByDate.get(d)).filter((x): x is DailyRecoveryComputed => !!x);

    if (daySeries.length > 0) {
      recoveryConfidence = meanRecoveryConfidence(daySeries);
      bandLabel = recoveryConfidence ? confidenceBandLabel(recoveryConfidence.overallConfidence) : "—";
      dqBadge = dataQualityBadge(recoveryConfidence);
      semanticUncertaintyState = rollupSemanticUncertaintyState(
        daySeries.map((d) => d.semanticUncertaintyState),
      );
      certaintyLabel = semanticUncertaintyState ? certaintyLabelDe(semanticUncertaintyState) : null;
      aiReasoningMode = rollupAiReasoningMode(daySeries.map((d) => d.semanticUncertaintyState));
      scoreConfidence = rollupConfidence(daySeries);
      const rVals = daySeries.map((x) => x.latentR);
      if (rVals.length) recoveryScore = Math.round(mean(rVals)!);

      const sleepSubs = daySeries.map((x) => x.sub.sleep).filter((v): v is number => typeof v === "number");
      if (sleepSubs.length) sleepScoreAvg = Math.round(mean(sleepSubs)!);

      const hrvValsFirst = days
        .slice(0, Math.max(1, Math.floor(days.length / 2)))
        .map((d) => rowsByDate.get(d)?.hrvMs)
        .filter((v): v is number => typeof v === "number");
      const hrvValsSecond = days
        .slice(Math.floor(days.length / 2))
        .map((d) => rowsByDate.get(d)?.hrvMs)
        .filter((v): v is number => typeof v === "number");
      const hrvFirst = mean(hrvValsFirst);
      const hrvSecond = mean(hrvValsSecond);
      if (hrvValsFirst.length >= 2 && hrvValsSecond.length >= 2 && hrvFirst && hrvSecond) {
        const diff = (hrvSecond - hrvFirst) / hrvFirst;
        if (diff > 0.04) hrvTrend = "up";
        else if (diff < -0.04) hrvTrend = "down";
        else hrvTrend = "flat";
      }

      const weekEndClip = last.getTime() > todayStart.getTime() ? todayStart : last;
      const cursor = new Date(weekEndClip.getFullYear(), weekEndClip.getMonth(), weekEndClip.getDate());
      const firstDay = new Date(first.getFullYear(), first.getMonth(), first.getDate());
      for (let i = 0; i < 7; i++) {
        const k = ymd(cursor);
        const sc = smoothedByDate.get(k)?.smoothedLatentR;
        if (typeof sc === "number") trend7.unshift(sc);
        cursor.setDate(cursor.getDate() - 1);
        if (cursor < firstDay) break;
      }
    }

    const loadIdx = weeklyTrainingStressIndex(week);
    const loadMarker = loadIdx;

    if (recoveryScore === null && days.length > 0) {
      recoveryScore = 50;
      semanticUncertaintyState = semanticUncertaintyState ?? "highUncertainty";
      certaintyLabel = certaintyLabel ?? certaintyLabelDe("highUncertainty");
      aiReasoningMode = aiReasoningMode ?? rollupAiReasoningMode(["highUncertainty"]);
      bandLabel = bandLabel === "—" ? "Niedrig" : bandLabel;
      dqBadge = dqBadge ?? "Eingeschränkte Modellgenauigkeit";
    }

    const recoveryForBalance = recoveryScore;
    let loadBalanceLabel = "Ausgewogen";
    if (recoveryForBalance === null) {
      loadBalanceLabel = `Belastung ${loadStressLabel(loadIdx)} — unsichere Kopplung an R̂`;
    } else if (loadIdx >= 3.5 && recoveryForBalance < 62) loadBalanceLabel = "Hohe Last, Recovery eher begrenzt";
    else if (loadIdx >= 3.5 && recoveryForBalance >= 72) loadBalanceLabel = "Hohe Last, Recovery tragfähig";
    else if (loadIdx < 2 && recoveryForBalance >= 78) loadBalanceLabel = "Leichte Woche, gute Reserve";

    let sleepQualityLabel = "Im Normbereich";
    if (!hasHealth) {
      sleepQualityLabel = "Schlafsignal nicht angebunden — hohe Unsicherheit im physiologischen Zustand";
    } else if (sleepScoreAvg !== null) {
      if (sleepScoreAvg >= 82) sleepQualityLabel = "Sehr solide Schlafqualität";
      else if (sleepScoreAvg >= 68) sleepQualityLabel = "Stabile Schlafqualität";
      else sleepQualityLabel = "Schlaf könnte robuster sein";
    } else {
      sleepQualityLabel = "Schlaf nur teilweise messbar — erhöhte Unsicherheit";
    }

    let stabilityLabel = "Trend: unsicher (kurze Serie)";
    if (trend7.length >= 3) {
      const mu = mean(trend7)!;
      const sd = Math.sqrt(mean(trend7.map((x) => (x - mu) ** 2))!);
      if (sd < 5.5) stabilityLabel = "Latentes R sehr stabil";
      else if (sd < 9) stabilityLabel = "Latentes R leicht schwankend";
      else stabilityLabel = "Latentes R wechselhaft";
    } else if (trend7.length === 1 && daySeries.length > 0) {
      const v = trend7[0]!;
      const wMean = mean(daySeries.map((x) => x.latentR))!;
      stabilityLabel = v >= wMean + 1 ? "Trend: Ende der Woche eher höher" : "Trend: Ende der Woche eher gedämpft";
    }

    const trend7Out = trend7.length ? trend7.slice(-7) : recoveryScore !== null ? [recoveryScore, recoveryScore] : [50, 50];
    const latentTrendBandHalfWidth = latentBandHalfWidthFromTrend(trend7Out);

    return {
      label,
      weekIndex,
      recoveryScore,
      latentTrendBandHalfWidth,
      sleepScoreAvg,
      hrvTrend,
      loadMarker,
      trend7: trend7Out,
      sub: {
        sleepQualityLabel,
        stabilityLabel,
        loadBalanceLabel,
      },
      hasHealthData: hasHealth,
      scoreConfidence,
      recoveryConfidence,
      confidenceBandLabel: bandLabel,
      dataQualityBadge: dqBadge,
      semanticUncertaintyState,
      certaintyLabel,
      aiReasoningMode,
    };
  });
}
