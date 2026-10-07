import type { AiPlanWeek, AiPlanSession, PlanPatch } from "../../lib/ai/types";
import { deepClone } from "../../core/deepClone";
import { applyPlanPatches } from "../../lib/ai/actions";
import { validatePlanIntegrity } from "../validation/validatePlanIntegrity";
import {
  collectMicroFindings,
  diffMicroFindings,
  type MicroDelta,
  type MicroExternalLoadLookup,
  type MicroFinding,
  type MicroTier,
  type MicroValidationOptions,
} from "../validation/validateMicroStructure";
import type { TrainingPhase } from "../../planV2/trainingPhase";
import type { ValidationContext } from "../validation/validationContext";
import { buildPhaseLookup } from "./planPhaseLookup";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { swapWorkouts } from "./swapWorkouts";
import { NO_LOCKED_SESSION_IDS } from "./lockedSessions";
import { computeSessionDayFitScore, isPhysicalLoadConflict, type DayCapacityScore } from "../../scheduling/capacityScore";

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
  /** Höchster Schweregrad der durch den Tausch NEU entstehenden Befunde (vorbestehende zählen nicht), 0 ohne. */
  microStructureDeltaSeverity: number;
  /** Stufe des Delta-Schweregrads: 0 unbedenklich, 1 Hinweis (40–74), 2 Warnung (75–94), 3 nie Auto-Vorschlag (ab 95). */
  microStructureTier: MicroTier;
  /** ⚠️-Warnung (neue Befunde ab 75), sonst `null`. */
  warning: string | null;
  /** Neutraler Hinweis (neue Befunde 40–74), sonst `null`. */
  hint: string | null;
  reason?:
    | "no-candidates"
    | "no-valid-candidates"
    | "integrity-violation"
    | "no-good-fit-candidate"
    | "no-safe-candidate"
    | "locked-session";
};

/**
 * Rückfall-Kontext des Validators. Die Phase kommt je Tag aus dem Plan (`buildPhaseLookup`); `phase` hier
 * gilt nur für Tage ohne Wochenzeile. Recovery ist neutral (die Micro-Regeln lesen sie nicht).
 */
