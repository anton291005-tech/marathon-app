import { parseIntent } from "./parseIntent";
import { resolveConvertWorkoutProposal } from "./resolveConvertWorkoutProposal";
import type { AiContext } from "../../lib/ai/types";
import { toAiPlanWeeks } from "../../lib/ai/planToAi";
import type { PlanWeek } from "../../marathonPrediction";
import { executeAiAction } from "../../lib/ai/actions";
import { getRecoveryDomainState } from "../../recovery/recoveryDomainState";
import {
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "../../recovery/recoveryStorage";
import { buildRecoverySummaryFromDomain } from "../../lib/ai/recoverySummary";
import type { TrainingPlanV2 } from "../../planV2/types";

function coachCtx(planRows: PlanWeek[], todayYmd: string, planV2?: TrainingPlanV2): AiContext {
  const logs = {};
  const pf = JSON.stringify([]) + "|wIdx=0";
  const wf = recoveryWorkoutsVersionFingerprint(logs);
  const hf = recoveryHealthVersionFingerprint([]);
  const [y, m, d] = todayYmd.split("-").map((x) => Number(x));
  const now = new Date(y, m - 1, d, 12, 0, 0);
  const v = recoverySnapshotVersionHash({
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: pf,
  });
  const recoveryDomain = getRecoveryDomainState({
    now,
    plan: planRows,
    logs,
    recoveryDailyRows: [],
    loadStressIdx: 2,
    todayCalendarYmd: todayYmd,
    homeScoreByDay: {},
    snapshotVersion: v,
    recoveryInputVersion: v,
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: pf,
    bootPhaseComplete: true,
  });

  return {
    todayIso: now.toISOString(),
    raceDateIso: new Date(2026, 8, 27, 12, 0, 0).toISOString(),
    goals: { targetTime: "3:15:00" },
    logs,
    plan: toAiPlanWeeks(planRows),
    planV2,
    next14Days: [],
    availableScreens: [{ key: "home", label: "Start" }],
    recoveryDomain,
    recoverySummary: buildRecoverySummaryFromDomain(recoveryDomain),
  };
}

describe("convert workout to run intent", () => {
  const bikePlan: PlanWeek[] = [
    {
      wn: 1,
      phase: "BUILD",
      label: "W1",
      dates: "—",
      km: 40,
      s: [
        {
          id: "bike1",
          day: "Do",
          date: "15. Mai",
          type: "bike",
          title: "Rennrad 60 min",
          km: 0,
          pace: "moderat",
          desc: "Rad",
        },
      ],
    },
  ];

  const planV2: TrainingPlanV2 = {
    version: 2,
    workouts: [
      {
        id: "bike1",
        dateIso: "2026-05-15T12:00:00.000",
        sport: "bike",
        sessionType: "bike",
        title: "Rennrad 60 min",
        km: 0,
        pace: "moderat",
        desc: "Rad",
      },
    ],
    weeks: [
      {
        startIso: "2026-05-11",
        totalKm: 0,
        workouts: [],
      },
    ],
  };

  test("parseIntent routes convert phrases; theoretical questions stay none", () => {
    expect(parseIntent("Ändere das heutige Rennradtraining zu einem äquivalenten Lauftraining").type).toBe(
      "convert_workout_to_run",
    );
    expect(parseIntent("Konvertiere heutiges Rad zu Lauf").type).toBe("convert_workout_to_run");
    expect(parseIntent("Ist Rennrad gut für Marathon?").type).toBe("none");
  });

  test("ambiguous multiple bike sessions on same day asks clarify", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "BUILD",
        label: "W1",
        dates: "—",
        km: 40,
        s: [
          { id: "bike1", day: "Do", date: "15. Mai", type: "bike", title: "Rad 1", km: 0, pace: "", desc: "" },
          { id: "bike2", day: "Do", date: "15. Mai", type: "bike", title: "Rad 2", km: 0, pace: "", desc: "" },
        ],
      },
    ];
    const ctx = coachCtx(plan, "2026-05-15", planV2);
    const res = resolveConvertWorkoutProposal("Konvertiere heutiges Rennrad zu Lauf", ctx);
    expect(res.status).toBe("clarify");
  });

  test("resolveConvertWorkoutProposal builds convert_workout_to_run action", () => {
    const ctx = coachCtx(bikePlan, "2026-05-15", planV2);
    const res = resolveConvertWorkoutProposal(
      "Ändere das heutige Rennradtraining zu einem äquivalenten Lauftraining",
      ctx,
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.sourceSession.sport).toBe("bike");
    expect(res.previewAfter.sport).toBe("run");
    expect(res.action.type).toBe("convert_workout_to_run");
    expect(res.action.payload.sessionId).toBe("bike1");
    expect(res.action.payload.targetSessionType).toBeTruthy();
    expect(Number(res.action.payload.targetKm)).toBeGreaterThan(0);

    const exec = executeAiAction(res.action, ctx);
    expect(exec.planPatches?.length).toBe(1);
    expect(exec.planPatches?.[0].sessionId).toBe("bike1");
    expect(exec.planPatches?.[0].changes.type).toBe(res.action.payload.targetSessionType);
  });
});
