/** Woher die Session-RPE einer Einheit stammt (Migration 021, `session_logs.rpe_source`). */
export type RpeSource = "watch_user" | "watch_estimated" | "manual";

export const RPE_SOURCES: readonly RpeSource[] = ["watch_user", "watch_estimated", "manual"];

export function isRpeSource(value: unknown): value is RpeSource {
  return typeof value === "string" && (RPE_SOURCES as readonly string[]).indexOf(value) >= 0;
}
