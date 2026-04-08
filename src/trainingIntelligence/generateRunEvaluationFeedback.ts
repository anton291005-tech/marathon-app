/**
 * Short German copy from evaluation only (deterministic).
 */

import type { RunEvaluation } from "./types";

export function generateRunEvaluationFeedback(evaluation: RunEvaluation): string {
  switch (evaluation.status) {
    case "perfect":
      return "Einheit erfüllt.";
    case "good":
      return "Gut gelaufen, passt zum Plan.";
    case "short":
      return "Distanz unter Plan, aber okay.";
    case "long":
      return "Etwas mehr Distanz als geplant — passt, wenn es sich gut angefühlt hat.";
    case "too_fast_easy":
      return "Einheit erfüllt, aber etwas zu schnell. Morgen locker bleiben.";
    case "too_hard":
      return "Belastung etwas zu hoch — morgen locker bleiben.";
    case "too_easy":
      return "Eher ruhig unterwegs — für Easy okay, oder nächstes Mal etwas flotter.";
    case "no_match":
    default:
      return "Noch kein klarer Abgleich mit der Einheit.";
  }
}

/** Compact label for chips (UI). */
export function evaluationStatusLabel(evaluation: RunEvaluation): string {
  switch (evaluation.status) {
    case "perfect":
    case "good":
      return "Wie geplant";
    case "short":
      return "Kürzer";
    case "long":
      return "Länger";
    case "too_fast_easy":
      return "Zu schnell (Easy)";
    case "too_hard":
      return "Zu intensiv";
    case "too_easy":
      return "Sehr locker";
    case "no_match":
    default:
      return "Kein Match";
  }
}
