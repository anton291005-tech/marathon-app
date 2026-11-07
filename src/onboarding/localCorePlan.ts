/**
 * Plan aus dem Plan-Kern direkt in der App (Umbauplan Schritt 11): ersetzt den früheren „vereinfachten Plan“.
 * Läuft automatisch, wenn der Server nicht antwortet (Netzwerkfehler, Timeout, 5xx). Gleiche Übersetzung der Eingaben
 * (`profileToCoreInputs`) und gleicher Kern wie der Server im Modus `on`, ohne Netz und ohne Claude.
 */

import { EMPTY_RULES, buildCheckedPlan, isPlanCoreError, profileToCoreInputs } from "../planCore";
import type { CorePlan, PlanProfile, Ymd } from "../planCore";

export type LocalCorePlanResult =
  /** Plan ohne error. */
  | { status: "ok"; plan: CorePlan; warnings: number }
  /** Mit diesen Angaben kein sicherer Plan (Verstoß, Plan zu kurz, ungültige Eingabe): Angaben ändern. */
  | { status: "rejected"; reason: "invariant" | "plan-too-short" | "invalid-input"; errors: number }
  /** Eingaben fehlen oder passen nicht zum Kern (z. B. andere Distanz): kein lokaler Plan möglich. */
  | { status: "unavailable"; reason: string };

export function buildLocalCorePlan(profile: PlanProfile, todayYmd: Ymd): LocalCorePlanResult {
  const mapped = profileToCoreInputs(profile, todayYmd);
  if (!mapped.ok) return { status: "unavailable", reason: mapped.reason };
  try {
    const { plan, check } = buildCheckedPlan(mapped.inputs, EMPTY_RULES, todayYmd);
    if (check.errors > 0) return { status: "rejected", reason: "invariant", errors: check.errors };
    return { status: "ok", plan, warnings: check.warnings };
  } catch (error) {
    if (isPlanCoreError(error)) return { status: "rejected", reason: error.code, errors: 0 };
    return { status: "unavailable", reason: "exception" };
  }
}
