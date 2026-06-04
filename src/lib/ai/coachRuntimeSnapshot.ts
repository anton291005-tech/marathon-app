import { parseSessionDateLabel, isSessionLogDone } from "../../appSmartFeatures";
import { computePlanAdherenceScore } from "../../coach/adherenceScore";
import type { StoredHealthRun } from "../../healthRuns";
import { storedHealthRunDistanceKmNumeric, storedHealthRunIsRunning } from "../../healthRuns";
import { KNOWN_MY_RACE_STORAGE_KEYS } from "../../persistence/marathonLocalStorageKeys";
import type { AiPlanWeek, AiPlanSession } from "./types";
import { COACH_APP_KNOWLEDGE_VERSION } from "./coachAppKnowledgeBase";
import type { CoachPlatform, CoachRuntimeSnapshot } from "./coachRuntimeSnapshotTypes";

export type { CoachPlatform, CoachRuntimeSnapshot } from "./coachRuntimeSnapshotTypes";

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nextSessionsFromPlan(plan: AiPlanWeek[], now: Date, limit: number): Array<{ date: string; title: string; type: string; km: number }> {
  const today = dayStart(now);
  const all: AiPlanSession[] = plan.flatMap((w) => w.s);
  const upcoming = all
    .filter((s) => {
      const dt = parseSessionDateLabel(s.date);
      return dt && dayStart(dt) >= today && s.type !== "rest";
    })
    .sort((a, b) => {
      const da = parseSessionDateLabel(a.date)?.getTime() ?? 0;
      const db = parseSessionDateLabel(b.date)?.getTime() ?? 0;
      return da - db;
    })
    .slice(0, limit);
  return upcoming.map((s) => ({
    date: `${s.day} ${s.date}`,
    title: s.title,
    type: s.type,
    km: typeof s.km === "number" ? s.km : 0,
  }));
}

export function buildCoachRuntimeSnapshot(args: {
  now: Date;
  platform: CoachPlatform;
  plan: AiPlanWeek[];
  logs: Record<string, any>;
  healthRuns: StoredHealthRun[];
  preferences: { targetTime?: string; maxHeartRateBpm?: number | null };
  raceDateIso: string | null;
  appleHealthConnected: boolean;
  healthKitAvailable: boolean | null;
}): CoachRuntimeSnapshot {
  const { now, platform, plan, logs, healthRuns, preferences, raceDateIso, appleHealthConnected, healthKitAvailable } =
    args;
  const t0 = dayStart(now);
  const tMin = new Date(t0);
  tMin.setDate(tMin.getDate() - 29);

  let completedPlanSessions = 0;
  const flat = plan.flatMap((w) => w.s);
  for (const s of flat) {
    const dt = parseSessionDateLabel(s.date);
    if (!dt || s.type === "rest") continue;
    const sd = dayStart(dt);
    if (sd < tMin || sd > t0) continue;
    if (isSessionLogDone(logs[s.id])) completedPlanSessions += 1;
  }

  let healthRunsRunning = 0;
  let healthRunningKmRounded = 0;
  let healthRunsAll = 0;
  for (const r of healthRuns) {
    const start = new Date(r.startDate);
    if (!Number.isFinite(start.getTime())) continue;
    const sd = dayStart(start);
    if (sd < tMin || sd > t0) continue;
    healthRunsAll += 1;
    if (storedHealthRunIsRunning(r)) {
      healthRunsRunning += 1;
      const km = storedHealthRunDistanceKmNumeric(r);
      if (typeof km === "number" && Number.isFinite(km)) healthRunningKmRounded += km;
    }
  }

  let adherence: CoachRuntimeSnapshot["adherence"] = null;
  try {
    const a = computePlanAdherenceScore({
      plan: plan as any,
      logs,
      healthRuns,
      now,
    });
    adherence = { score: a.score, band: a.band, confidence: a.confidence };
  } catch {
    adherence = null;
  }

  return {
    knowledgeVersion: COACH_APP_KNOWLEDGE_VERSION,
    platform,
    preferences: {
      targetTime: preferences.targetTime,
      maxHeartRateBpm: preferences.maxHeartRateBpm ?? null,
    },
    appleHealth: {
      connected: appleHealthConnected,
      kitAvailable: healthKitAvailable,
    },
    planSummary: {
      weeks: plan.length,
      sessionsTotal: flat.length,
      raceDateIso,
      nextSessions: nextSessionsFromPlan(plan, now, 6),
    },
    adherence,
    last30Days: {
      completedPlanSessions,
      healthRunsAll,
      healthRunsRunning,
      healthRunningKmRounded: Math.round(healthRunningKmRounded * 10) / 10,
      windowLabel: "letzte 30 Tage (lokal, Kalendertage)",
    },
    localStorageKeysHint: [...KNOWN_MY_RACE_STORAGE_KEYS],
  };
}

/** Compact string for prompt injection (avoid huge payloads). */
export function snapshotToPromptBlock(s: CoachRuntimeSnapshot): string {
  return `LAUFZEIT-SNAPSHOT (JSON, für personalisierte Antworten nutzen):\n${JSON.stringify(s)}`;
}
