/**
 * Coach-Texte aus RunEvaluation (deterministisch, deutsch).
 */

import type { RunCoachCategory, RunEvaluation } from "./types";

const COACH_TEXT: Record<Exclude<RunCoachCategory, "overload_risk">, string> = {
  slightly_hard:
    "Etwas intensiver als geplant gelaufen – achte darauf, die nächsten Einheiten nicht zu schnell zu machen.",
  low_stimulus:
    "Du bist kürzer und langsamer gelaufen – der Trainingsreiz war eher gering.",
  slightly_easy:
    "Etwas lockerer als geplant – für heute in Ordnung, aber langfristig auf Zielbereich achten.",
  ideal: "Sehr gut – Einheit genau im geplanten Bereich umgesetzt.",
  too_much_volume:
    "Du bist mehr gelaufen als geplant – erhöhte Belastung, achte auf ausreichende Erholung.",
  too_little_volume:
    "Du bist weniger gelaufen als geplant – Trainingsreiz entsprechend reduziert.",
  ideal_distance_only:
    "Die Distanz liegt im geplanten Korridor; ohne belastbares Tempo aus Health bleibt die Intensität offen – nächstes Mal Zieltempo mitdenken.",
  no_match: "Noch kein klarer Abgleich mit der Einheit.",
};

export type RunCoachVerdict = {
  category: RunCoachCategory;
  text: string;
};

function overloadCoachText(evaluation: RunEvaluation): string {
  if (evaluation.overloadKind === "volume_only") {
    return "Du bist deutlich mehr gelaufen als geplant – die Belastung ist spürbar höher. Morgen bewusst leichter trainieren und auf Erholung achten.";
  }
  return "Du bist deutlich weiter und schneller gelaufen als geplant – die Belastung ist erhöht. Morgen besser bewusst locker trainieren.";
}

export function getRunCoachVerdict(evaluation: RunEvaluation): RunCoachVerdict {
  const text =
    evaluation.category === "overload_risk"
      ? overloadCoachText(evaluation)
      : COACH_TEXT[evaluation.category];
  return {
    category: evaluation.category,
    text: text ?? COACH_TEXT.no_match,
  };
}

/** Liefert { category, text } für Anzeige und Persistenz. */
export function generateRunEvaluationFeedback(evaluation: RunEvaluation): RunCoachVerdict {
  return getRunCoachVerdict(evaluation);
}

/** Kompaktes Label für Chips (UI). */
export function evaluationStatusLabel(evaluation: RunEvaluation): string {
  switch (evaluation.category) {
    case "overload_risk":
      return "Belastung hoch";
    case "slightly_hard":
      return "Über Plan-Intensität";
    case "low_stimulus":
      return "Geringer Reiz";
    case "slightly_easy":
      return "Unter Plan-Tempo";
    case "ideal":
      return "Im Zielkorridor";
    case "too_much_volume":
      return "Mehr Volumen";
    case "too_little_volume":
      return "Weniger Volumen";
    case "ideal_distance_only":
      return "Distanz im Plan";
    case "no_match":
    default:
      return "Kein Abgleich";
  }
}
