import { getApiBaseUrl } from "../api/apiBaseUrl";
import { aiAgentDevWarn } from "./agentDebug";
import { onAgentFallback, recordCoachAgentCycleDev, weakAgentMessagePayload } from "./agentFallback";
import { buildCoachContext } from "./buildCoachContext";
import { getAiConfig } from "./config";
import { handleAgentResponse } from "./handleAgentResponse";
import { detectCoachIntent } from "./intent/router";

// ─── Swap date extraction ─────────────────────────────────────────────────────

const WEEKDAY_MON_OFFSET: Record<string, number> = {
  montag: 0, dienstag: 1, mittwoch: 2, donnerstag: 3,
  freitag: 4, samstag: 5, sonntag: 6,
};

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseGermanDate(tok: string, currentYear: number): string | null {
  const m = tok.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const rawYear = m[3] ? parseInt(m[3], 10) : currentYear;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekdayToNextIso(name: string, todayIso: string): string | null {
  const targetMonBased = WEEKDAY_MON_OFFSET[name];
  if (targetMonBased === undefined) return null;
  const today = new Date(`${todayIso}T12:00:00Z`);
  const dow = today.getUTCDay(); // 0=Sun
  const todayMonBased = (dow + 6) % 7; // Mon=0 … Sun=6
  const diff = (targetMonBased - todayMonBased + 7) % 7;
  return diff === 0 ? todayIso : addDaysIso(todayIso, diff);
}

/**
 * Extracts two swap dates from user input.
 * Handles: "09.06 mit 10.06", "montag mit dienstag", "heute mit morgen", "09.06.2026 und 10.06.2026".
 * Returns null when no two distinct dates can be reliably extracted.
 */
export function extractSwapDates(
  input: string,
  todayIso: string,
): { dayA: string; dayB: string } | null {
  const norm = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?;:()[\]{}']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const currentYear = new Date(todayIso).getFullYear();

  // 1. Numeric German dates: DD.MM or DD.MM.YYYY
  const numRe = /\b(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\b/g;
  const numDates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(norm)) !== null) {
    const iso = parseGermanDate(m[1], currentYear);
    if (iso) numDates.push(iso);
  }
  if (numDates.length >= 2) return { dayA: numDates[0], dayB: numDates[1] };

  // 2. Relative words: heute / morgen
  const hasHeute = /\bheute\b/.test(norm);
  const hasMorgen = /\bmorgen\b/.test(norm);
  if (hasHeute && hasMorgen) return { dayA: todayIso, dayB: addDaysIso(todayIso, 1) };

  // 3. German weekday names (in reading order)
  const weekdayDates: string[] = [];
  for (const day of ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"]) {
    if (norm.includes(day)) {
      const iso = weekdayToNextIso(day, todayIso);
      if (iso) weekdayDates.push(iso);
    }
  }
  if (weekdayDates.length >= 2) return { dayA: weekdayDates[0], dayB: weekdayDates[1] };

  return null;
}

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
        const todayIso =
          typeof appState?.todayIso === "string" && appState.todayIso
            ? appState.todayIso
            : new Date().toISOString().slice(0, 10);
        const extracted = extractSwapDates(userInput, todayIso);
        if (extracted) {
          return await handleAgentResponse(
            {
              type: "tool_call",
              action: "swapTrainingDays",
              parameters: {
                dayA: extracted.dayA,
                dayB: extracted.dayB,
              },
              confidence: 0.95,
              reason: "intent_router",
            },
            appState,
          );
        }
        // Extraction failed → fall through to LLM for clarification
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
