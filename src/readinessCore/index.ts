/**
 * Öffentliche Schnittstelle des Readiness-Kerns („Tagesform“, docs/readiness-spec.md, docs/readiness-plan.md).
 * Stand Schritt 1: nur Typen und Config, noch nicht verdrahtet. Die Logik kommt mit den Schritten 5–10.
 */

export * from "./types";
export { CONFIG, CONFIG_VERSION } from "./config";
export type { Param, ParamSource, Range, ReadinessConfig } from "./config";

/** Platzhalter, damit Server und App den Import schon prüfen können (Plan Schritt 1). */
export const READINESS_CORE_PING = "readiness-core" as const;
