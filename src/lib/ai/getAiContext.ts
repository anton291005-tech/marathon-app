import { parseSessionDateLabel } from "../../appSmartFeatures";
import type { StoredHealthRun } from "../../healthRuns";
import type { RecoveryDomainState } from "../../recovery/recoveryDomainState";
import type { AiCoachConversationTurn, AiContext, AiPlanSession, AiPlanWeek } from "./types";
import type { TrainingPlanV2 } from "../../planV2/types";
import { getAppNow } from "../../core/time/timeSystem";
import { buildRecoverySummaryFromDomain } from "./recoverySummary";

type BuildAiContextArgs = {
  plan: AiPlanWeek[];
  logs: Record<string, any>;
  targetTime?: string;
  raceDateIso?: string | null;
  availableScreens: AiContext["availableScreens"];
  settings?: Record<string, any>;
  now?: Date;
  planV2?: TrainingPlanV2;
  recoveryDomain?: RecoveryDomainState;
  recoveryDailyRows?: AiContext["recoveryDailyRows"];
  healthRuns?: StoredHealthRun[];
  maxHeartRateBpm?: number | null;
  conversationTurns?: AiCoachConversationTurn[];
};

function inNext14Days(session: AiPlanSession, now: Date): boolean {
  const date = parseSessionDateLabel(session.date);
  if (!date) return false;
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  return diffDays >= 0 && diffDays <= 14;
}

function findRaceDateIso(plan: AiPlanWeek[]): string | null {
  const races = plan
    .flatMap((week) => week.s)
    .filter((session) => session.type === "race")
    .map((session) => parseSessionDateLabel(session.date))
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime());
  return races.length ? races[races.length - 1].toISOString() : null;
}

export function coachStructuredMarkdownAppendix(context: AiContext): string {
  const weeks = context.plan?.length ?? 0;
  const sessions = context.plan?.reduce((n, w) => n + w.s.length, 0) ?? 0;
  return `Plan: ${weeks} Wochen, ${sessions} Einheiten. Nächste 14 Tage: ${context.next14Days.length} Sessions.`;
}

export function toRemoteCoachPayload(context: AiContext) {
  const now = new Date(context.todayIso);
  const nowDate = Number.isFinite(now.getTime()) ? now : getAppNow();
  return {
    todayIso: context.todayIso,
    raceDateIso: context.raceDateIso,
    goals: context.goals,
    maxHeartRateBpm: context.maxHeartRateBpm ?? null,
    recoverySummary: context.recoverySummary ?? null,
    availableScreens: context.availableScreens ?? [],
    conversationTurns: context.conversationTurns ?? [],
    trainingPlan: { source: "display", weeks: context.plan },
    logsLast30Days: sliceLogsLast30Days(context.logs || {}, nowDate),
    healthRunsLast30Days: [...(context.healthRuns || [])],
    recoveryDomain: context.recoveryDomain ?? { domainKind: "initial" as const },
  };
}

export function sortAiPlanSessionsByCalendar<T extends { date: string; id: string }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const da = parseSessionDateLabel(a.date)?.getTime() ?? 0;
    const db = parseSessionDateLabel(b.date)?.getTime() ?? 0;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}

export function sortStoredHealthRunsForAiContext(runs: import("../../healthRuns").StoredHealthRun[]) {
  return [...runs].sort((a, b) => {
    const ta = new Date(a.startDate).getTime();
    const tb = new Date(b.startDate).getTime();
    if (ta !== tb) return ta - tb;
    return a.runId.localeCompare(b.runId);
  });
}

export function sliceLogsLast30Days(
  logs: Record<string, unknown>,
  now: Date,
): Array<{ sessionId: string; log: unknown }> {
  const cutoff = now.getTime() - 30 * 86400000;
  return Object.entries(logs || {})
    .filter(([, log]) => {
      const at = (log as { at?: string })?.at;
      if (!at) return true;
      const t = new Date(at).getTime();
      return Number.isFinite(t) ? t >= cutoff : true;
    })
    .map(([sessionId, log]) => ({ sessionId, log }))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}

export function getAiContext(args: BuildAiContextArgs): AiContext {
  const now = args.now || getAppNow();
  const next14Days = args.plan.flatMap((week) => week.s).filter((session) => inNext14Days(session, now));
  const recoveryDomain = args.recoveryDomain;
  const recoverySummary =
    recoveryDomain && typeof recoveryDomain === "object"
      ? buildRecoverySummaryFromDomain(recoveryDomain)
      : undefined;
  const healthRuns =
    args.healthRuns && args.healthRuns.length > 0
      ? sortStoredHealthRunsForAiContext(args.healthRuns)
      : args.healthRuns;

  return {
    todayIso: now.toISOString(),
    raceDateIso: args.raceDateIso ?? findRaceDateIso(args.plan),
    goals: {
      targetTime: args.targetTime,
    },
    plan: args.plan,
    planV2: args.planV2,
    logs: args.logs,
    next14Days,
    availableScreens: args.availableScreens,
    settings: args.settings || {},
    recoveryDomain,
    recoverySummary,
    recoveryDailyRows: args.recoveryDailyRows,
    healthRuns,
    maxHeartRateBpm: args.maxHeartRateBpm,
    conversationTurns: args.conversationTurns ?? [],
  };
}
