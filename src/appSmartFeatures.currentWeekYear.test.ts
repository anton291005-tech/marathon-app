// Regression: „aktuelle Woche“ bei Plänen über den Jahreswechsel. Das Session-Label („3. Jan“) hat kein
// Jahr; früher wurde es fest als 2026 gelesen, das früheste Datum rutschte auf Januar 2026 und die Ansicht
// sprang auf die letzte Planwoche („Woche 17 · Taper“ statt Woche 1). `dateIso` trägt das echte Jahr.

import { deriveDisplayPlan } from "./displayPlan/deriveDisplayPlan";
import { buildLocalCorePlan } from "./onboarding/localCorePlan";
import { normalizeTrainingPlan } from "./planV2/normalizeTrainingPlan";
import { planEarliestSessionYmd, resolveCurrentPlanWeekIndex } from "./appSmartFeatures";
import { wizardProfileOf } from "./testSupport/planCoreComparison";

const TODAY = "2026-11-07"; // Samstag
const NOW = new Date("2026-11-07T10:00:00+01:00");
const ALL_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function displayPlanOf(inputs: Record<string, unknown>) {
  const profile = wizardProfileOf({ ...inputs, startYmd: TODAY, availableDays: [...ALL_DAYS] } as never);
  const res = buildLocalCorePlan(profile, TODAY);
  if (res.status !== "ok") throw new Error(`Kern-Plan nicht erzeugt: ${JSON.stringify(res)}`);
  return deriveDisplayPlan(normalizeTrainingPlan(res.plan as never), []);
}

const MARATHON_UEBER_NEUJAHR = {
  distance: "m",
  runDaysPerWeek: 4,
  currentWeeklyKm: 35,
  goalTime: 14400,
  raceDate: "2027-02-28",
  recentRace: { distanceKm: 21.1, timeSeconds: 6900, dateYmd: null, estimated: false },
};
const ZEHN_K_UEBER_NEUJAHR = {
  distance: "10k",
  runDaysPerWeek: 3,
  currentWeeklyKm: 25,
  raceDate: "2027-01-17",
  recentRace: { distanceKm: 10, timeSeconds: 3720, dateYmd: null, estimated: true },
};
const ZEHN_K_GLEICHES_JAHR = { ...ZEHN_K_UEBER_NEUJAHR, raceDate: "2026-12-13" };

describe("resolveCurrentPlanWeekIndex: Plan über den Jahreswechsel", () => {
  test("Marathon bis 28.02.2027, Start Sa 07.11.2026, heute 07.11.2026 → Woche 1", () => {
    const plan = displayPlanOf(MARATHON_UEBER_NEUJAHR);
    expect(plan).toHaveLength(17);
    expect(planEarliestSessionYmd(plan)).toBe("2026-11-07");
    expect(resolveCurrentPlanWeekIndex(plan, NOW)).toBe(0);
  });

  test("10k bis 17.01.2027, Start Sa 07.11.2026, heute 07.11.2026 → Woche 1", () => {
    const plan = displayPlanOf(ZEHN_K_UEBER_NEUJAHR);
    expect(plan).toHaveLength(11);
    expect(planEarliestSessionYmd(plan)).toBe("2026-11-07");
    expect(resolveCurrentPlanWeekIndex(plan, NOW)).toBe(0);
  });

  test("später im Plan, auch hinter Neujahr, trifft die richtige Woche", () => {
    const plan = displayPlanOf(MARATHON_UEBER_NEUJAHR);
    // Woche 1 = 07.–08.11., danach Mo-Wochen: 07.11. + 7·k Tage → Woche k+1.
    expect(resolveCurrentPlanWeekIndex(plan, new Date("2026-12-12T10:00:00+01:00"))).toBe(5);
    expect(resolveCurrentPlanWeekIndex(plan, new Date("2027-01-09T10:00:00+01:00"))).toBe(9);
    expect(resolveCurrentPlanWeekIndex(plan, new Date("2027-02-28T10:00:00+01:00"))).toBe(16);
  });

  test("Gegenprobe im selben Jahr: 10k bis 13.12.2026 → Woche 1", () => {
    const plan = displayPlanOf(ZEHN_K_GLEICHES_JAHR);
    expect(planEarliestSessionYmd(plan)).toBe("2026-11-07");
    expect(resolveCurrentPlanWeekIndex(plan, NOW)).toBe(0);
  });
});

describe("Altplan ohne dateIso: Label mit planYear, wie bisher", () => {
  const altPlan = [
    { wn: 1, s: [{ id: "a", date: "2. Nov", day: "Mo", type: "easy", km: 8 }, { id: "b", date: "8. Nov", day: "So", type: "long", km: 14 }] },
    { wn: 2, s: [{ id: "c", date: "9. Nov", day: "Mo", type: "easy", km: 8 }, { id: "d", date: "15. Nov", day: "So", type: "long", km: 16 }] },
    { wn: 3, s: [{ id: "e", date: "16. Nov", day: "Mo", type: "easy", km: 8 }, { id: "f", date: "22. Nov", day: "So", type: "long", km: 18 }] },
  ];

  test("früheste Session aus dem Label mit planYear 2026", () => {
    expect(planEarliestSessionYmd(altPlan)).toBe("2026-11-02");
    expect(planEarliestSessionYmd(altPlan, 2027)).toBe("2027-11-02");
  });

  test("Wochenindex wie bisher", () => {
    expect(resolveCurrentPlanWeekIndex(altPlan, new Date("2026-11-02T10:00:00+01:00"))).toBe(0);
    expect(resolveCurrentPlanWeekIndex(altPlan, new Date("2026-11-10T10:00:00+01:00"))).toBe(1);
    expect(resolveCurrentPlanWeekIndex(altPlan, new Date("2026-11-20T10:00:00+01:00"))).toBe(2);
    expect(resolveCurrentPlanWeekIndex(altPlan, new Date("2026-10-01T10:00:00+01:00"))).toBe(0);
  });

  test("dateIso hat Vorrang vor dem Label, wenn beides da ist", () => {
    const mixed = [{ wn: 1, s: [{ id: "x", date: "5. Jan", dateIso: "2027-01-05", day: "Di", type: "easy", km: 8 }] }];
    expect(planEarliestSessionYmd(mixed)).toBe("2027-01-05");
  });
});
