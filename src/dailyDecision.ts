/**
 * Daily decision engine — coach-like training recommendation for today.
 * Pure function: takes pre-computed signals, returns status + text.
 * No plan/logs access directly; App.tsx computes the signals first.
 */

export type DecisionStatus = "green" | "yellow" | "red";

export type DailyDecision = {
  status: DecisionStatus;
  /** Short main recommendation sentence */
  recommendation: string;
  /** 1–3 brief reason strings shown below */
  reasons: string[];
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
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isHardType(type: string | null): boolean {
  return type === "interval" || type === "tempo" || type === "race";
}

function isFatigue(label: string): boolean {
  return label.includes("Fatigue");
}
function isFresh(label: string): boolean {
  return label.includes("Fresh");
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
  } = input;

  // Early-stage: too little data to make a meaningful assessment.
  // Give a calm, encouraging nudge without a coloured verdict.
  if (doneSessions < 4) {
    return {
      status: "green",
      recommendation: "Training startet gerade — heute einfach sauber nach Plan laufen.",
      reasons: ["Noch wenig Logs vorhanden. Sammle erste Einheiten für genauere Einschätzungen."],
      earlyStage: true,
    };
  }

  // ─── Score-based decision ──────────────────────────────────────────────────
  // Each risk factor adds points; high total → more conservative recommendation.

  let riskScore = 0;
  const reasons: string[] = [];

  // Recovery signal (strongest single signal)
  if (isFatigue(recoveryLabel)) {
    riskScore += 3;
    reasons.push("Recovery zeigt erhöhte Belastung in den letzten Einheiten.");
  } else if (!isFresh(recoveryLabel)) {
    // "Normal"
    riskScore += 1;
    reasons.push("Recovery ist normal — kein freies Fenster, aber kein Alarm.");
  } else {
    reasons.push("Recovery aktuell stabil.");
  }

  // Weekly load
  if (weeklyFatigueLabel === "hoch") {
    riskScore += 2;
    reasons.push("Die Wochenlast ist hoch.");
  } else if (weeklyFatigueLabel === "mittel") {
    riskScore += 1;
    reasons.push("Wochenlast moderat — Rhythmus halten.");
  }

  // Recent hard sessions cluster (in last ~5 done)
  if (recentHardCount >= 3) {
    riskScore += 2;
    reasons.push("Mehrere Quality-Reize in kurzer Folge.");
  } else if (recentHardCount === 2) {
    riskScore += 1;
    reasons.push("Zwei harte Einheiten zuletzt — etwas Frische schonen.");
  }

  // Feeling signal (only when clearly low)
  if (avgRecentFeeling > 0 && avgRecentFeeling < 2.5) {
    riskScore += 2;
    reasons.push("Zuletzt eher niedriges Belastungsgefühl eingetragen.");
  } else if (avgRecentFeeling >= 4.2 && isFresh(recoveryLabel)) {
    riskScore -= 1; // feeling good + fresh → small bonus
    reasons.push("Gefühlsmäßig gut drauf zuletzt.");
  }

  // Missed sessions: not a reason to push harder today
  if (missedRecentCount >= 3) {
    riskScore += 1;
    reasons.push("Einige Einheiten zuletzt ausgelassen — lieber stabil bleiben statt aufholen.");
  }

  // Streak bonus: consistent block = slight green nudge
  if (sessionStreak >= 5 && riskScore <= 1) {
    reasons.push(`${sessionStreak} Einheiten in Folge erledigt — guter Rhythmus.`);
  }

  // Cap reasons at 3
  const trimmedReasons = reasons.slice(0, 3);

  // ─── Derive status + recommendation ───────────────────────────────────────

  // today vs. "next upcoming" slightly adjusts phrasing
  const sessionLabel = isToday ? "heute" : "als Nächstes";

  if (riskScore <= 1) {
    // Green: go as planned
    const rec = isHardType(todaySessionType)
      ? `Wie geplant trainieren — gutes Fenster für ${sessionLabel}.`
      : `Wie geplant trainieren — Bedingungen passen.`;
    return { status: "green", recommendation: rec, reasons: trimmedReasons, earlyStage: false };
  }

  if (riskScore <= 3) {
    // Yellow: run, but softer
    const rec = isHardType(todaySessionType)
      ? `Locker angehen — Intensität ${sessionLabel} moderat halten.`
      : `Wie geplant, aber auf die eigenen Signale hören.`;
    return { status: "yellow", recommendation: rec, reasons: trimmedReasons, earlyStage: false };
  }

  // Red: clearly reduce or rest
  if (todaySessionType === "rest" || todaySessionType === "bike") {
    return {
      status: "red",
      recommendation: "Heute wirklich erholen — der Ruhetag kommt gerade richtig.",
      reasons: trimmedReasons,
      earlyStage: false,
    };
  }
  return {
    status: "red",
    recommendation: "Intensität heute deutlich reduzieren oder eine leichte Einheit wählen.",
    reasons: trimmedReasons,
    earlyStage: false,
  };
}
