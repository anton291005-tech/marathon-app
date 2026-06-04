import type { AiContext } from "./types";
import { toRemoteCoachPayload } from "./getAiContext";

/**
 * Dev / support: compact, side-effect-free digest of what the remote coach would see.
 * Does not log; safe to call from React devtools or temporary instrumentation.
 */
export function summarizeAiContextForDebug(ctx: AiContext) {
  const remote = toRemoteCoachPayload(ctx);
  const logIds = remote.logsLast30Days.map((e) => e.sessionId);
  const healthIds = remote.healthRunsLast30Days.map((r) => r.runId);
  return {
    todayIso: remote.todayIso,
    raceDateIso: remote.raceDateIso,
    trainingPlanSource: remote.trainingPlan.source,
    logsLast30Count: remote.logsLast30Days.length,
    healthRunsLast30Count: remote.healthRunsLast30Days.length,
    logSessionOrder: logIds.join(","),
    healthRunOrder: healthIds.join(","),
    recoveryDomainKind: remote.recoveryDomain.domainKind,
    next14Count: ctx.next14Days.length,
  };
}
