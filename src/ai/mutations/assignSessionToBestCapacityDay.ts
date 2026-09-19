import type { AiPlanWeek, AiPlanSession, PlanPatch } from "../../lib/ai/types";
import { deepClone } from "../../core/deepClone";
import { applyPlanPatches } from "../../lib/ai/actions";
import { validatePlanIntegrity } from "../validation/validatePlanIntegrity";
import { validateMicroStructure } from "../validation/validateMicroStructure";
import type { ValidationContext } from "../validation/validationContext";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { swapWorkouts } from "./swapWorkouts";
import { NO_LOCKED_SESSION_IDS } from "./lockedSessions";
import { computeSessionDayFitScore, type DayCapacityScore } from "../../scheduling/capacityScore";

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
  reason?: "no-candidates" | "no-valid-candidates" | "integrity-violation" | "no-good-fit-candidate" | "locked-session";
};

export const NEUTRAL_VALIDATION_CONTEXT: ValidationContext = {
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

/**
 * Below this combined fit score, even the best candidate is rejected outright (no swap proposed)
 * rather than surfaced with a warning — unlike micro-structure conflicts, a bad calendar/intensity
 * fit (e.g. a tempo run forced onto a fully-booked day) is not something the athlete should have to
 * override, since a genuinely better slot may simply not exist among the current candidates.
 */
export const MIN_FIT_SCORE_THRESHOLD = 0.35;

/**
 * Kalenderkonflikt einer Session auf ihrem aktuellen Tag: Fit-Score unter `MIN_FIT_SCORE_THRESHOLD`.
 * Gemeinsames Kriterium von Wochen-Scan und Einzel-📅-Handler.
 */
export function isSessionInCalendarConflict(session: Pick<AiPlanSession, "type">, dayCapacity: DayCapacityScore): boolean {
  return computeSessionDayFitScore(session, dayCapacity) < MIN_FIT_SCORE_THRESHOLD;
}

export function findSessionById(plan: AiPlanWeek[], id: string): AiPlanSession | null {
  for (const week of plan) {
    for (const session of week.s ?? []) {
      if (session.id === id) return session;
    }
  }
  return null;
}

export function diffToPatches(before: AiPlanWeek[], after: AiPlanWeek[], ids: string[]): PlanPatch[] {
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
 * hard days back-to-back if a conflict-free candidate exists, (2) higher combined fit score
 * (`computeSessionDayFitScore`, the min of both swap sides — see below), (3) earliest date as a
 * deterministic tie-break. If every remaining candidate causes a micro-structure conflict, the
 * least-bad one is chosen and its warning is attached to the result instead of being silently
 * dropped — mirrors the "swaps are proposal-only, never silently auto-applied" pattern used by
 * `validateSwap`/`buildSwapAthleteFacingWarnings` elsewhere in this codebase.
 *
 * A swap moves two sessions: `sessionId` onto the candidate's day, and the session that previously
 * lived there (`candidate.targetSessionId`) onto `sessionId`'s old day. Both landings are scored
 * with `computeSessionDayFitScore` and combined via `Math.min` — a good placement for the clicked
 * session must never mask a bad one for the displaced session (e.g. shoving a tempo run onto a
 * fully-booked day just because the easy run that got clicked found a nicely free slot). Unlike
 * micro-structure conflicts, a combined fit below `MIN_FIT_SCORE_THRESHOLD` is a hard reject — no
 * swap is proposed — since there is no "the athlete can still choose to override" case here: a
 * better slot either exists among the candidates or it doesn't. `sourceDayCapacity` (the capacity of
 * `sessionId`'s current day) is optional; when omitted, the displaced session's landing is treated as
 * neutral (fit 1), i.e. only the clicked session's placement is scored, same as before this fix.
 *
 * The result is produced via `applyPlanPatches` (not direct mutation) and gated by
 * `validatePlanIntegrity`, per the Phase-2-Roadmap acceptance criterion for Schritt 3.
 *
 * Guard (same as `assignSessionToChosenDay`): a locked moved session (done / skipped / past, see
 * `buildLockedSessionIds`) or a locked winning target yields `reason: "locked-session"` without patches,
 * even when the caller passed unfiltered candidates. Callers are still expected to filter candidates
 * (`buildCalendarReassignmentCandidates`), since the guard rejects rather than skips a locked winner.
 */
type ScoredCandidate = {
  candidate: SessionAssignmentCandidate;
  after: AiPlanWeek[];
  severity: number;
  reason: string | null;
  combinedFit: number;
};

/** Scores one candidate day; `null` when it's the moved session's own day or its target can't be found. */
function scoreCandidate(
  before: AiPlanWeek[],
  sessionId: string,
  movedSession: AiPlanSession,
  candidate: SessionAssignmentCandidate,
  sourceDayCapacity: DayCapacityScore | null,
  context: ValidationContext,
): ScoredCandidate | null {
  if (candidate.targetSessionId === sessionId) return null;
  const displacedSession = findSessionById(before, candidate.targetSessionId);
  if (!displacedSession) return null;

  const simulated = swapWorkouts(before, sessionId, candidate.targetSessionId);
  const afterV2 = normalizeTrainingPlan(simulated);
  const microResult = validateMicroStructure(afterV2, context);
  const microAxis = microResult.axes.micro;

  // Both sides of the swap must be scored: the moved session on its new (candidate) day, AND the
  // displaced session that gets pushed onto the moved session's old day — otherwise a great capacity
  // fit for the clicked session can silently shove a high-intensity session onto an overloaded day.
  const movedFit = computeSessionDayFitScore(movedSession, candidate.capacity);
  const displacedFit = sourceDayCapacity ? computeSessionDayFitScore(displacedSession, sourceDayCapacity) : 1;

  return {
    candidate,
    after: simulated,
    severity: microAxis?.score ?? 0,
    reason: microAxis?.reason ?? null,
    combinedFit: Math.min(movedFit, displacedFit),
  };
}

/** Shared by the auto-pick (`assignSessionToBestCapacityDay`) and the full ranked list (`rankCalendarReassignmentCandidates`) — same order, so "the winner" is always ranked[0]. */
function scoreAndRankCandidates(
  before: AiPlanWeek[],
  sessionId: string,
  movedSession: AiPlanSession,
  candidates: SessionAssignmentCandidate[],
  sourceDayCapacity: DayCapacityScore | null,
  context: ValidationContext,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const result = scoreCandidate(before, sessionId, movedSession, candidate, sourceDayCapacity, context);
    if (result) scored.push(result);
  }
  scored.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity - b.severity;
    if (a.combinedFit !== b.combinedFit) return b.combinedFit - a.combinedFit;
    return a.candidate.capacity.dateIso.localeCompare(b.candidate.capacity.dateIso);
  });
  return scored;
}

