import { aiAgentDevWarn } from "./agentDebug";
import { agentFallbackOutcome, hasActionableContent, isWeakMessage } from "./agentFallback";
import { buildActionPreview } from "./actions";
import { coerceAiAssistantActionFromWire } from "./aiActionContract";
import type { AiAssistantResponse, AiContext } from "./types";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type HandleAgentResponseResult = AiAssistantResponse;

function coachMessage(text: unknown, mode: AiAssistantResponse["mode"] = "coach"): AiAssistantResponse {
  const message = typeof text === "string" && text.trim() ? text.trim() : "Keine Antwort";
  return { mode, message };
}

function normalizeLegacyResponse(res: Record<string, unknown>): AiAssistantResponse {
  const mode = ["coach", "navigator", "support"].includes(String(res.mode))
    ? (res.mode as AiAssistantResponse["mode"])
    : "coach";
  const message = typeof res.message === "string" ? res.message.trim() : "";
  let action = coerceAiAssistantActionFromWire(res.action);
  if (action && !action.preview) {
    action = { ...action, preview: buildActionPreview(action, {} as AiContext) };
  }
  return { mode, message: message || "Keine Antwort", action: action ?? undefined };
}

/** Maps legacy tool_call envelopes onto unified { mode, message, action? }. */
function toolCallToAssistantResponse(res: Record<string, unknown>): AiAssistantResponse | null {
  const actionName = typeof res.action === "string" ? res.action.trim() : "";
  const params =
    res.parameters && typeof res.parameters === "object" && !Array.isArray(res.parameters)
      ? (res.parameters as Record<string, unknown>)
      : {};

  if (actionName === "swapTrainingDays") {
    const dayA = typeof params.dayA === "string" ? params.dayA : "";
    const dayB = typeof params.dayB === "string" ? params.dayB : "";
    if (!dayA || !dayB) return null;
    const action = {
      type: "swap_training_days" as const,
      payload: { dayA, dayB },
      preview: {
        title: "Trainingstage tauschen",
        items: [`${dayA} ↔ ${dayB}`],
        confirmLabel: "Tauschen",
        cancelLabel: "Abbrechen",
      },
    };
    return {
      mode: "coach",
      message: `Ich tausche die Einheiten am ${dayA} und ${dayB}. Bitte bestätige.`,
      action,
    };
  }

  return null;
}

/**
 * Unified response handler: always returns `{ mode, message, action? }`.
 */
export async function handleAgentResponse(res: unknown, _state: unknown): Promise<HandleAgentResponseResult> {
  if (!isPlainRecord(res)) {
    aiAgentDevWarn("invalid-response-root", res);
    // eslint-disable-next-line no-console
    console.warn("[handleAgentResponse] FALLBACK triggered, reason:", "invalid_shape");
    const fb = agentFallbackOutcome("invalid_shape");
    return coachMessage(fb.message);
  }

  if (typeof res.mode === "string" && typeof res.message === "string") {
    return normalizeLegacyResponse(res);
  }

  if (typeof res.message === "string" && !res.type && !res.mode) {
    return coachMessage(res.message);
  }

  if (res.type === "tool_call") {
    const converted = toolCallToAssistantResponse(res);
    if (converted) return converted;
    aiAgentDevWarn("tool_call-unmapped", res);
    // eslint-disable-next-line no-console
    console.warn("[handleAgentResponse] FALLBACK triggered, reason:", "tool_rejected");
    const fb = agentFallbackOutcome("tool_rejected");
    return coachMessage(fb.message);
  }

  if (res.type === "message") {
    const trimmed = typeof res.message === "string" ? res.message.trim() : "";
    if (!trimmed) {
      // eslint-disable-next-line no-console
      console.warn("[handleAgentResponse] FALLBACK triggered, reason:", "weak_message");
      const fb = agentFallbackOutcome("weak_message");
      return coachMessage(fb.message);
    }
    if (isWeakMessage(trimmed) || !hasActionableContent(trimmed)) {
      aiAgentDevWarn("message-weak-or-not-actionable", { preview: trimmed.slice(0, 80) });
      // eslint-disable-next-line no-console
      console.warn("[handleAgentResponse] FALLBACK triggered, reason:", "weak_message");
      const fb = agentFallbackOutcome("weak_message");
      return coachMessage(fb.message);
    }
    return coachMessage(trimmed);
  }

  aiAgentDevWarn("unknown-response-shape", Object.keys(res));
  // eslint-disable-next-line no-console
  console.warn("[handleAgentResponse] FALLBACK triggered, reason:", "invalid_shape");
  const fb = agentFallbackOutcome("invalid_shape");
  return coachMessage(fb.message);
}
