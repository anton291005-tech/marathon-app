/**
 * Daily decision engine — coach-like training recommendation for today.
 * Pure function: takes pre-computed signals, returns status + text.
 * No plan/logs access directly; App.tsx computes the signals first.
 */

export type DecisionStatus = "green" | "yellow" | "red";

export type DailyDecision = {
  status: DecisionStatus;
  /** 2–4 word label for compact Home display */
  shortRecommendation: string;
  /** Keep for compatibility in potential detail views */
  recommendation: string;
  /** Max 2 short reason strings for compact UI */
  reasons: string[];
  /** Optional one-liner practical adjustment */
  adjustment?: string;
  /** True when there is not enough logged data yet */
  earlyStage: boolean;
};

export type DailyDecisionInput = {
  /** From getRecoveryState().label — "🔴 Fatigue" | "🟡 Normal" | "🟢 Fresh" */
  recoveryLabel: string;
  /** From getWeeklyFatigue().label — "hoch" | "mittel" | "niedrig" */
  weeklyFatigueLabel: string;
  /** How many of the last 5 done sessions were hard (interval/tempo/race) */
  recentHardCount: number;
  /** Average feeling score (1–5) among last 5 done sessions; 0 = none logged */
  avgRecentFeeling: number;
  /** Sessions that were due in the last 7 days but are neither done nor skipped */
  missedRecentCount: number;
  /** Total done sessions across the whole plan */
  doneSessions: number;
  /** Consecutive session streak from getConsistencyStats */
  sessionStreak: number;
  /** Type of today's (or next upcoming) session — null if none */
  todaySessionType: string | null;
  /** True if today's session is specifically "today" (vs just "next") */
  isToday: boolean;
  /** Current plan phase key, e.g. "build", "peak", "taper" */
  phase?: string | null;
  /** Days until next key session (interval/tempo/race/long>=24), null if none */
  daysToNextKeySession?: number | null;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isHardType(type: string | null): boolean {
  return type === "interval" || type === "tempo" || type === "race";
}
function isKeyType(type: string | null): boolean {
  return isHardType(type) || type === "long";
}

function isFatigue(label: string): boolean {
  return label.includes("Fatigue");
}
function isFresh(label: string): boolean {
  return label.includes("Fresh");
}

function clampReasons(reasons: string[]): string[] {
  const unique = Array.from(new Set(reasons.map((r) => r.trim()).filter(Boolean)));
  return unique.slice(0, 2);
}

// ─── Main function ────────────────────────────────────────────────────────────

export function getDailyDecision(input: DailyDecisionInput): DailyDecision {
  const {
    recoveryLabel,
    weeklyFatigueLabel,
    recentHardCount,
    avgRecentFeeling,
    missedRecentCount,
    doneSessions,
    sessionStreak,
    todaySessionType,
    isToday,
    phase,
    daysToNextKeySession,
  } = input;

  // Early stage: calm default until enough personal signal exists.
  if (doneSessions < 4) {
    return {
      status: "green",
      shortRecommendation: "Wie geplant",
      recommendation: "Heute wie geplant.",
      reasons: ["Noch wenig Daten", "Plan aktuell ruhig"],
      earlyStage: true,
    };
  }

  // Signal aggregation: stable and easy to extend with future health/AI inputs.
  let loadScore = 0;
  const reasons: string[] = [];

  if (isFatigue(recoveryLabel)) {
    loadScore += 3;
    reasons.push("Recovery niedrig");
  } else if (!isFresh(recoveryLabel)) {
    loadScore += 1;
    reasons.push("Recovery normal");
  } else {
    loadScore -= 0.5;
    reasons.push("Recovery stabil");
  }

  if (weeklyFatigueLabel === "hoch") {
    loadScore += 2;
    reasons.push("Zuletzt hohe Last");
  } else if (weeklyFatigueLabel === "mittel") {
    loadScore += 1;
    reasons.push("Last moderat");
  } else {
    loadScore -= 0.3;
    reasons.push("Plan aktuell ruhig");
  }

  if (recentHardCount >= 3) {
    loadScore += 2;
    reasons.push("Mehrere harte Reize");
  } else if (recentHardCount === 2) {
    loadScore += 1.2;
    reasons.push("Gestern harter Reiz");
  }

  if (avgRecentFeeling > 0 && avgRecentFeeling < 2.7) {
    loadScore += 1.8;
    reasons.push("Subjektiv müde");
  } else if (avgRecentFeeling >= 4.2) {
    loadScore -= 0.6;
  }

  if (missedRecentCount >= 3) {
    loadScore += 1.2;
    reasons.push("Mehrere Einheiten offen");
  } else if (missedRecentCount === 2) {
    loadScore += 0.8;
    reasons.push("Rhythmus unterbrochen");
  }

  if (sessionStreak >= 6) {
    loadScore -= 0.4;
  }

  // Small caution bump when a key session is very close.
  if (daysToNextKeySession !== null && daysToNextKeySession !== undefined && daysToNextKeySession <= 2 && isKeyType(todaySessionType)) {
    loadScore += 0.6;
  }
  if (phase === "peak" && isHardType(todaySessionType)) {
    loadScore += 0.5;
  }

  const compactReasons = clampReasons(reasons);

  if (loadScore <= 1.1) {
    return {
      status: "green",
      shortRecommendation: "Wie geplant",
      recommendation: isToday ? "Heute wie geplant." : "Als Nächstes wie geplant.",
      reasons: compactReasons,
      earlyStage: false,
    };
  }

  if (loadScore <= 2.9) {
    const isHardToday = isHardType(todaySessionType);
    return {
      status: "yellow",
      shortRecommendation: isHardToday ? "Heute locker" : "Kürzer laufen",
      recommendation: isHardToday ? "Heute locker." : "Heute kürzer laufen.",
      reasons: compactReasons,
      adjustment: isHardToday ? "Tempo weglassen" : "Heute 20 % kürzer",
      earlyStage: false,
    };
  }

  return {
    status: "red",
    shortRecommendation: "Pause / sehr locker",
    recommendation: "Heute Pause oder sehr locker.",
    reasons: compactReasons,
    adjustment: todaySessionType === "rest" ? "Ruhetag nutzen" : "Nur locker laufen",
    earlyStage: false,
  };
}
