/**
 * Presentation layer: all recovery colors, German labels, and Verlauf view-models
 * derived deterministically from RecoveryDomainState. UI components must not map raw scores.
 */

import type { RecoveryDomainState } from "./recoveryDomainState";
import type { DailyRecoveryComputed } from "./recoveryTypes";

function recoveryStatusLabel(score: number | null, isInitial: boolean): string {
  if (isInitial) return "Wird ermittelt";
  if (score === null) return "Zu wenig Daten";
  if (score >= 80) return "Sehr gut erholt";
  if (score >= 65) return "Stabil";
  if (score >= 50) return "Belastet";
  return "Ermüdet";
}

function recoveryStatusColorHex(score: number | null, isInitial: boolean): string {
  if (isInitial || score === null) return "#64748b";
  if (score >= 80) return "#34d399";
  if (score >= 65) return "#38bdf8";
  if (score >= 50) return "#fbbf24";
  return "#f87171";
}

function homeRecoveryInterpretationLineDe(score0_100: number | null, isInsufficient: boolean): string | null {
  if (isInsufficient || score0_100 === null) return null;
  if (score0_100 >= 80) return "Bereit für harte Einheit.";
  if (score0_100 >= 60) return "Gute Trainingsbasis.";
  if (score0_100 >= 40) return "Locker trainieren.";
  return "Erholung priorisieren.";
}

function homeRecoveryKpiColorHex(score0_100: number | null): string {
  if (score0_100 === null) return "#64748b";
  if (score0_100 >= 80) return "#34d399";
  if (score0_100 >= 60) return "#38bdf8";
  if (score0_100 >= 40) return "#fbbf24";
  return "#f87171";
}

function meanOf(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pillTrend(val: number | null, goodThreshold: number, badThreshold: number): "↑" | "↓" | "→" {
  if (val === null) return "→";
  if (val >= goodThreshold) return "↑";
  if (val <= badThreshold) return "↓";
  return "→";
}

function last7SeriesValues(series: DailyRecoveryComputed[]): number[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-7).map((s) => Math.round(s.smoothedLatentR));
}

export type RecoveryFactorPill = {
  id: string;
  label: string;
  trend: "↑" | "↓" | "→";
  context: string;
  available: boolean;
  trendColor: string;
};

export type RecoveryVerlaufFallback7d = {
  sleepAvg: string | number;
  sleepTrend: string;
} | null;

export type RecoveryVerlaufCardPresentation = {
  header: {
    score: number | null;
    statusLabel: string;
    statusColor: string;
    deltaLine: string | null;
  };
  factors: RecoveryFactorPill[];
  /** Smoothed latent R values for last ≤7 days (newest last). */
  trendValues: number[];
  insightText: string | null;
  insightShowWarning: boolean;
  /** 7-day fallback sleep line when live KPI uses fallback path. */
  fallback7d: RecoveryVerlaufFallback7d;
};

export type RecoveryPresentationState = {
  homeKpi: {
    score0_100: number | null;
    scoreDisplay: string;
    colorHex: string;
    interpretationLine: string | null;
    initialBootLine: string | null;
    trendVsYesterdayLine: string | null;
  };
  session: {
    label: string;
    toneHex: string;
  };
  verlauf: RecoveryVerlaufCardPresentation;
};

