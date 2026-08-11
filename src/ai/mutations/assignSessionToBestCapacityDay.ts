import type { AiPlanWeek, AiPlanSession, PlanPatch } from "../../lib/ai/types";
import { deepClone } from "../../core/deepClone";
import { applyPlanPatches } from "../../lib/ai/actions";
import { validatePlanIntegrity } from "../validation/validatePlanIntegrity";
import { validateMicroStructure } from "../validation/validateMicroStructure";
import type { ValidationContext } from "../validation/validationContext";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { swapWorkouts } from "./swapWorkouts";
import type { DayCapacityScore } from "../../scheduling/capacityScore";

/**
 * A candidate day to move `sessionId` into, identified by the session currently
 * occupying that day (swap semantics, same as the existing 2-day swap tool —
 * every calendar day has exactly one session entry, rest days included).
 */
export type SessionAssignmentCandidate = {
  targetSessionId: string;
  capacity: DayCapacityScore;
};

export type SessionAssignmentResult = {
  ok: boolean;
  plan: AiPlanWeek[];
  patches: PlanPatch[];
  chosenTargetSessionId: string | null;
  microStructureSeverity: number;
  warning: string | null;
  reason?: "no-candidates" | "no-valid-candidates" | "integrity-violation";
};

const NEUTRAL_VALIDATION_CONTEXT: ValidationContext = {
  planGoal: "marathon",
  currentWeekLoad: 0,
  weeklyAvgLoad: 0,
  recoverySummary: {
    avgRecovery: 50,
    avgConfidence: 1,
    influenceWeight: 0.3,
    adjustedRecoveryInfluence: 15,
    recoveryStatus: "normal",
  },
  phase: "build",
};

/** Micro-structure warnings are surfaced at the same threshold used elsewhere in validation (score >= 60). */
const MICRO_STRUCTURE_WARN_THRESHOLD = 60;

function findSessionById(plan: AiPlanWeek[], id: string): AiPlanSession | null {
  for (const week of plan) {
    for (const session of week.s ?? []) {
      if (session.id === id) return session;
    }
  }
  return null;
}

function diffToPatches(before: AiPlanWeek[], after: AiPlanWeek[], ids: string[]): PlanPatch[] {
  const patches: PlanPatch[] = [];
  for (const id of ids) {
    const b = findSessionById(before, id);
    const a = findSessionById(after, id);
    if (!b || !a) continue;
    if (b.day === a.day && b.date === a.date) continue;
    patches.push({ sessionId: id, changes: { day: a.day, date: a.date } });
  }
  return patches;
}

/**
 * Extends the 2-day swap (`swapWorkouts`/`safeSwapWorkouts`) to N candidate days: picks the day
 * that best respects both calendar capacity (Schritt 2) and physiological micro-structure
 * (Erholungsabstände, `validateMicroStructure`) rather than a single fixed target day.
 *
 * Ranking per candidate: (1) lower micro-structure severity first — never knowingly place two
 * hard days back-to-back if a conflict-free candidate exists, (2) higher capacityScore,
 * (3) earliest date as a deterministic tie-break. If every candidate causes a conflict, the
 * least-bad one is chosen and its warning is attached to the result instead of being silently
 * dropped — mirrors the "swaps are proposal-only, never silently auto-applied" pattern used by
 * `validateSwap`/`buildSwapAthleteFacingWarnings` elsewhere in this codebase.
 *
 * The result is produced via `applyPlanPatches` (not direct mutation) and gated by
 * `validatePlanIntegrity`, per the Phase-2-Roadmap acceptance criterion for Schritt 3.
 */
export function assignSessionToBestCapacityDay(
  plan: AiPlanWeek[],
  sessionId: string,
  candidates: SessionAssignmentCandidate[],
  phase?: ValidationContext["phase"],
): SessionAssignmentResult {
  const before: AiPlanWeek[] = deepClone(plan);
  const emptyResult: Omit<SessionAssignmentResult, "reason"> = {
    ok: false,
    plan: before,
    patches: [],
    chosenTargetSessionId: null,
    microStructureSeverity: 0,
    warning: null,
  };

  if (!sessionId || !findSessionById(before, sessionId) || candidates.length === 0) {
    return { ...emptyResult, reason: "no-candidates" };
  }

  const context: ValidationContext = phase ? { ...NEUTRAL_VALIDATION_CONTEXT, phase } : NEUTRAL_VALIDATION_CONTEXT;

  type ScoredCandidate = {
    candidate: SessionAssignmentCandidate;
    after: AiPlanWeek[];
    severity: number;
    reason: string | null;
  };
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.targetSessionId === sessionId) continue;
    if (!findSessionById(before, candidate.targetSessionId)) continue;

    const simulated = swapWorkouts(before, sessionId, candidate.targetSessionId);
    const afterV2 = normalizeTrainingPlan(simulated);
    const microResult = validateMicroStructure(afterV2, context);
    const microAxis = microResult.axes.micro;

    scored.push({
      candidate,
      after: simulated,
      severity: microAxis?.score ?? 0,
      reason: microAxis?.reason ?? null,
    });
  }

  if (scored.length === 0) {
    return { ...emptyResult, reason: "no-valid-candidates" };
  }

  scored.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity - b.severity;
    if (a.candidate.capacity.capacityScore !== b.candidate.capacity.capacityScore) {
      return b.candidate.capacity.capacityScore - a.candidate.capacity.capacityScore;
    }
    return a.candidate.capacity.dateIso.localeCompare(b.candidate.capacity.dateIso);
  });

  const winner = scored[0];
  const patches = diffToPatches(before, winner.after, [sessionId, winner.candidate.targetSessionId]);
  const patched = applyPlanPatches(before, patches);

  if (!validatePlanIntegrity(patched)) {
    return { ...emptyResult, reason: "integrity-violation" };
  }

  return {
    ok: true,
    plan: patched,
    patches,
    chosenTargetSessionId: winner.candidate.targetSessionId,
    microStructureSeverity: winner.severity,
    warning: winner.severity >= MICRO_STRUCTURE_WARN_THRESHOLD ? winner.reason : null,
  };
}
