import type { AiPlanWeek } from "../../lib/ai/types";
import { normalizeTrainingPhase, type TrainingPhase } from "../../planV2/trainingPhase";
import type { MicroPhaseLookup } from "../validation/validateMicroStructure";
import { sessionDayIso } from "./sessionDayIso";

/**
 * Phase je Kalendertag aus den Wochenzeilen des Anzeigeplans (`AiPlanWeek.phase`, aus `WeekV2.meta.phase`).
 * Die Engine bewertet damit jeden Tag mit der Phase SEINER Woche statt mit einer festen „build"-Annahme.
 * `override` (expliziter `phase`-Parameter der Engine) gilt für alle Tage. Tage ohne Wochenzeile liefern
 * `undefined` → der Validator nimmt `context.phase`.
 */
export function buildPhaseLookup(plan: AiPlanWeek[], override?: TrainingPhase): MicroPhaseLookup {
  if (override) return () => override;
  const byDay = new Map<string, TrainingPhase>();
  for (const week of plan) {
    const phase = normalizeTrainingPhase(week.phase);
    for (const session of week.s ?? []) {
      const day = sessionDayIso(session);
      if (day) byDay.set(day, phase);
    }
  }
  return (ymd) => byDay.get(ymd);
}
