// Regression Stufe C (Forecasts/Prognosen): Plan Sa 07.11.2026 → So 28.02.2027. Die Prognosen lasen das Label
// ("20. Dez") mit dem Jahr von `now`. Am 10.01.2027 wurden damit die Dezember-Läufe zu Dez 2027 (Zukunft) und
// fielen aus der Pace-/Longrun-Datenbasis; am 30.12.2026 lag der 1.–3. Januar im Jahr 2026 und fehlte in der
// laufenden Woche. `dateIso` trägt das echte Jahr.

import { computeMarathonForecast } from "./marathonForecast";
import { computePaceBasedPrediction, computeWeekPlanCompletionPercent } from "./lib/ai/coachRacePrediction";
import { getTrainingWindowData } from "./marathonPrediction";
import type { PlanSession, PlanWeek, SessionLog } from "./marathonPrediction";
import { buildYearBoundaryPlan, sessionForYmd } from "./testSupport/yearBoundaryPlan";

const at = (iso: string) => new Date(`${iso}T10:00:00+01:00`);

/** Plan mit 3 Läufen im Dezember 2026 (10 km in 50:00, Long Runs 20 km in 1:50:00), alle erledigt. */
function planWithDecemberRuns() {
  const plan: PlanWeek[] = buildYearBoundaryPlan();
  const logs: Record<string, SessionLog> = {};
  const mark = (ymd: string, overrides: Partial<PlanSession>, km: number, durationSec: number) => {
    for (const week of plan) {
      const i = week.s.findIndex((s) => s.dateIso === ymd);
      if (i >= 0) week.s[i] = sessionForYmd(ymd, overrides);
    }
    logs[`s-${ymd}`] = {
      done: true,
      actualKm: String(km),
      assignedRun: { runId: `run-${ymd}`, distanceKm: km, duration: durationSec } as never,
    };
  };
  mark("2026-12-06", { type: "long", km: 20 }, 20, 6600);
  mark("2026-12-13", { type: "long", km: 20 }, 20, 6600);
  mark("2026-12-20", { type: "long", km: 22 }, 22, 7260);
  mark("2026-12-22", { type: "easy", km: 10 }, 10, 3000);
  mark("2026-12-29", { type: "easy", km: 10 }, 10, 3000);
  return { plan, logs };
}

describe("Stufe C — computeMarathonForecast über Neujahr", () => {
  test("10.01.2027: Dezember-Läufe liegen in der Vergangenheit und zählen als Pace-Samples und längster Longrun", () => {
    const { plan, logs } = planWithDecemberRuns();
    const f = computeMarathonForecast({ plan, logs, healthRuns: [], now: at("2027-01-10") });
    expect(f.paceSampleCount).toBe(5);
    expect(f.maxLongRunKm).toBe(22);
    expect(f.ready).toBe(true);
  });

  test("30.12.2026: laufende Woche (Mo 28.12.–So 03.01.) umfasst 01.–03.01.2027 → Volumen-Adhärenz 26/58 km", () => {
    const { plan, logs } = planWithDecemberRuns();
    // Geplant in der Woche: 28.12. 8, 29.12. 10 (Fixture), 30.12. 8, 31.12. 8, 01.–03.01. je 8 = 58 km.
    // Erledigt: 28.12. (8), 29.12. (10, aus planWithDecemberRuns), 30.12. (8) = 26 km.
    for (const ymd of ["2026-12-28", "2026-12-30"]) {
      logs[`s-${ymd}`] = { done: true, actualKm: "8" };
    }
    const f = computeMarathonForecast({ plan, logs, healthRuns: [], now: at("2026-12-30") });
    expect(f.weeklyVolumeAdherence).toBeCloseTo(26 / 58, 3);
  });
});

describe("Stufe C — getTrainingWindowData / Trainingsfenster", () => {
  test("10.01.2027: Fenster enthält Sessions bis 10.01.2027 und die Dezember-Sessions", () => {
    const { plan, logs } = planWithDecemberRuns();
    const entries = getTrainingWindowData(plan, logs, at("2027-01-10"));
    const days = entries.map((e) => e.session.dateIso!).sort();
    expect(days[days.length - 1]).toBe("2027-01-10");
    expect(days).toContain("2026-12-29");
    expect(days).not.toContain("2027-01-11");
  });
});

describe("Stufe C — Coach-Rennprognose (coachRacePrediction)", () => {
  test("computePaceBasedPrediction am 10.01.2027 nutzt die Dezember-Longruns", () => {
    const { plan, logs } = planWithDecemberRuns();
    const context = { todayIso: at("2027-01-10").toISOString(), plan, logs, healthRuns: [] } as never;
    const prediction = computePaceBasedPrediction(context);
    expect(prediction).not.toBeNull();
    expect(prediction!.dataPointsUsed).toBeGreaterThanOrEqual(2);
  });

  test("computeWeekPlanCompletionPercent am So 03.01.2027: die Woche Mo 28.12.–So 03.01. zählt 7 fällige Sessions", () => {
    const { plan } = planWithDecemberRuns();
    const logs: Record<string, SessionLog> = {
      "s-2026-12-28": { done: true },
      "s-2026-12-29": { done: true },
      "s-2027-01-01": { done: true },
    };
    const context = { todayIso: at("2027-01-03").toISOString(), plan, logs } as never;
    // Mit dem Dezember-Label im Jahr von `now` (2027) fielen 28.–31.12. aus der Woche: 1 von 3 = 33 %.
    expect(computeWeekPlanCompletionPercent(context, at("2027-01-03"))).toBe(Math.round((3 / 7) * 100));
  });
});
