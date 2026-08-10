import type { PlanWeek } from "../marathonPrediction";
import { buildTrainingPlanV2FromBasePlan } from "../planV2/fromBasePlan";
import { computeSwapWorkoutsV2Result } from "./computeSwapWorkoutsV2Result";

// Montag 10. Aug .. Freitag 14. Aug 2026 (parseSessionDateLabel default Jahr 2026)
const WEEK: PlanWeek[] = [
  {
    wn: 1,
    phase: "BASE",
    label: "Woche 1",
    dates: "",
    km: 28,
    focus: "",
    s: [
      { id: "mon", day: "Mo", date: "10. Aug", type: "interval", title: "Intervalle", km: 8, desc: "", pace: null },
      { id: "tue", day: "Di", date: "11. Aug", type: "easy", title: "Easy", km: 6, desc: "", pace: null },
      { id: "wed", day: "Mi", date: "12. Aug", type: "interval", title: "Intervalle", km: 8, desc: "", pace: null },
      { id: "thu", day: "Do", date: "13. Aug", type: "easy", title: "Easy", km: 6, desc: "", pace: null },
      { id: "fri", day: "Fr", date: "14. Aug", type: "rest", title: "Ruhetag", km: 0, desc: "", pace: null },
    ],
  },
];

function buildPlan() {
  return buildTrainingPlanV2FromBasePlan(WEEK);
}

describe("computeSwapWorkoutsV2Result", () => {
  test("gleiche id -> ok:false, keine Änderung", () => {
    const plan = buildPlan();
    const result = computeSwapWorkoutsV2Result({ before: plan, sourceId: "tue", targetId: "tue" });
    expect(result).toEqual({ ok: false, message: "Ich habe nichts geändert (ungültige Auswahl)." });
  });

  test("leere id -> ok:false, keine Änderung", () => {
    const plan = buildPlan();
    const result = computeSwapWorkoutsV2Result({ before: plan, sourceId: "", targetId: "tue" });
    expect(result).toEqual({ ok: false, message: "Ich habe nichts geändert (ungültige Auswahl)." });
  });

  test("unbekannte id -> ok:false, 'nicht sicher gefunden'", () => {
    const plan = buildPlan();
    const result = computeSwapWorkoutsV2Result({ before: plan, sourceId: "tue", targetId: "does-not-exist" });
    expect(result).toEqual({ ok: false, message: "Ich konnte die beiden Einheiten nicht sicher finden." });
  });

  test("erfolgreicher Tausch ohne Konflikt -> ok:true, warningText null, Daten getauscht", () => {
    const plan = buildPlan();
    const result = computeSwapWorkoutsV2Result({ before: plan, sourceId: "tue", targetId: "thu" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe("Tausch übernommen.");
    expect(result.warningText).toBeNull();

    const tue = result.after.workouts.find((w) => w.id === "tue");
    const thu = result.after.workouts.find((w) => w.id === "thu");
    expect(tue?.dateIso.slice(0, 10)).toBe("2026-08-13");
    expect(thu?.dateIso.slice(0, 10)).toBe("2026-08-11");
  });

  test("Tausch mit Micro-Structure-Konflikt (zwei Intervalle hintereinander) -> warningText gesetzt", () => {
    const plan = buildPlan();
    // tue<->mon: verschiebt "interval" auf Dienstag, direkt neben Mittwochs-Intervall
    const result = computeSwapWorkoutsV2Result({ before: plan, sourceId: "tue", targetId: "mon" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warningText).not.toBeNull();
    expect(result.warningText).toMatch(/intensiv/i);
  });

  test("Load-Shift-Grenze: Tausch über eine Wochengrenze hinweg erzeugt eine Load-Warnung", () => {
    // Zwei Kalenderwochen (Mo 3.-So 9. Aug / Mo 10.-So 16. Aug), je ein Workout.
    // Der Tausch verschiebt den 30km-Long-Run in die bisher fast leere Woche -> >30% Sprung.
    const twoWeekPlan: PlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "Woche 1",
        dates: "",
        km: 0,
        focus: "",
        // "interval" statt "easy": verhindert, dass validateSwap den Tausch als reines
        // Zone-2-Äquivalent früh durchwinkt, bevor validateLoadShift überhaupt greift.
        s: [{ id: "light", day: "Mo", date: "3. Aug", type: "interval", title: "Intervalle", km: 2, desc: "", pace: null }],
      },
      {
        wn: 2,
        phase: "BASE",
        label: "Woche 2",
        dates: "",
        km: 0,
        focus: "",
        s: [{ id: "heavy", day: "Mo", date: "10. Aug", type: "long", title: "Long Run", km: 30, desc: "", pace: null }],
      },
    ];
    const plan = buildTrainingPlanV2FromBasePlan(twoWeekPlan);
    const result = computeSwapWorkoutsV2Result({ before: plan, sourceId: "light", targetId: "heavy" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warningText).not.toBeNull();
    expect(result.warningText).toMatch(/Wochenbelastung/);
  });

  test("Reason-Mapping bei fehlgeschlagener Integritätsprüfung", () => {
    jest.resetModules();
    jest.doMock("./trainingPlanSwapMutation", () => ({
      trySwapWorkoutDatesInPlan: () => ({ ok: false, reason: "integrity_failed" }),
    }));
    // Re-require nach dem Mock, damit die gemockte Abhängigkeit greift.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { computeSwapWorkoutsV2Result: computeWithMock } = require("./computeSwapWorkoutsV2Result");
    const plan = buildPlan();
    const result = computeWithMock({ before: plan, sourceId: "tue", targetId: "thu" });
    expect(result).toEqual({
      ok: false,
      message: "Ich habe den Tausch abgebrochen (Integritätsprüfung fehlgeschlagen).",
    });
    jest.dontMock("./trainingPlanSwapMutation");
    jest.resetModules();
  });
});
