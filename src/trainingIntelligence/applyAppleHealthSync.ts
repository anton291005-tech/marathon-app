/**
 * Merge Apple Health runs into logs (running sessions only). Pure: returns next logs or same reference if unchanged.
 */

import type { PlanSession, SessionLog } from "../marathonPrediction";
import type { StoredHealthRun } from "../healthRuns";
import { decideRunningCompletion } from "./completionDecision";
import { evaluateRun } from "./evaluateRun";
import {
  evaluationStatusLabel,
  generateRunEvaluationFeedback,
} from "./generateRunEvaluationFeedback";
import { matchRunToPlannedSession } from "./matchRunToPlannedSession";
import { normalizeAppleHealthRun } from "./normalizeAppleHealthRun";
import type { NormalizedAppleRun } from "./types";

export type AppleHealthSyncResult = {
  logs: Record<string, SessionLog>;
  changed: boolean;
};

function shallowLogNeedsUpdate(prev: SessionLog | undefined, next: SessionLog): boolean {
  const pa = JSON.stringify(prev ?? {});
  const pb = JSON.stringify(next);
  return pa !== pb;
}

/**
 * @param planSessions - typically ACTIVE_SESSIONS (flat list)
 * @param maxAgeDays - only consider recent runs (default 10)
 */
export function applyAppleHealthTrainingSync(args: {
  healthRuns: StoredHealthRun[];
  planSessions: PlanSession[];
  logs: Record<string, SessionLog>;
  now?: Date;
  maxAgeDays?: number;
}): AppleHealthSyncResult {
  const now = args.now ?? new Date();
  const maxAgeDays = args.maxAgeDays ?? 10;
  const cutoff = now.getTime() - maxAgeDays * 86400000;

  let next: Record<string, SessionLog> = { ...args.logs };
  let changed = false;

  const bySession = new Map<string, PlanSession>();
  for (const s of args.planSessions) {
    bySession.set(s.id, s);
  }

  const pairs: { stored: StoredHealthRun; norm: NormalizedAppleRun }[] = [];
  for (const stored of args.healthRuns) {
    const t = new Date(stored.startDate).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const norm = normalizeAppleHealthRun(stored);
    console.log("Normalized run:", norm);
    pairs.push({ stored, norm });
  }
  pairs.sort((a, b) => b.norm.startTime - a.norm.startTime);

  const touchedSessionIds = new Set<string>();

  for (const { stored, norm: run } of pairs) {
    const match = matchRunToPlannedSession(run, args.planSessions);
    console.log("Match:", match);
    if (!match.matched || !match.plannedSessionId) continue;

    const session = bySession.get(match.plannedSessionId);
    if (!session) continue;

    if (touchedSessionIds.has(session.id)) continue;

    const evaluation = evaluateRun(session, run);
    console.log("Evaluation:", evaluation);

    const decision = decideRunningCompletion(session, match, evaluation);
    console.log("Completion:", decision);

    if (!decision.shouldWrite) continue;

    const prev = next[session.id] ?? {};
    if (prev.assignedRun?.runId && prev.assignedRun.runId !== run.id) {
      continue;
    }

    const verdict = generateRunEvaluationFeedback(evaluation);
    const label = evaluationStatusLabel(evaluation);
    const evalBlock = {
      status: verdict.category,
      label,
      feedback: verdict.text,
      distanceDeltaKm: evaluation.distanceDeltaKm,
      updatedAt: new Date().toISOString(),
    };

    let merged: SessionLog;

    if (decision.reason === "suggest_only") {
      if (prev.assignedRun?.runId) continue;
      merged = {
        ...prev,
        suggestedHealthRunId: run.id,
        runEvaluation: evalBlock,
      };
    } else {
      const km = (stored.distanceMeters || 0) / 1000;
      merged = {
        ...prev,
        suggestedHealthRunId: undefined,
        assignedRun: {
          runId: stored.runId,
          startDate: stored.startDate,
          duration: stored.duration,
          distanceKm: Math.round(km * 100) / 100,
          ...(run.avgHeartRate !== null ? { avgHeartRateBpm: run.avgHeartRate } : {}),
        },
        ...(decision.setDone ? { done: true, skipped: false, at: new Date().toISOString() } : {}),
        runEvaluation: evalBlock,
      };
    }

    if (shallowLogNeedsUpdate(prev, merged)) {
      next = { ...next, [session.id]: merged };
      changed = true;
      touchedSessionIds.add(session.id);
    }
  }

  return { logs: changed ? next : args.logs, changed };
}
