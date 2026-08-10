import { updateCoachMemory } from "./memory/updateCoachMemory";

function adjustTrainingPlan(params: any, state: any) {
  const { day, intensity } = params ?? {};

  if (!day || !state?.planEngine?.adjust) {
    return {
      message:
        "Plan-Anpassung: die interne Plan-Steuerung antwortet gerade nicht. Öffne **Woche** und bearbeite die Einheit dort, oder schreib mir noch einmal denselben Wunsch mit Tag + «etwas leichter/härter».",
      confidence: 0.1,
    };
  }

  const out = state.planEngine.adjust(day, intensity);
  if (toolResultLooksSuccessful(out)) {
    const dir = classifyIntensityChange(intensity);
    if (dir === "decrease") {
      try {
        updateCoachMemory({ type: "easy_workout" });
      } catch {
        /* no-op */
      }
    } else if (dir === "increase") {
      try {
        updateCoachMemory({ type: "intensity_increased" });
      } catch {
        /* no-op */
      }
    }
  }
  return out;
}

function addRestDay(params: any, state: any) {
  if (!state?.planEngine?.addRestDay) {
    return {
      message:
        "Ruhetag konnte ich technisch nicht setzen — prüfe im **Woche**-Plan die freien Slots, oder schreib mir noch einmal **welcher Wochentag** einen Ruhetag braucht (gerne auch «heute»).",
      confidence: 0.1,
    };
  }

  const out = state.planEngine.addRestDay(params?.day);
  if (toolResultLooksSuccessful(out)) {
    try {
      updateCoachMemory({ type: "rest_added" });
    } catch {
      /* no-op */
    }
  }
  return out;
}

function toolResultLooksSuccessful(raw: unknown): boolean {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const msg = typeof (raw as { message?: unknown }).message === "string" ? (raw as { message: string }).message : "";
    if (!msg.trim()) return false;
    return !/\b(cannot|invalid|could\s+not|not\s+supported|unable\b|don't\s+know\b)/i.test(msg);
  }
  if (typeof raw === "string") {
    return raw.trim().length > 0 && !/\b(cannot|could\s+not)\b/i.test(raw);
  }
  return true;
}

/** Heuristic classification of adjustment direction from tool parameters (never blocks tools). */
function classifyIntensityChange(intensity: unknown): "increase" | "decrease" | null {
  if (intensity == null) return null;
  const s = String(intensity).toLowerCase();

  const increaseCue =
    /\b(extreme|maximum|sharp|interval|tempo|hart|harder|speed|accelerat|aufba(?:u)?|steig(?:en)?|erh[oö]h(?:en)?|progress|overload|intens)\b/i.test(
      s,
    );

  const decreaseCue =
    /\b(easy|easier|locker|recovery|easy\s*run|ruhe|pause|gentle|reduz|reduce|decrease|entlast|wandern|walking)\b/i.test(
      s,
    );

  if (increaseCue && !decreaseCue) return "increase";
  if (decreaseCue && !increaseCue) return "decrease";
  return null;
}