export const FALLBACK_VALIDATION_CONTEXT: ValidationContext = {
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

/**
 * Klartext-Grund eines Kalenderkonflikts für den Tausch-Vorschlag: bei einem Belastungstag die
 * Termin-Titel ("wegen Fußballturnier"), sonst generisch "wegen Kalendertermin" — auch wenn Titel
 * fehlen oder leer sind.
 */
export function describeCalendarConflictCause(session: Pick<AiPlanSession, "type">, dayCapacity: DayCapacityScore): string {
  if (isPhysicalLoadConflict(session, dayCapacity)) {
    const titles = dayCapacity.physicalLoadBlockTitles.map((t) => (t ?? "").trim()).filter(Boolean);
    if (titles.length > 0) return `wegen ${titles.join(", ")}`;
  }
  return "wegen Kalendertermin";
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
    if (b.day === a.day && b.date === a.date && b.dateIso === a.dateIso) continue;
    patches.push({
      sessionId: id,
      // dateIso gehört zwingend in denselben Patch wie day/date (Invariante, siehe `swapWorkouts`).
      changes: { day: a.day, date: a.date, ...(a.dateIso ? { dateIso: a.dateIso } : {}) },
    });
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
 *
 * `externalLoadTitlesOf` (`buildPhysicalLoadDayLookup`) lets the micro-structure check see physically
 * demanding calendar events on neighbouring days: a hard session the day before or after one is a new
 * finding of severity 75 (warning). Without it only the event's own day counts (via the fit score).
 */
type ScoredCandidate = {
  candidate: SessionAssignmentCandidate;
  after: AiPlanWeek[];
  delta: MicroDelta;
  combinedFit: number;
};

/** Phasen, Kontext und Vorher-Befunde einmal je Aufruf (nicht je Kandidat). */
type MicroEvalContext = {
  context: ValidationContext;
  options: MicroValidationOptions;
  beforeFindings: MicroFinding[];
};

function buildMicroEvalContext(
  plan: AiPlanWeek[],
  phase?: TrainingPhase,
  externalLoadTitlesOf?: MicroExternalLoadLookup,
): MicroEvalContext {
  const context: ValidationContext = phase ? { ...FALLBACK_VALIDATION_CONTEXT, phase } : FALLBACK_VALIDATION_CONTEXT;
  const options: MicroValidationOptions = { phaseOf: buildPhaseLookup(plan, phase), externalLoadTitlesOf };
  return { context, options, beforeFindings: collectMicroFindings(normalizeTrainingPlan(plan), context, options) };
}

function deltaFor(simulated: AiPlanWeek[], micro: MicroEvalContext): MicroDelta {
  const afterFindings = collectMicroFindings(normalizeTrainingPlan(simulated), micro.context, micro.options);
  return diffMicroFindings(micro.beforeFindings, afterFindings);
}

const joinOrNull = (parts: string[]): string | null => (parts.length ? parts.join(" ") : null);

/** Scores one candidate day; `null` when it's the moved session's own day or its target can't be found. */
function scoreCandidate(
  before: AiPlanWeek[],
  sessionId: string,
  movedSession: AiPlanSession,
  candidate: SessionAssignmentCandidate,
  sourceDayCapacity: DayCapacityScore | null,
  micro: MicroEvalContext,
): ScoredCandidate | null {
  if (candidate.targetSessionId === sessionId) return null;
  const displacedSession = findSessionById(before, candidate.targetSessionId);
  if (!displacedSession) return null;

  const simulated = swapWorkouts(before, sessionId, candidate.targetSessionId);
  // Nur die Änderung zählt: Befunde, die es vor dem Tausch schon gab, bleiben außen vor.
  const delta = deltaFor(simulated, micro);

  // Both sides of the swap must be scored: the moved session on its new (candidate) day, AND the
  // displaced session that gets pushed onto the moved session's old day — otherwise a great capacity
  // fit for the clicked session can silently shove a high-intensity session onto an overloaded day.
  const movedFit = computeSessionDayFitScore(movedSession, candidate.capacity);
  const displacedFit = sourceDayCapacity ? computeSessionDayFitScore(displacedSession, sourceDayCapacity) : 1;

  return { candidate, after: simulated, delta, combinedFit: Math.min(movedFit, displacedFit) };
}

/**
 * Shared by the auto-pick (`assignSessionToBestCapacityDay`) and the full ranked list
 * (`rankCalendarReassignmentCandidates`) — same order, so "the winner" is always ranked[0].
 *
 * Reihenfolge: (1) Kandidaten mit tragfähigem Kalender-Fit (>= `MIN_FIT_SCORE_THRESHOLD`) vor allen anderen —
 * ein überbuchter Tag kann den Auto-Pick so nicht mehr blockieren; (2) niedrigere Stufe des Delta-Schweregrads
 * (`microStructureTier`); (3) innerhalb einer Stufe höherer Fit; (4) niedrigerer Delta-Schweregrad; (5) frühestes Datum.
 */
function scoreAndRankCandidates(
  before: AiPlanWeek[],
  sessionId: string,
  movedSession: AiPlanSession,
  candidates: SessionAssignmentCandidate[],
  sourceDayCapacity: DayCapacityScore | null,
  micro: MicroEvalContext,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const result = scoreCandidate(before, sessionId, movedSession, candidate, sourceDayCapacity, micro);
    if (result) scored.push(result);
  }
  const fitInfeasible = (c: ScoredCandidate) => (c.combinedFit < MIN_FIT_SCORE_THRESHOLD ? 1 : 0);
  scored.sort((a, b) => {
    if (fitInfeasible(a) !== fitInfeasible(b)) return fitInfeasible(a) - fitInfeasible(b);
    if (a.delta.tier !== b.delta.tier) return a.delta.tier - b.delta.tier;
    if (a.combinedFit !== b.combinedFit) return b.combinedFit - a.combinedFit;
    if (a.delta.severity !== b.delta.severity) return a.delta.severity - b.delta.severity;
    return a.candidate.capacity.dateIso.localeCompare(b.candidate.capacity.dateIso);
  });
  return scored;
}

export function assignSessionToBestCapacityDay(
  plan: AiPlanWeek[],
  sessionId: string,
  candidates: SessionAssignmentCandidate[],
  sourceDayCapacity: DayCapacityScore | null = null,
  phase?: TrainingPhase,
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
  externalLoadTitlesOf?: MicroExternalLoadLookup,
): SessionAssignmentResult {
  const before: AiPlanWeek[] = deepClone(plan);
  const emptyResult: Omit<SessionAssignmentResult, "reason"> = {
    ok: false,
    plan: before,
    patches: [],
    chosenTargetSessionId: null,
    microStructureDeltaSeverity: 0,
    microStructureTier: 0,
    warning: null,
    hint: null,
  };

  const movedSession = findSessionById(before, sessionId);
  if (!sessionId || !movedSession || candidates.length === 0) {
    return { ...emptyResult, reason: "no-candidates" };
  }
  if (lockedSessionIds.has(sessionId)) {
    return { ...emptyResult, reason: "locked-session" };
  }

  const micro = buildMicroEvalContext(before, phase, externalLoadTitlesOf);
  const scored = scoreAndRankCandidates(before, sessionId, movedSession, candidates, sourceDayCapacity, micro);

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
  // Ab Stufe 3 (neuer Befund ab 95, z. B. zwei harte Tage hintereinander) schlägt die Engine nie selbst vor —
  // in der manuellen Tageswahl bleibt der Tag sichtbar und gekennzeichnet.
  if (winner.delta.tier >= 3) {
    return { ...emptyResult, reason: "no-safe-candidate" };
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
    microStructureDeltaSeverity: winner.delta.severity,
    microStructureTier: winner.delta.tier,
    warning: joinOrNull(winner.delta.warnings),
    hint: joinOrNull(winner.delta.hints),
  };
}

export type RankedCalendarCandidate = {
  targetSessionId: string;
  dateIso: string;
  combinedFit: number;
  /** Höchster Schweregrad der durch den Tausch NEU entstehenden Befunde (vorbestehende zählen nicht). */
  microStructureDeltaSeverity: number;
  microStructureTier: MicroTier;
  /** Alle neuen Gründe zusammengefasst, `null` ohne neue Befunde. */
  microStructureReason: string | null;
  /** ⚠️-Grund (neue Befunde ab 75), sonst `null`. */
  microStructureWarning: string | null;
  /** Neutraler Hinweis (neue Befunde 40–74), sonst `null`. */
  microStructureHint: string | null;
  /** Would be rejected (low fit) or warned (Stufe 2 und 3: neuer Befund ab 75) by the auto-pick engine — surfaced
   * so the athlete can see it's a worse choice, not hidden, since they may still deliberately pick it. */
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
  phase?: TrainingPhase,
  externalLoadTitlesOf?: MicroExternalLoadLookup,
): RankedCalendarCandidate[] {
  const before: AiPlanWeek[] = deepClone(plan);
  const movedSession = findSessionById(before, sessionId);
  if (!sessionId || !movedSession || candidates.length === 0) return [];

  const micro = buildMicroEvalContext(before, phase, externalLoadTitlesOf);
  const scored = scoreAndRankCandidates(before, sessionId, movedSession, candidates, sourceDayCapacity, micro);

  return scored.map((s) => ({
    targetSessionId: s.candidate.targetSessionId,
    dateIso: s.candidate.capacity.dateIso,
    combinedFit: s.combinedFit,
    microStructureDeltaSeverity: s.delta.severity,
    microStructureTier: s.delta.tier,
    microStructureReason: s.delta.reason,
    microStructureWarning: joinOrNull(s.delta.warnings),
    microStructureHint: joinOrNull(s.delta.hints),
    isConflict: s.combinedFit < MIN_FIT_SCORE_THRESHOLD || s.delta.tier >= 2,
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
  phase?: TrainingPhase,
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
  externalLoadTitlesOf?: MicroExternalLoadLookup,
): SessionAssignmentResult {
  const before: AiPlanWeek[] = deepClone(plan);
  const emptyResult: Omit<SessionAssignmentResult, "reason"> = {
    ok: false,
    plan: before,
    patches: [],
    chosenTargetSessionId: null,
    microStructureDeltaSeverity: 0,
    microStructureTier: 0,
    warning: null,
    hint: null,
  };

  const movedSession = findSessionById(before, sessionId);
  const displacedSession = findSessionById(before, targetSessionId);
  if (!sessionId || !movedSession || !targetSessionId || !displacedSession) {
    return { ...emptyResult, reason: "no-candidates" };
  }
  if (lockedSessionIds.has(sessionId) || lockedSessionIds.has(targetSessionId)) {
    return { ...emptyResult, reason: "locked-session" };
  }

  const micro = buildMicroEvalContext(before, phase, externalLoadTitlesOf);
  const simulated = swapWorkouts(before, sessionId, targetSessionId);
  const delta = deltaFor(simulated, micro);

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
    microStructureDeltaSeverity: delta.severity,
    microStructureTier: delta.tier,
    warning: joinOrNull(delta.warnings),
    hint: joinOrNull(delta.hints),
  };
}
