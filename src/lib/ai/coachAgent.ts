import { getApiBaseUrl } from "../api/apiBaseUrl";
import { aiAgentDevWarn } from "./agentDebug";
import { onAgentFallback, recordCoachAgentCycleDev, weakAgentMessagePayload } from "./agentFallback";
import { buildCoachContext } from "./buildCoachContext";
import { handleAgentResponse } from "./handleAgentResponse";

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
    const { planEngine: _planEngine, ...rest } = appState ?? {};
    const context =
      rest?.recoveryDomain && typeof rest.recoveryDomain === "object"
        ? rest
        : buildCoachContext(appState);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    // eslint-disable-next-line no-console
    console.log("[coachAgent] sending to /api/ai, context keys:", Object.keys(context));

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
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      aiAgentDevWarn("fetch-threw-or-aborted", err);
      return networkFallback();
    }

    const responseText = await res.text();
    // eslint-disable-next-line no-console
    console.log("[coachAgent] raw response text:", responseText.slice(0, 500));

    // eslint-disable-next-line no-console
    console.log("[coachAgent] response status:", res.status, res.ok);

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error("[coachAgent] API error body:", responseText.slice(0, 200));
    }
    let data: unknown;
    try {
      data = responseText.trim() ? JSON.parse(responseText) : null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[coachAgent] JSON parse failed:", e instanceof Error ? e.message : String(e));
      aiAgentDevWarn("json-parse-failed", responseText?.slice?.(0, 200));
      onAgentFallback("invalid_json");
      return await handleAgentResponse(weakAgentMessagePayload(), appState);
    }

    const normalized = normalizeFetchedAgentPayload(data);
    return await handleAgentResponse(normalized, appState);
  } catch (err) {
    aiAgentDevWarn("runCoachAgent-unexpected", err);
    return networkFallback();
  }
}
