import { getCoachMemory } from "./memory/coachMemory";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Thin deterministic context for the experimental agent tool layer (not `AiContext`).
 * Side effect: reads coach memory once (unchanged from prior behavior).
 */
export function buildCoachContext(state: unknown) {
  const s = isRecord(state) ? state : {};
  const weeklyKm = typeof s.weeklyKm === "number" ? s.weeklyKm : 40;
  const level = s.level ?? "intermediate";

  const planSlice = s.plan;
  const upcoming = Array.isArray(planSlice) ? planSlice.slice(0, 5) : [];

  const workoutsRaw = s.workouts;
  const recentWorkouts = Array.isArray(workoutsRaw) ? workoutsRaw.slice(-5) : [];

  const recoveryScore = typeof s.recoveryScore === "number" ? s.recoveryScore : null;
  const recoveryTrend = s.recoveryTrend ?? null;
  const recoveryConfidence = typeof s.recoveryConfidence === "number" ? s.recoveryConfidence : 0;
  const loadScore = typeof s.loadScore === "number" ? s.loadScore : null;

  return {
    user: {
      goal: s.goal ?? null,
      level,
    },

    plan: {
      upcoming,
    },

    recovery: {
      score: recoveryScore,
      trend: recoveryTrend,
      confidence: recoveryConfidence,
    },

    recentWorkouts,

    assumptions: {
      weeklyKm,
      level,
    },

    flags: {
      lowRecovery: typeof recoveryScore === "number" ? recoveryScore < 40 : false,
      highLoad: typeof loadScore === "number" ? loadScore > 80 : false,
    },

    memory: getCoachMemory(),
  };
}
