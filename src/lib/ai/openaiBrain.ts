import { buildActionPreview } from "./actions";
import type { AiAssistantResponse, AiContext, AiMode, AiActionType, AiAssistantAction } from "./types";
import type { AiConfig } from "./config";

const ALLOWED_ACTIONS: AiActionType[] = [
  "adjust_plan_for_illness",
  "replace_bike_with_run",
  "shift_race_date",
  "shift_plan_start_date",
  "navigate_to_screen",
  "explain_feature",
];

type OpenAiApiRequest = {
  input: string;
  context: AiContext;
  model?: string;
  allowedActions: AiActionType[];
  responseSchemaVersion: "ai-assistant-response-v1";
};

function isValidMode(value: unknown): value is AiMode {
  return value === "coach" || value === "navigator" || value === "support";
}

function isValidActionType(value: unknown): value is AiActionType {
  return typeof value === "string" && ALLOWED_ACTIONS.includes(value as AiActionType);
}

function fallbackSupportResponse(message = "Ich konnte die Antwort nicht sauber strukturieren."): AiAssistantResponse {
  return {
    mode: "support",
    message,
  };
}

function sanitizeResponse(candidate: any, context: AiContext): AiAssistantResponse {
  if (!candidate || typeof candidate !== "object") return fallbackSupportResponse();
  const mode = isValidMode(candidate.mode) ? candidate.mode : "support";
  const message = typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message
    : "Ich konnte die Antwort nicht sauber strukturieren.";

  if (!candidate.action || typeof candidate.action !== "object") {
    return { mode, message };
  }

  const action = candidate.action;
  if (!isValidActionType(action.type)) {
    return { mode, message };
  }

  const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
  const preview = action.preview && typeof action.preview === "object"
    ? {
      title: typeof action.preview.title === "string" ? action.preview.title : "Vorgeschlagene Anpassung",
      items: Array.isArray(action.preview.items) ? action.preview.items.filter((item: unknown) => typeof item === "string") : [],
      confirmLabel: typeof action.preview.confirmLabel === "string" ? action.preview.confirmLabel : undefined,
      cancelLabel: typeof action.preview.cancelLabel === "string" ? action.preview.cancelLabel : undefined,
      secondaryLabel: typeof action.preview.secondaryLabel === "string" ? action.preview.secondaryLabel : undefined,
      openLabel: typeof action.preview.openLabel === "string" ? action.preview.openLabel : undefined,
    }
    : undefined;

  const normalizedAction: AiAssistantAction = {
    type: action.type,
    payload,
    preview,
  };
  if (!normalizedAction.preview) {
    normalizedAction.preview = buildActionPreview(normalizedAction, context);
  }

  return {
    mode,
    message,
    action: normalizedAction,
  };
}

async function fetchAiFromApi(request: OpenAiApiRequest, config: AiConfig): Promise<AiAssistantResponse> {
  const baseUrl = (config.apiBaseUrl || "").replace(/\/$/, "");
  // Replace/implement this endpoint on your backend (server side key handling only).
  const url = `${baseUrl}/api/ai`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let data: any = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }
    // eslint-disable-next-line no-console
    console.log("[ai-client] /api/ai response", {
      status: response.status,
      ok: response.ok,
      data,
      rawBody,
    });

    if (!response.ok) {
      throw new Error(`AI endpoint failed: ${response.status}`);
    }
    if (!data || typeof data !== "object") {
      return fallbackSupportResponse("Ich konnte die Antwort nicht sauber strukturieren.");
    }
    return sanitizeResponse(data, request.context);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function openAiGenerate(input: string, context: AiContext, config: AiConfig): Promise<AiAssistantResponse> {
  const request: OpenAiApiRequest = {
    input,
    context,
    model: config.model,
    allowedActions: ALLOWED_ACTIONS,
    responseSchemaVersion: "ai-assistant-response-v1",
  };
  return fetchAiFromApi(request, config);
}
