import { getApiAuthHeaders } from "../api/authHeaders";
import { getAiConfig } from "./config";
import type { TrainingPlanV2 } from "../../planV2/types";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import type { ProfilePlanInputs } from "../../onboarding/onboardingPlanInputs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanGenerationProfile {
  raceDistanceKm: number | null;
  raceDistanceLabel: string;
  raceGoal: string;
  raceTargetTime?: string | null;
  weeklyKmRange: string;
  raceDate: string;
  planStartDate: string;
  planDurationDays: number;
  userPreferences: string[];
  /**
   * Plan-Eingaben für den Plan-Kern (Umbauplan Schritt 9/10). Der heutige Pfad liest sie nicht; fehlen sie (alter
   * Client), läuft ab Schritt 10 der heutige Pfad.
   */
  runDaysPerWeek?: ProfilePlanInputs["runDaysPerWeek"];
  availableDays?: ProfilePlanInputs["availableDays"];
  longRunDay?: ProfilePlanInputs["longRunDay"];
  currentWeeklyKm?: number;
  longestRecentRunKm?: number;
  longestRecentRunKmIsDefault?: boolean;
  recentRace?: ProfilePlanInputs["recentRace"];
}

export interface FullPlanResult {
  plan: TrainingPlanV2 | null;
  error?: string;
  /**
   * Maschinenlesbarer Fehlercode aus dem Body einer Fehlerantwort, z. B. `plan-core-invariant` (Server Schritt 10:
   * der Plan-Kern hat einen Verstoß gemeldet und auch der Rückfall ist gescheitert).
   */
  errorCode?: string;
  /** HTTP-Status, sobald der Server geantwortet hat; fehlt bei Netzwerkfehler/Timeout. */
  status?: number;
  /** Nur bei 429, wenn der Server eine Wartezeit liefert. */
  retryAfterSeconds?: number;
}

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

const DEFAULT_PLAN_API_BASE = "https://marathon-app-alpha.vercel.app";

/** Client abort for Option A — must exceed Vercel maxDuration (240s) so the server responds first. */
const FULL_PLAN_CLIENT_TIMEOUT_MS = 280000;

function getPlanApiBaseUrl(): string {
  const config = getAiConfig();
  return config.apiBaseUrl?.replace(/\/$/, "") || DEFAULT_PLAN_API_BASE;
}

/** Wartezeit einer 429-Antwort: `Retry-After`-Header, sonst `retryAfterSeconds`/`retry_after` im Body. */
function readRetryAfterSeconds(res: Response, rawText: string): number | undefined {
  if (res.status !== 429) return undefined;
  const candidates: unknown[] = [res.headers?.get?.("Retry-After")];
  try {
    const body = JSON.parse(rawText) as { retryAfterSeconds?: unknown; retry_after?: unknown } | null;
    candidates.push(body?.retryAfterSeconds, body?.retry_after);
  } catch {
    // Body ist kein JSON — dann zählt nur der Header.
  }
  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;
    const seconds = Number(candidate);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }
  return undefined;
}

/** `error` aus einem JSON-Fehlerbody, sonst `undefined` (HTML-Fehlerseite, leerer Body). */
function readErrorCode(rawText: string): string | undefined {
  try {
    const body = JSON.parse(rawText) as { error?: unknown } | null;
    return typeof body?.error === "string" && body.error ? body.error : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// fetchFullPlanFromClaude: POST /api/onboarding/generate-plan-full (Plan-Kern oder heutiger Generator, siehe Server)
// ---------------------------------------------------------------------------

export async function fetchFullPlanFromClaude(
  profile: PlanGenerationProfile,
): Promise<FullPlanResult> {
  // eslint-disable-next-line no-console
  console.log("[claude-client] requesting full plan (Option A)...");

  const base = getPlanApiBaseUrl();
  const url = `${base}/api/onboarding/generate-plan-full`;

  try {
    // eslint-disable-next-line no-console
    console.log("[claude-client] full plan client timeout:", FULL_PLAN_CLIENT_TIMEOUT_MS, "ms");
    const authHeaders = await getApiAuthHeaders();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FULL_PLAN_CLIENT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ profile }),
        signal: controller.signal,
      });

      const rawText = await res.text();

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("[claudePlanService] raw response on failure:", rawText);
        const retryAfterSeconds = readRetryAfterSeconds(res, rawText);
        const errorCode = readErrorCode(rawText);
        return {
          plan: null,
          error: `HTTP ${res.status}`,
          status: res.status,
          ...(errorCode ? { errorCode } : {}),
          ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
        };
      }

      let data: { plan?: unknown; error?: string };
      try {
        data = JSON.parse(rawText) as { plan?: unknown; error?: string };
      } catch (parseErr: unknown) {
        // eslint-disable-next-line no-console
        console.error("[claudePlanService] raw response on failure:", rawText);
        const msg = parseErr instanceof Error ? parseErr.message : "JSON parse failed";
        return { plan: null, error: msg, status: res.status };
      }

      if (!data.plan) return { plan: null, error: data.error ?? "no plan returned", status: res.status };

      const normalized = normalizeTrainingPlan(data.plan);
      if (normalized.workouts.length === 0) {
        return {
          plan: null,
          error: data.error ?? "plan normalization yielded empty plan",
          status: res.status,
        };
      }

      return { plan: normalized, status: res.status };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    // eslint-disable-next-line no-console
    console.error("[claude-client] fetchFullPlanFromClaude error:", msg);
    return { plan: null, error: msg };
  }
}
