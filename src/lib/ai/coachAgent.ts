import { getApiBaseUrl } from "../api/apiBaseUrl";
import { aiAgentDevWarn } from "./agentDebug";
import { onAgentFallback, recordCoachAgentCycleDev, weakAgentMessagePayload } from "./agentFallback";
import { buildCoachContext } from "./buildCoachContext";
import { getAiConfig } from "./config";
import { handleAgentResponse } from "./handleAgentResponse";
import { detectCoachIntent } from "./intent/router";

/** INPUT → INTENT ROUTER → deterministic tool_calls or LLM (see STEP 6 safety rules). */
function networkFallback() {
  return {
    message: "Coach temporarily unavailable.",
    confidence: 0.2,
  };
}

function isLegacyCoachPayload(data: unknown): data is { mode: string; message: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return typeof d.mode === "string" && typeof d.message === "string";
}

/** Normalize flaky HTTP bodies before `handleAgentResponse` (invalid JSON handled by caller). */
function normalizeFetchedAgentPayload(data: unknown): unknown {
  if (data === null || data === undefined) {
    aiAgentDevWarn("empty-body-normalized-to-weak");
    onAgentFallback("weak_message");
    return weakAgentMessagePayload();
  }

  if (typeof data === "string") {
    const t = data.trim();
    if (t.length === 0) {
      aiAgentDevWarn("empty-string-body-weak");
      onAgentFallback("weak_message");
      return weakAgentMessagePayload();
    }
    if (t.length > 10) {
      return { type: "message", message: t, confidence: 0.3 };
    }
    aiAgentDevWarn("short-string-body-weak");
    onAgentFallback("weak_message");
    return weakAgentMessagePayload();
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    aiAgentDevWarn("non-object-body-weak", typeof data);
    onAgentFallback("invalid_shape");
    return weakAgentMessagePayload();
  }

  if (isLegacyCoachPayload(data)) {
    return data;
  }

  const o = data as Record<string, unknown>;
  if (o.type === "tool_call" || o.type === "message") {
    return data;
  }

  aiAgentDevWarn("missing-type-weak", Object.keys(o));
  onAgentFallback("invalid_shape");
  return weakAgentMessagePayload();
}

export async function runCoachAgent(userInput: string, appState: any) {
  recordCoachAgentCycleDev();

  try {
    // Prefer the existing app-native context shape when present (compatible with current `/api/ai`).
    const context =
      appState?.recoveryDomain && typeof appState.recoveryDomain === "object"
        ? {
            todayIso: typeof appState?.todayIso === "string" ? appState.todayIso : "",
            recoveryDomain: appState.recoveryDomain,
            availableScreens: Array.isArray(appState?.availableScreens) ? appState.availableScreens : [],
          }
        : buildCoachContext(appState);

    /** Deterministic tools only when input is non-empty; swap/addRest bypass LLM, adjust/general use LLM. */
    if (typeof userInput === "string" && userInput.trim()) {
      const intent = detectCoachIntent(userInput);

      if (intent === "swapTrainingDays") {
        return await handleAgentResponse(
          {
            type: "tool_call",
            action: "swapTrainingDays",
            parameters: {
              dayA: "today",
              dayB: "tomorrow",
            },
            confidence: 0.95,
            reason: "intent_router",
          },
          appState,
        );
      }

      if (intent === "addRestDay") {
        return await handleAgentResponse(
          {
            type: "tool_call",
            action: "addRestDay",
            parameters: {},
            confidence: 0.9,
            reason: "intent_router",
          },
          appState,
        );
      }
      // intent === "adjustTrainingPlan" | "general" → LLM flow below
    }

    const { requestTimeoutMs } = getAiConfig();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    let res: Response;
    try {
      res = await fetch(`${getApiBaseUrl()}/api/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: userInput,
          context,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      aiAgentDevWarn("fetch-threw-or-aborted", err);
      return networkFallback();
    } finally {
      clearTimeout(timeoutId);
    }

    const text = typeof res.text === "function" ? await res.text() : "";
    let parsed: unknown;
    try {
      parsed = text.trim() ? JSON.parse(text) : null;
    } catch {
      aiAgentDevWarn("json-parse-failed", text?.slice?.(0, 200));
      onAgentFallback("invalid_json");
      return await handleAgentResponse(weakAgentMessagePayload(), appState);
    }

    const normalized = normalizeFetchedAgentPayload(parsed);
    return await handleAgentResponse(normalized, appState);
  } catch (err) {
    aiAgentDevWarn("runCoachAgent-unexpected", err);
    return networkFallback();
  }
}
