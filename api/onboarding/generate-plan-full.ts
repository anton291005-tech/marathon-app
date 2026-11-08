/**
 * Vercel serverless function: POST /api/onboarding/generate-plan-full
 *
 * Antwort `{ plan: TrainingPlanV2, … }`. Wer den Plan erzeugt, steuert `PLAN_CORE_MODE` (`api/_lib/planCoreRoute.ts`):
 * - `off` (Standard): heutiger Generator (Claude in Phasen: Struktur-Aufruf, dann je Phase).
 * - `shadow`: heutiger Generator; der Plan-Kern rechnet daneben, geloggt werden nur Codes und Kennzahlen.
 * - `on`: Plan-Kern ohne Claude-Aufruf; bei error oder unbrauchbaren Eingaben Rückfall auf den heutigen Generator.
 *
 * Der heutige Generator bekommt das Profil immer ohne die Plan-Eingaben (`legacyPlanProfile`): sein Struktur-Aufruf
 * schickt das Profil als JSON an Claude, der Pfad soll bis zum Löschen (Schritt 13) unverändert bleiben.
 */

import { berlinTodayYmd } from "../_lib/planCoreMapping";
import { attemptCorePlan, coreFailureBody, logPlanCore, readPlanCoreMode, type CoreAttempt } from "../_lib/planCoreRoute";
import { planMetrics } from "../_lib/planMetrics";

const Anthropic = require("@anthropic-ai/sdk");
const { handleCorsPreflight } = require("../_lib/cors");
const { guardRequest, sendGuardFailure } = require("../_lib/apiGuard");
const { validatePlanBody, legacyPlanProfile } = require("../_lib/inputLimits");
const { generateFullPlanByPhases } = require("../_lib/phasedFullPlanGenerator");

type Req = { method?: string; headers?: Record<string, unknown>; body?: unknown };
type Res = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => Res;
  json: (body: unknown) => Res;
};

function errorMessage(err: unknown): string {
  return err instanceof Error && typeof err.message === "string" ? err.message : "unknown";
}

/** 500: bei einem Kern-Verstoß mit maschinenlesbarem Code, sonst wie bisher ohne Details. */
function failure(res: Res, attempt: CoreAttempt | null): Res {
  return res.status(500).json((attempt && coreFailureBody(attempt)) ?? { error: "Plan generation failed" });
}

async function handler(req: Req, res: Res): Promise<unknown> {
  if (handleCorsPreflight(req, res)) return undefined;

  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Nur im Modus `on` darf ein Kern-Verstoß in der 500-Antwort stehen (der Kern hätte den Plan geliefert).
  let onAttempt: CoreAttempt | null = null;
  try {
    const guard = await guardRequest(req, {
      validate: (body: unknown) => validatePlanBody(body, { enforceMaxDuration: true }),
      bucket: "plan_full",
    });
    if (!guard.ok) return sendGuardFailure(res, guard);
    const profile = guard.payload.profile as Record<string, unknown>;

    const mode = readPlanCoreMode(process.env.PLAN_CORE_MODE);
    const attempt = mode === "off" ? null : attemptCorePlan(profile, berlinTodayYmd(new Date()));
    if (attempt) {
      if (mode === "on") {
        onAttempt = attempt;
        if (attempt.status === "ok") {
          logPlanCore("core-plan", mode, attempt.log);
          return res.status(200).json({ plan: attempt.plan, source: "plan-core", configVersion: attempt.log.configVersion });
        }
        logPlanCore(attempt.reason === "inputs-missing" ? "legacy-inputs" : "fallback", mode, attempt.log);
      }
    }

    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      const coreBody = onAttempt ? coreFailureBody(onAttempt) : null;
      return res.status(500).json(coreBody ?? { error: "ANTHROPIC_API_KEY missing" });
    }

    console.log("[API] POST /onboarding/generate-plan-full called (phased Option A)");

    const client = new Anthropic({ apiKey: key });
    const { plan, diagnostics, totalDurationMs } = await generateFullPlanByPhases(client, legacyPlanProfile(profile));

    if (mode === "shadow" && attempt) {
      // Kennzahlen nur fürs Log: ein Fehler hier darf den fertigen Plan nie in eine 500 verwandeln.
      try {
        logPlanCore("shadow", mode, attempt.log, { status: attempt.status, legacyMetrics: planMetrics(plan ?? {}) });
      } catch (err) {
        logPlanCore("shadow", mode, attempt.log, { status: attempt.status, legacyMetrics: null });
      }
    }
    if (totalDurationMs > 180000) {
      console.warn(`[api/onboarding/generate-plan-full] total duration ${totalDurationMs}ms exceeds 3 minutes`);
    }

    return res.status(200).json({ plan, diagnostics, totalDurationMs });
  } catch (err) {
    console.error("[api/onboarding/generate-plan-full] error:", errorMessage(err));
    return failure(res, onAttempt);
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 240,
};
