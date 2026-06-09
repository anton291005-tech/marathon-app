import type { AiContext } from "./types";

/**
 * Dev / support: compact, side-effect-free digest of what the remote coach would see.
 * Does not log; safe to call from React devtools or temporary instrumentation.
 */
export function summarizeAiContextForDebug(ctx: AiContext) {
  const logIds = Object.keys(ctx.logs || {}).sort();
  const healthIds = (ctx.healthRuns || []).map((r) => r.runId).sort();
  return {
    todayIso: ctx.todayIso,
    raceDateIso: ctx.raceDateIso,
    logsLast30Count: logIds.length,
    healthRunsLast30Count: healthIds.length,
    logSessionOrder: logIds.join(","),
    healthRunOrder: healthIds.join(","),
    recoveryDomainKind: ctx.recoveryDomain?.domainKind ?? "unknown",
    next14Count: ctx.next14Days.length,
  };
}
