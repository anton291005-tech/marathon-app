import { parseIntent } from "./parseIntent";
import { extractReplaceWorkoutIntent, looksLikeReplaceWorkoutIntent } from "./extractReplaceWorkoutIntent";
import { resolveReplaceWorkoutProposal } from "./resolveReplaceWorkoutProposal";
import { calendarIsoFromSession } from "../../lib/ai/buildReplacementWorkout";
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

function coachCtx(planRows: PlanWeek[], todayYmd: string): AiContext {
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
    next14Days: [],
    availableScreens: [{ key: "home", label: "Start" }],
    recoveryDomain,
    recoverySummary: buildRecoverySummaryFromDomain(recoveryDomain),
  };
}

describe("replace workout intent", () => {
  test("parseIntent routes explicit German replace before swap", () => {
    expect(parseIntent("Ersetze das heutige Rennrad mit einem 10km Easy Run").type).toBe("replace_workout");
    expect(parseIntent("tausche training von heute und morgen").type).toBe("swap_workouts");
  });

  test("looksLikeReplaceWorkoutIntent detects implicit bike→run preference", () => {
    const l =
      "ich will heute lieber laufen statt rad fahren"
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    expect(looksLikeReplaceWorkoutIntent(l)).toBe(true);
  });

  test("resolveReplaceWorkoutProposal builds bike→easy patch payload", () => {
    const plan: PlanWeek[] = [
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
    const ctx = coachCtx(plan, "2026-05-15");
    const res = resolveReplaceWorkoutProposal(
      "Ersetze das heutige Rennrad-Training mit einem 10km Easy Run",
      ctx,
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.previewAfter.type).toBe("easy");
    expect(res.previewAfter.km).toBe(10);
    expect(res.action.type).toBe("replace_workout");

    const exec = executeAiAction(res.action, ctx);
    expect(exec.planPatches?.length).toBe(1);
    expect(exec.planPatches?.[0].sessionId).toBe("bike1");
  });

  test("ambiguous interval in 7d window asks which day", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "BUILD",
        label: "W1",
        dates: "—",
        km: 40,
        s: [
          { id: "e1", day: "Di", date: "17. Mai", type: "easy", title: "Easy", km: 8, pace: "", desc: "" },
          { id: "i1", day: "Mi", date: "18. Mai", type: "interval", title: "Int", km: 11, pace: "", desc: "" },
          { id: "i2", day: "Do", date: "19. Mai", type: "interval", title: "Int2", km: 12, pace: "", desc: "" },
        ],
      },
    ];
    const ctx = coachCtx(plan, "2026-05-17");
    const res = resolveReplaceWorkoutProposal("Ersetze das Intervalltraining mit einem Easy Run", ctx);
    expect(res.status).toBe("clarify");
    if (res.status !== "clarify") return;
    expect(res.text).toMatch(/welches meinst du/i);
  });

  test("German calendar date resolves to correct day", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "BUILD",
        label: "W1",
        dates: "—",
        km: 40,
        s: [
          { id: "t1", day: "Mi", date: "20. Mai", type: "tempo", title: "T", km: 12, pace: "", desc: "" },
        ],
      },
    ];
    const ctx = coachCtx(plan, "2026-05-15");
    const raw = "Ersetze das Training vom 20. Mai mit einem Tempo Run";
    const iso = calendarIsoFromSession(ctx.plan.flatMap((w) => w.s)[0]!);
    expect(iso).toBe("2026-05-20");
    const ext = extractReplaceWorkoutIntent(raw, {
      todayIso: ctx.todayIso,
    });
    expect(ext.sourceIsoHint?.startsWith("2026-05-20")).toBe(true);
    const res = resolveReplaceWorkoutProposal(
      "Ersetze das Training vom 20. Mai mit einem Tempo Run",
      ctx,
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.sourceDateIso.startsWith("2026-05-20")).toBe(true);
    expect(res.previewAfter.type).toBe("tempo");
  });
});
