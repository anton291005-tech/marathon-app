import { aiAgentDevWarn } from "./agentDebug";
import { getAppNow } from "../../core/time/timeSystem";
import { validateToolCall } from "./validateToolCall";
import { updateCoachMemory } from "./memory/updateCoachMemory";

function toolExecutionSafeMessage() {
  return {
    message:
      "Diese Änderung konnte ich nicht sicher ausführen. Steuere den nächsten Run lieber lockerer oder passe die Einheit im **Woche**-Tab an — wenn du magst, formuliere dieselbe Bitte noch einmal mit konkretem Datum oder «heute/morgen», dann probiere ich es hier erneut.",
    confidence: 0.2,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function executeTool(res: unknown, state: unknown) {
  try {
    if (!isPlainObject(res)) {
      aiAgentDevWarn("executeTool-bad-root", res);
      return toolExecutionSafeMessage();
    }
    if (typeof res.action !== "string" || !res.action.trim()) {
      aiAgentDevWarn("executeTool-bad-action", res);
      return toolExecutionSafeMessage();
    }
    if (!isPlainObject(res.parameters)) {
      aiAgentDevWarn("executeTool-bad-parameters", res);
      return toolExecutionSafeMessage();
    }
    const actionKey = String(res.action).trim();
    if (!validateToolCall(actionKey, res.parameters)) {
      aiAgentDevWarn("executeTool-validate-rejected", res.action);
      return toolExecutionSafeMessage();
    }

    switch (actionKey) {
      case "adjustTrainingPlan":
        return adjustTrainingPlan(res.parameters, state);

      case "addRestDay":
        return addRestDay(res.parameters, state);

      case "swapTrainingDays":
        return swapTrainingDays(res.parameters, state);

      default:
        aiAgentDevWarn("executeTool-unsupported", res.action);
        return {
          message:
            "Diese konkrete Aktion ist hier nicht verdrahtet. Beschreib den Wunsch in einfachen Worten direkt hier im Coach (z. B. zwei Tage tauschen, Ruhetag einfügen), dann kann ich mit den verfügbaren Schritten weiterarbeiten.",
          confidence: 0.2,
        };
    }
  } catch (err) {
    aiAgentDevWarn("executeTool-threw", err);
    return toolExecutionSafeMessage();
  }
}

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

const TOOLS_WEEKDAY_MON_OFFSET: Record<string, number> = {
  montag: 0, dienstag: 1, mittwoch: 2, donnerstag: 3,
  freitag: 4, samstag: 5, sonntag: 6,
};

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function normalizeDayInput(day: string, todayIso?: string): string {
  const d = day.toLowerCase().trim();

  // Already a valid ISO date – return as-is
  if (isValidIsoDate(d)) return d;

  // heute / today → ISO when todayIso available, else relative word
  if (d === "heute" || d === "today") return todayIso ?? "today";

  // morgen / tomorrow → ISO when todayIso available, else relative word
  if (d === "morgen" || d === "tomorrow") {
    if (todayIso) {
      const dt = new Date(`${todayIso}T12:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + 1);
      return dt.toISOString().slice(0, 10);
    }
    return "tomorrow";
  }

  // Full German date: "09.06.2026" → "2026-06-09"
  const fullMatch = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (fullMatch) {
    const dd = fullMatch[1].padStart(2, "0");
    const mm = fullMatch[2].padStart(2, "0");
    const rawY = parseInt(fullMatch[3], 10);
    const yyyy = rawY < 100 ? 2000 + rawY : rawY;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Short German date: "09.06" or "9.6" → "YYYY-MM-DD"
  const shortMatch = d.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (shortMatch) {
    const dd = shortMatch[1].padStart(2, "0");
    const mm = shortMatch[2].padStart(2, "0");
    const yyyy = todayIso ? todayIso.slice(0, 4) : String(getAppNow().getFullYear());
    return `${yyyy}-${mm}-${dd}`;
  }

  // German weekday names → next occurrence (or today) relative to todayIso
  if (todayIso) {
    const targetMonBased = TOOLS_WEEKDAY_MON_OFFSET[d];
    if (targetMonBased !== undefined) {
      const today = new Date(`${todayIso}T12:00:00Z`);
      const dow = today.getUTCDay(); // 0=Sun
      const todayMonBased = (dow + 6) % 7; // Mon=0 … Sun=6
      const diff = (targetMonBased - todayMonBased + 7) % 7;
      if (diff === 0) return todayIso;
      const result = new Date(today);
      result.setUTCDate(result.getUTCDate() + diff);
      return result.toISOString().slice(0, 10);
    }
  }

  return day;
}

/**
 * Returns true when the string is already a resolved calendar expression.
 * ISO date strings ("2026-06-09") are always considered resolved – no "unclear" guard needed.
 */
function expressesRelativeCalendarWord(s: string): boolean {
  if (isValidIsoDate(s.trim())) return true;
  return /\b(today|tomorrow|heute|morgen)\b/i.test(String(s));
}

/** swapTrainingDays must always return `{ message, confidence }` even if planEngine deviates. */
function ensureSwapTrainingDaysResponse(raw: unknown): { message: string; confidence: number } {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const msgRaw = typeof o.message === "string" ? o.message.trim() : "";
    const conf =
      typeof o.confidence === "number" && Number.isFinite(o.confidence) ? clampConfidence(o.confidence) : undefined;
    if (msgRaw) {
      return { message: msgRaw, confidence: conf ?? 0.5 };
    }
  }
  if (typeof raw === "string" && raw.trim()) {
    return { message: raw.trim(), confidence: 0.5 };
  }
  return { message: "Die beiden Trainingstage wurden getauscht — prüfe die Änderung im Tab **Woche**.", confidence: 0.5 };
}

function clampConfidence(c: number): number {
  return Math.min(1, Math.max(0, c));
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

function swapTrainingDays(params: any, state: any) {
  const { dayA, dayB } = params ?? {};

  if (!dayA || !dayB) {
    return {
      message:
        "Für den Tausch brauche ich **beide** Tage (z. B. «heute und morgen» oder zwei Wochentagen). Schreib sie bitte namentlich noch einmal, dann löse ich das hier wieder.",
      confidence: 0.1,
    };
  }

  if (!state.planEngine?.swapDays) {
    return {
      message:
        "Ein automatischer Tag-Tausch ist in dieser Ansicht gerade nicht verfügbar (keine aktive Swap-Engine). Ordne Einheiten im **Woche**-Tab manuell neu, oder lade diese Oberfläche neu und beschreib zwei klare **Wochentage** noch einmal im Coach.",
      confidence: 0.1,
    };
  }

  const rawA = String(dayA).trim();
  const rawB = String(dayB).trim();

  const todayIso =
    typeof (state as any)?.todayIso === "string" && (state as any).todayIso
      ? (state as any).todayIso as string
      : undefined;

  const normalizedA = normalizeDayInput(rawA, todayIso);
  const normalizedB = normalizeDayInput(rawB, todayIso);

  if (
    normalizedA === rawA &&
    normalizedB === rawB &&
    !expressesRelativeCalendarWord(rawA) &&
    !expressesRelativeCalendarWord(rawB)
  ) {
    return {
      message:
        "Ich kann Tage tauschen, brauche aber **welche beiden** konkret gemeint sind. Meinst du **heute und morgen**, oder zwei feste Wochentage? Schreib es kurz vollständig — dann wiederhole ich den Befehl.",
      confidence: 0.5,
    };
  }

  try {
    const raw = state.planEngine.swapDays(normalizedA, normalizedB);
    const out = ensureSwapTrainingDaysResponse(raw);
    try {
      updateCoachMemory({ type: "swap" });
    } catch {
      /* no-op */
    }
    return out;
  } catch {
    return {
      message:
        "Tauschen ist fehlgeschlagen — sind beide Einheiten wirklich Lauf-/Trainingstage? Formulier noch einmal z. B. «Dienstag mit Donnerstag tauschen» oder «heute und morgen», dann gehe ich hier erneut dran.",
      confidence: 0.2,
    };
  }
}
