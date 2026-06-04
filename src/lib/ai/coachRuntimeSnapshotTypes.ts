/**
 * Runtime snapshot types only — no dependency on `types.ts` (breaks types ↔ coachRuntimeSnapshot cycle).
 */

export type CoachPlatform = "ios" | "web" | "android" | "unknown";

export type CoachRuntimeSnapshot = {
  knowledgeVersion: string;
  platform: CoachPlatform;
  preferences: {
    targetTime?: string;
    maxHeartRateBpm?: number | null;
  };
  appleHealth: {
    connected: boolean;
    kitAvailable: boolean | null;
  };
  planSummary: {
    weeks: number;
    sessionsTotal: number;
    raceDateIso: string | null;
    nextSessions: ReadonlyArray<{ readonly date: string; readonly title: string; readonly type: string; readonly km: number }>;
  };
  adherence: {
    score: number;
    band: string;
    confidence: number;
  } | null;
  last30Days: {
    completedPlanSessions: number;
    healthRunsAll: number;
    healthRunsRunning: number;
    healthRunningKmRounded: number;
    windowLabel: string;
  };
  localStorageKeysHint: readonly string[];
};
