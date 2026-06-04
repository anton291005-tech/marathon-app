/**
 * Hydration boundary for `marathonLogs`: drop non-object rows and non-string keys
 * so Recovery / AI / adherence loops never see silent garbage from corrupted JSON.
 */
export type MarathonLogsMap = Record<string, Record<string, unknown>>;

export function hydrateMarathonLogsFromStorage(parsed: unknown): MarathonLogsMap {
  const out: MarathonLogsMap = {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [sid, row] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof sid !== "string" || !sid.trim()) continue;
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    out[sid] = row as Record<string, unknown>;
  }
  return out;
}
