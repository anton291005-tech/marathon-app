/**
 * Whether to persist Apple-derived completion for a running or bike session.
 */

import type { PlanSession } from "../marathonPrediction";
import type { CompletionDecision, RunEvaluation, RunMatchResult } from "./types";

const RUNNING = new Set(["easy", "long", "interval", "tempo", "race"]);
const BIKE = new Set(["bike"]);

export function decideRunningCompletion(
  session: PlanSession,
  match: RunMatchResult,
  evaluation: RunEvaluation,
): CompletionDecision {
  const isBike = BIKE.has(session.type);

  if (!RUNNING.has(session.type) && !isBike) {
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

  // Bike sessions may have km=0 in the plan — skip the no_match evaluation guard.
  if (!isBike && evaluation.category === "no_match") {
    return {
      shouldWrite: false,
      setDone: false,
      setAssignedRun: false,
      reason: "evaluation_no_match",
    };
  }

  if (match.confidence === "low") {
    if (isBike) {
      return {
        shouldWrite: false,
        setDone: false,
        setAssignedRun: false,
        reason: "low_confidence_bike",
      };
    }
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
    reason: isBike ? "auto_complete_bike" : "auto_complete_running",
  };
}