function buildFactorPills(domain: RecoveryDomainState): RecoveryFactorPill[] {
  const series = domain.series;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const pills: RecoveryFactorPill[] = [];

  // Sleep (7d avg score)
  const sleepScores = last7.map((s) => s.sub.sleep).filter((v): v is number => typeof v === "number");
  const avgSleep = meanOf(sleepScores);
  const sleepTrend = pillTrend(avgSleep, 72, 55);
  pills.push({
    id: "sleep",
    label: "Schlaf",
    trend: sleepTrend,
    context: avgSleep !== null ? `${Math.round(avgSleep)}/100 (7d)` : "Keine Daten",
    available: sleepScores.length >= 2,
    trendColor: sleepTrend === "↑" ? "#34d399" : sleepTrend === "↓" ? "#f87171" : "#94a3b8",
  });

  // HRV (7d avg score)
  const hrvScores = last7.map((s) => s.sub.hrv).filter((v): v is number => typeof v === "number");
  const avgHrv = meanOf(hrvScores);
  const hrvTrend = pillTrend(avgHrv, 72, 55);
  pills.push({
    id: "hrv",
    label: "HRV",
    trend: hrvTrend,
    context: avgHrv !== null ? `${Math.round(avgHrv)}/100 (7d)` : "Keine Daten",
    available: hrvScores.length >= 2,
    trendColor: hrvTrend === "↑" ? "#34d399" : hrvTrend === "↓" ? "#f87171" : "#94a3b8",
  });

  // Training load impact
  const loadNudge = domain.homeRecoveryBreakdown?.contributingFactors.loadNudge ?? null;
  const loadTrend: "↑" | "↓" | "→" =
    loadNudge === null ? "→" : loadNudge < -4 ? "↓" : loadNudge > -1 ? "↑" : "→";
  const loadContext =
    loadNudge === null
      ? "Unbekannt"
      : loadNudge < -4
        ? "hohe Akutlast"
        : loadNudge < -1
          ? "moderat"
          : "niedrig";
  pills.push({
    id: "load",
    label: "Belastung",
    trend: loadTrend,
    context: loadContext,
    available: domain.homeRecoveryBreakdown !== null,
    trendColor: loadTrend === "↑" ? "#34d399" : loadTrend === "↓" ? "#fbbf24" : "#94a3b8",
  });

  // 7-day recovery trend
  const trend7d = domain.latent.trend7d;
  const recovTrend: "↑" | "↓" | "→" =
    trend7d === "improving" ? "↑" : trend7d === "declining" ? "↓" : "→";
  pills.push({
    id: "trend",
    label: "Verlauf",
    trend: recovTrend,
    context:
      trend7d === "improving" ? "steigend (7d)" : trend7d === "declining" ? "fallend (7d)" : "stabil (7d)",
    available: series.length >= 3,
    trendColor: recovTrend === "↑" ? "#34d399" : recovTrend === "↓" ? "#f87171" : "#94a3b8",
  });

  return pills;
}

function buildVerlaufCardPresentation(
  domain: RecoveryDomainState,
  opts?: { trendVsYesterdayLine?: string | null },
): RecoveryVerlaufCardPresentation {
  const score = domain.homeRecoveryScore0_100;
  const isInitial = domain.domainKind === "initial";

  return {
    header: {
      score,
      statusLabel: recoveryStatusLabel(score, isInitial),
      statusColor: recoveryStatusColorHex(score, isInitial),
      deltaLine: isInitial ? null : (opts?.trendVsYesterdayLine ?? null),
    },
    factors: buildFactorPills(domain),
    trendValues: last7SeriesValues(domain.series),
    insightText: isInitial ? null : (domain.insight.text || null),
    insightShowWarning: domain.insight.showWarning,
    fallback7d: null,
  };
}

/**
 * Single mapper from domain → UI-ready recovery presentation (colors, strings, Verlauf view-model).
 */
export function getRecoveryPresentationState(
  domain: RecoveryDomainState,
  _selectedWeekIndex: number,
  opts?: {
    trendVsYesterdayLine?: string | null;
  },
): RecoveryPresentationState {
  const score = domain.homeRecoveryScore0_100;
  const interpretationLine = homeRecoveryInterpretationLineDe(score, domain.isInsufficient);
  const trendLine = domain.domainKind === "live" ? (opts?.trendVsYesterdayLine ?? null) : null;
  return {
    homeKpi: {
      score0_100: score,
      scoreDisplay: domain.isInsufficient || score === null ? "—" : String(score),
      colorHex: homeRecoveryKpiColorHex(score),
      interpretationLine,
      initialBootLine: null,
      trendVsYesterdayLine: trendLine,
    },
    session: {
      label: domain.sessionRecovery.label,
      toneHex: domain.sessionRecovery.tone,
    },
    verlauf: buildVerlaufCardPresentation(domain, opts),
  };
}
