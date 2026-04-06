import { parseSessionDateLabel } from "../../appSmartFeatures";
import type { AiContext, AiPlanSession, AiPlanWeek } from "./types";

type BuildAiContextArgs = {
  plan: AiPlanWeek[];
  logs: Record<string, any>;
  targetTime?: string;
  raceDateIso?: string | null;
  availableScreens: AiContext["availableScreens"];
  settings?: Record<string, any>;
  now?: Date;
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

export function getAiContext(args: BuildAiContextArgs): AiContext {
  const now = args.now || new Date();
  const next14Days = args.plan.flatMap((week) => week.s).filter((session) => inNext14Days(session, now));
  return {
    todayIso: now.toISOString(),
    raceDateIso: args.raceDateIso ?? findRaceDateIso(args.plan),
    goals: {
      targetTime: args.targetTime,
    },
    plan: args.plan,
    logs: args.logs,
    next14Days,
    availableScreens: args.availableScreens,
    settings: args.settings || {},
  };
}
