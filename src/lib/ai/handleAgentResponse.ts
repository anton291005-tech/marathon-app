import { aiAgentDevWarn } from "./agentDebug";
import {
  agentFallbackOutcome,
  hasActionableContent,
  isWeakMessage,
  normalizeThinEnvelope,
  recordThinMessageWeakCheckStartedDev,
  recordWeakMessageDetectedDev,
} from "./agentFallback";
import { executeTool } from "./tools";
import { validateToolCall } from "./validateToolCall";
import type { AiAssistantResponse } from "./types";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type HandleAgentResponseResult =
  | AiAssistantResponse
  | ReturnType<typeof normalizeThinEnvelope>;

/** Consumer boundary: trimmed message longer than 10 characters (strictly >10). */
function isValidAgentMessage(text: unknown): text is string {
  return typeof text === "string" && text.trim().length > 10;
}

function isSaneToolEnvelope(x: unknown): x is { message: string; confidence: number; followUp?: string | null } {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.message === "string" &&
    o.message.trim().length > 0 &&
    typeof o.confidence === "number" &&
    Number.isFinite(o.confidence)
  );
}

/**
 * Accepts either:
 * - New agent schema: { type: "tool_call" | "message", ... }
 * - Existing app schema (backend /api/ai): { mode: "coach" | ..., message, action? }
 *
 * Legacy shape is passed through untouched (no coercion, no normalization).
 */
export async function handleAgentResponse(res: unknown, state: unknown): Promise<HandleAgentResponseResult> {
  if (!isPlainRecord(res)) {
    aiAgentDevWarn("invalid-response-root", res);
    return agentFallbackOutcome("invalid_shape");
  }

  // Backwards-compatible path: existing app-native shape — do not transform.
  if (typeof res.mode === "string" && typeof res.message === "string") {
    return res as AiAssistantResponse;
  }

  if (res.type === "tool_call") {
    if (typeof res.action !== "string" || !res.action.trim()) {
      aiAgentDevWarn("tool_call-missing-action", res);
      return agentFallbackOutcome("invalid_shape");
    }
    const params = res.parameters;
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      aiAgentDevWarn("tool_call-invalid-parameters", res);
      return agentFallbackOutcome("invalid_shape");
    }
    if (!validateToolCall(res.action, params)) {
      aiAgentDevWarn("tool_call-rejected", { action: res.action, parameters: params });
      return agentFallbackOutcome("tool_rejected");
    }

    const rawTool = await executeTool(res, state);
    if (!isSaneToolEnvelope(rawTool)) {
      aiAgentDevWarn("tool-output-invalid-envelope", rawTool);
      return agentFallbackOutcome("invalid_shape");
    }

    return normalizeThinEnvelope(rawTool.message, rawTool.confidence, rawTool.followUp);
  }

  if (res.type === "message") {
    if (!isValidAgentMessage(res.message)) {
      aiAgentDevWarn("message-invalid-or-too-short", res);
      return agentFallbackOutcome("weak_message");
    }

    const trimmed = res.message.trim();

    recordThinMessageWeakCheckStartedDev();
    if (isWeakMessage(trimmed) || !hasActionableContent(trimmed)) {
      recordWeakMessageDetectedDev();
      aiAgentDevWarn("message-weak-or-not-actionable", { preview: trimmed.slice(0, 80) });
      return agentFallbackOutcome("weak_message");
    }

    return normalizeThinEnvelope(
      trimmed,
      typeof res.confidence === "number" && Number.isFinite(res.confidence) ? res.confidence : 0.5,
      res.follow_up_question,
    );
  }

  aiAgentDevWarn("unknown-response-shape", Object.keys(res));
  return agentFallbackOutcome("invalid_shape");
}
