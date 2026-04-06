/**
 * getDailyCoachDecision
 *
 * Converts the lightweight DailyDecisionInput (already computed in App.tsx) into
 * a richer, card-ready DailyCoachDecision.
 *
 * Design rules:
 * - Shares the exact same signal thresholds as getDailyDecision (dailyDecision.ts)
 *   so both indicators on the dashboard are always in sync.
 * - Prioritises hard no-go rules (injury/illness/fatigue+intervals) before softer signals.
 * - Returns a fully-structured object so the UI card is display-only.
 */

import type { DailyDecisionInput } from "../../dailyDecision";

export type DecisionLevel = "hard" | "easy" | "rest" | "alternative";

export type DailyCoachDecision = {
  /** Short chip title, e.g. "Heute: Intervalle" */
  title: string;
  /** One-sentence coaching reason */
  reason: string;
  /** Visual state for card accent colour */
  level: DecisionLevel;
  /** 2–4 concrete bullet lines */
  details: string[];
  /**
   * True when the decision is a deterministic safety rule (illness, injury,
   * or early-stage fallback).  The AI enhancement layer must not overwrite
   * these — they are always final.
   */
  isHardOverride?: boolean;
};

// ─── Extra inputs the richer card needs beyond the base DailyDecisionInput ────

export type DailyCoachDecisionInput = DailyDecisionInput & {
  /** True if user-typed message or symptom flags indicate illness */
  hasIllnessSignal?: boolean;
  /** True if user-typed message or symptom flags indicate injury */
  hasInjurySignal?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isHardType(type: string | null | undefined): boolean {
  return type === "interval" || type === "tempo" || type === "race";
}

function isFatigue(label: string): boolean {
  return label.includes("Fatigue");
}

function isFresh(label: string): boolean {
  return label.includes("Fresh");
}

function todayLabel(session: string | null | undefined): string {
  const labels: Record<string, string> = {
    interval: "Intervalle",
    tempo: "Tempo",
    race: "Wettkampf",
    long: "Langer Lauf",
    easy: "Locker laufen",
    rest: "Ruhetag",
    bike: "Rad/Cross",
    strength: "Kraft",
  };
  if (!session) return "Locker bleiben";
  return labels[session] ?? "Einheit";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function getDailyCoachDecision(
  input: DailyCoachDecisionInput,
): DailyCoachDecision {
  const {
    recoveryLabel,
    weeklyFatigueLabel,
    recentHardCount,
    avgRecentFeeling,
    doneSessions,
    todaySessionType,
    hasIllnessSignal = false,
    hasInjurySignal = false,
  } = input;

  // ── Scenario B: Illness ─────────────────── isHardOverride: AI must not touch
  if (hasIllnessSignal) {
    return {
      title: "Heute: Pause",
      reason: "Krankheitszeichen aktiv. Kein Training heute.",
      level: "rest",
      details: [
        "Kein Laufen und kein intensives Training.",
        "Nur Spaziergang oder Mobility wenn fieberfrei.",
        "Wiedereinstieg nach klarer Symptomverbesserung.",
      ],
      isHardOverride: true,
    };
  }

  // ── Scenario B: Injury ─────────────────── isHardOverride: AI must not touch
  if (hasInjurySignal) {
    return {
      title: "Heute: Alternative",
      reason: "Verletzungssignal erkannt. Laufbelastung reduzieren.",
      level: "alternative",
      details: [
        "Kein Laufen bei stechendem Schmerz.",
        "48–72h Belastung deutlich senken.",
        "Alternative: Schwimmen, Rad oder Mobility.",
        "Erst wieder einsteigen, wenn schmerzfrei.",
      ],
      isHardOverride: true,
    };
  }

  // ── Fallback: not enough data yet ─────────────────────────────────────────
  if (doneSessions < 4) {
    return {
      title: "Heute: Wie geplant",
      reason: "Noch zu wenig Daten für eine individuelle Einschätzung.",
      level: "easy",
      details: [
        "Trainiere wie geplant.",
        "Logge deine Einheiten damit der Coach lernt.",
        "Konservative Empfehlung als sicherer Start.",
      ],
      isHardOverride: true,
    };
  }

  const isTired = isFatigue(recoveryLabel);
  const isNormal = !isFresh(recoveryLabel) && !isTired;
  const highWeeklyLoad = weeklyFatigueLabel === "hoch";
  const moderateWeeklyLoad = weeklyFatigueLabel === "mittel";
  const feelsExhausted = avgRecentFeeling > 0 && avgRecentFeeling < 2.7;
  const hardSessionToday = isHardType(todaySessionType);

  // ── Scenario A: Fatigue + hard session planned ─────────────────────────────
  if ((isTired || feelsExhausted) && hardSessionToday) {
    return {
      title: "Heute: Locker laufen",
      reason: "Erholung ist zu niedrig für eine harte Einheit.",
      level: "easy",
      details: [
        `${todayLabel(todaySessionType)} heute auf locker umstellen.`,
        "6–8 km ruhig im Wohlfühltempo.",
        "Keine Tempoarbeit, kein Pulsauftrieb.",
        "Qualität am nächsten frischen Tag nachholen.",
      ],
    };
  }

  // Consecutive hard overload
  if (recentHardCount >= 3 && hardSessionToday) {
    return {
      title: "Heute: Locker laufen",
      reason: "Drei harte Einheiten in Folge — Entlastungsimpuls setzen.",
      level: "easy",
      details: [
        "Intensität heute bewusst herausnehmen.",
        "30–50 Min locker, Puls unter 75 % HFmax.",
        "optional 4 lockere Strides am Ende.",
        "Morgen oder übermorgen wieder Qualität möglich.",
      ],
    };
  }

  // High weekly load + moderate fatigue
  if ((isTired || highWeeklyLoad) && (isNormal || highWeeklyLoad)) {
    if (todaySessionType === "rest") {
      return {
        title: "Heute: Ruhetag",
        reason: "Hohe Wochenlast — Ruhetag aktiv nutzen.",
        level: "rest",
        details: [
          "Heute kein Laufen.",
          "Schlaf, Ernährung und Mobilisation priorisieren.",
          "Morgen frischer in die nächste Einheit.",
        ],
      };
    }
    return {
      title: "Heute: Locker laufen",
      reason: "Wochenlast ist hoch. Heute Erholung priorisieren.",
      level: "easy",
      details: [
        "Geplante Einheit locker halten.",
        highWeeklyLoad ? "Volumen heute 20 % kürzer." : "Tempo weglassen.",
        "Puls unter 75 % HFmax halten.",
      ],
    };
  }

  // Moderate fatigue + not a hard session → just do it easy
  if (moderateWeeklyLoad && !hardSessionToday) {
    return {
      title: `Heute: ${todayLabel(todaySessionType)}`,
      reason: "Solider Zustand — Einheit moderat wie geplant.",
      level: "easy",
      details: [
        "Wie geplant, aber auf Puls achten.",
        "Bei ungutem Gefühl: kürzen statt abbrechen.",
      ],
    };
  }

  // ── Scenario C: Good readiness + quality session ──────────────────────────
  if (isFresh(recoveryLabel) && !highWeeklyLoad && hardSessionToday) {
    return {
      title: `Heute: ${todayLabel(todaySessionType)}`,
      reason: "Erholung stabil. Qualität heute ist die richtige Entscheidung.",
      level: "hard",
      details: [
        "Volle Einheit wie geplant.",
        "Aufwärmen nicht überspringen.",
        "Nach der Einheit direkt Recovery-Routine einleiten.",
      ],
    };
  }

  // General green state
  if (isFresh(recoveryLabel) || (!isTired && !highWeeklyLoad)) {
    return {
      title: `Heute: ${todayLabel(todaySessionType)}`,
      reason: "Guter Zustand — Training wie geplant.",
      level: todaySessionType === "rest" ? "rest" : "easy",
      details: [
        "Einheit wie geplant absolvieren.",
        "Auf Körpersignale achten und bei Bedarf kürzen.",
      ],
    };
  }

  // ── Scenario D: Conservative fallback ─────────────────────────────────────
  return {
    title: "Heute: Locker bleiben",
    reason: "Nicht genug Daten für eine harte Freigabe. Konservative Empfehlung.",
    level: "easy",
    details: [
      "Locker laufen oder aktive Erholung.",
      "Keine Intervalle oder Tempoarbeit.",
      "Einheiten loggen damit der Coach lernt.",
    ],
  };
}