export function assignSessionToBestCapacityDay(
  plan: AiPlanWeek[],
  sessionId: string,
  candidates: SessionAssignmentCandidate[],
  sourceDayCapacity: DayCapacityScore | null = null,
  phase?: ValidationContext["phase"],
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
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

  const movedSession = findSessionById(before, sessionId);
  if (!sessionId || !movedSession || candidates.length === 0) {
    return { ...emptyResult, reason: "no-candidates" };
  }
  if (lockedSessionIds.has(sessionId)) {
    return { ...emptyResult, reason: "locked-session" };
  }

  const context: ValidationContext = phase ? { ...NEUTRAL_VALIDATION_CONTEXT, phase } : NEUTRAL_VALIDATION_CONTEXT;
  const scored = scoreAndRankCandidates(before, sessionId, movedSession, candidates, sourceDayCapacity, context);

  if (scored.length === 0) {
    return { ...emptyResult, reason: "no-valid-candidates" };
  }

  const winner = scored[0];
  if (lockedSessionIds.has(winner.candidate.targetSessionId)) {
    return { ...emptyResult, reason: "locked-session" };
  }
  if (winner.combinedFit < MIN_FIT_SCORE_THRESHOLD) {
    return { ...emptyResult, reason: "no-good-fit-candidate" };
  }

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

export type RankedCalendarCandidate = {
  targetSessionId: string;
  dateIso: string;
  combinedFit: number;
  microStructureSeverity: number;
  microStructureReason: string | null;
  /** Would be rejected (low fit) or warned (micro-structure) by the auto-pick engine — surfaced so the
   * athlete can see it's a worse choice, not hidden, since they may still deliberately pick it. */
  isConflict: boolean;
};

/**
 * Same scoring/ranking as `assignSessionToBestCapacityDay`'s internal winner-pick, but returns every
 * valid candidate (best first) instead of discarding all but the winner — feeds the manual "Bearbeiten"
 * day-picker in the calendar panel so the athlete can choose a different day than the auto-pick.
 */
export function rankCalendarReassignmentCandidates(
  plan: AiPlanWeek[],
  sessionId: string,
  candidates: SessionAssignmentCandidate[],
  sourceDayCapacity: DayCapacityScore | null = null,
  phase?: ValidationContext["phase"],
): RankedCalendarCandidate[] {
  const before: AiPlanWeek[] = deepClone(plan);
  const movedSession = findSessionById(before, sessionId);
  if (!sessionId || !movedSession || candidates.length === 0) return [];

  const context: ValidationContext = phase ? { ...NEUTRAL_VALIDATION_CONTEXT, phase } : NEUTRAL_VALIDATION_CONTEXT;
  const scored = scoreAndRankCandidates(before, sessionId, movedSession, candidates, sourceDayCapacity, context);

  return scored.map((s) => ({
    targetSessionId: s.candidate.targetSessionId,
    dateIso: s.candidate.capacity.dateIso,
    combinedFit: s.combinedFit,
    microStructureSeverity: s.severity,
    microStructureReason: s.reason,
    isConflict: s.combinedFit < MIN_FIT_SCORE_THRESHOLD || s.severity >= MICRO_STRUCTURE_WARN_THRESHOLD,
  }));
}

/**
 * Applies an athlete-chosen target day instead of the engine's auto-pick (used when "Bearbeiten" ->
 * a candidate from `rankCalendarReassignmentCandidates` is selected). Unlike the auto-pick, a poor
 * `combinedFit` never hard-rejects here — the athlete already saw the candidate flagged via
 * `isConflict` and chose it anyway. `validatePlanIntegrity` still gates the result since that's a
 * structural invariant, not a quality judgment call the athlete can override.
 *
 * Guard: a swap touching a locked session (done / skipped / past, see `buildLockedSessionIds`) is
 * rejected with `reason: "locked-session"` — `swapWorkouts` itself checks nothing, so this is the safety net.
 */
export function assignSessionToChosenDay(
  plan: AiPlanWeek[],
  sessionId: string,
  targetSessionId: string,
  phase?: ValidationContext["phase"],
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
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

  const movedSession = findSessionById(before, sessionId);
  const displacedSession = findSessionById(before, targetSessionId);
  if (!sessionId || !movedSession || !targetSessionId || !displacedSession) {
    return { ...emptyResult, reason: "no-candidates" };
  }
  if (lockedSessionIds.has(sessionId) || lockedSessionIds.has(targetSessionId)) {
    return { ...emptyResult, reason: "locked-session" };
  }

  const context: ValidationContext = phase ? { ...NEUTRAL_VALIDATION_CONTEXT, phase } : NEUTRAL_VALIDATION_CONTEXT;
  const simulated = swapWorkouts(before, sessionId, targetSessionId);
  const afterV2 = normalizeTrainingPlan(simulated);
  const microResult = validateMicroStructure(afterV2, context);
  const microAxis = microResult.axes.micro;
  const severity = microAxis?.score ?? 0;

  const patches = diffToPatches(before, simulated, [sessionId, targetSessionId]);
  const patched = applyPlanPatches(before, patches);

  if (!validatePlanIntegrity(patched)) {
    return { ...emptyResult, reason: "integrity-violation" };
  }

  return {
    ok: true,
    plan: patched,
    patches,
    chosenTargetSessionId: targetSessionId,
    microStructureSeverity: severity,
    warning: severity >= MICRO_STRUCTURE_WARN_THRESHOLD ? microAxis?.reason ?? null : null,
  };
}
