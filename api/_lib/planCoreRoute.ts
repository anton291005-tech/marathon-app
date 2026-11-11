/**
 * Plan-Kern im Vercel-Handler `POST /api/onboarding/generate-plan-full` (Umbauplan Schritt 10).
 *
 * Schalter `PLAN_CORE_MODE`:
 * - `off` (Standard, auch bei leer/unbekannt): nur der heutige Generator.
 * - `shadow`: Antwort vom heutigen Generator, der Kern rechnet daneben und loggt nur Codes und Kennzahlen.
 *   v3: nicht für Production, nur Preview/Rückweg.
 * - `on`: Kern-Plan, wenn er 0 errors hat; sonst Rückfall auf den heutigen Generator (bis Schritt 13) mit Zähler.
 *
 * Logs enthalten nie Nutzerinhalte: keine Daten, keine Texte, nur Codes, Feldnamen, Zähler und Kennzahlen.
 */

import { CONFIG_VERSION, EMPTY_RULES, buildCheckedPlan, isPlanCoreError, profileToCoreInputs, toLogEntries } from "../../src/planCore";
import type { CorePlan, MappingFailure, MappingNote, PlanProfile, Ymd } from "../../src/planCore";
import { planMetrics, type PlanMetrics } from "./planMetrics";

export type PlanCoreMode = "off" | "shadow" | "on";

export function readPlanCoreMode(raw: unknown): PlanCoreMode {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return value === "on" || value === "shadow" ? value : "off";
}

export type FallbackReason = MappingFailure | "plan-too-short" | "invalid-input" | "invariant" | "exception";

type LogViolation = ReturnType<typeof toLogEntries>[number];

export type CoreLog = {
  configVersion: string;
  durationMs: number;
  reason?: FallbackReason;
  /** Feldnamen bei fehlenden/ungültigen Eingaben. */
  fields?: string[];
  notes?: MappingNote[];
  errors?: number;
  warnings?: number;
  /** Nur die errors: Code, Regel, Woche, Schwere. */
  violations?: LogViolation[];
  metrics?: PlanMetrics;
};

export type CoreAttempt =
  | { status: "ok"; plan: CorePlan; log: CoreLog }
  | { status: "fallback"; reason: FallbackReason; log: CoreLog };

export function attemptCorePlan(profile: PlanProfile, todayYmd: Ymd, nowMs: () => number = Date.now): CoreAttempt {
  const started = nowMs();
  const base = (): CoreLog => ({ configVersion: CONFIG_VERSION, durationMs: nowMs() - started });

  const mapped = profileToCoreInputs(profile, todayYmd);
  if (!mapped.ok) {
    return { status: "fallback", reason: mapped.reason, log: { ...base(), reason: mapped.reason, fields: mapped.fields } };
  }
  const notes = mapped.notes.length ? { notes: mapped.notes } : {};

  try {
    const { plan, check } = buildCheckedPlan(mapped.inputs, EMPTY_RULES, todayYmd);
    const metrics = planMetrics(plan);
    if (check.errors > 0) {
      const violations = toLogEntries(check.violations.filter((v) => v.severity === "error"));
      return {
        status: "fallback",
        reason: "invariant",
        log: { ...base(), reason: "invariant", ...notes, errors: check.errors, warnings: check.warnings, violations, metrics },
      };
    }
    return { status: "ok", plan, log: { ...base(), ...notes, errors: 0, warnings: check.warnings, metrics } };
  } catch (error) {
    const reason: FallbackReason = isPlanCoreError(error) ? error.code : "exception";
    return { status: "fallback", reason, log: { ...base(), reason, ...notes } };
  }
}

/** Antwort, wenn der Kern wegen error keinen Plan liefert und auch der Rückfall scheitert. */
export function coreFailureBody(attempt: CoreAttempt): Record<string, unknown> | null {
  if (attempt.status !== "fallback" || attempt.reason !== "invariant") return null;
  return {
    error: "plan-core-invariant",
    configVersion: attempt.log.configVersion,
    errors: attempt.log.errors ?? 0,
    warnings: attempt.log.warnings ?? 0,
    violations: attempt.log.violations ?? [],
  };
}

export type PlanCoreEvent = "core-plan" | "fallback" | "legacy-inputs" | "shadow" | "no-ai-consent";

/**
 * Eine Logzeile je Ereignis, als JSON hinter `[plan-core]`. `planCoreFallbacks: 1` markiert jeden Rückfall im Modus
 * `on` (Kennzahl für die Auswertung); ein alter Client ohne Plan-Eingaben ist kein Rückfall (`legacy-inputs`).
 */
export function logPlanCore(event: PlanCoreEvent, mode: PlanCoreMode, log: CoreLog, extra: Record<string, unknown> = {}): void {
  const line = { event, mode, ...log, ...(event === "fallback" ? { planCoreFallbacks: 1 } : {}), ...extra };
  // eslint-disable-next-line no-console
  console.log(`[plan-core] ${JSON.stringify(line)}`);
}
