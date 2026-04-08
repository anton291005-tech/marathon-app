/**
 * Whether to persist Apple-derived completion for a running session.
 */

import type { PlanSession } from "../marathonPrediction";
import type { CompletionDecision, RunEvaluation, RunMatchResult } from "./types";

const RUNNING = new Set(["easy", "long", "interval", "tempo", "race"]);

export function decideRunningCompletion(
  session: PlanSession,
  match: RunMatchResult,
  evaluation: RunEvaluation,
): CompletionDecision {
  if (!RUNNING.has(session.type)) {
    return {
      shouldWrite: false,
      setDone: false,
      setAssignedRun: false,
      reason: "not_running_session",
    };
  }

  if (!match.matched || !match.plannedSessionId) {
    return {
      shouldWrite: false,
      setDone: false,
      setAssignedRun: false,
      reason: "no_match",
    };
  }

  if (evaluation.status === "no_match") {
    return {
      shouldWrite: false,
      setDone: false,
      setAssignedRun: false,
      reason: "evaluation_no_match",
    };
  }

  if (match.confidence === "low") {
    return {
      shouldWrite: true,
      setDone: false,
      setAssignedRun: false,
      reason: "suggest_only",
    };
  }

  return {
    shouldWrite: true,
    setDone: true,
    setAssignedRun: true,
    reason: "auto_complete_running",
  };
}
