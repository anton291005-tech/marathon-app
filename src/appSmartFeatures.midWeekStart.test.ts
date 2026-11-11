// Regression: Plan startet mitten in der Woche (Sa 07.11.), Woche 1 ist nur Sa–So, danach Mo–So-Wochen.
// Früher: Woche = floor(Tage seit frühester Session / 7) + 1 → Mo–Fr der Folgewoche (Tag 2–6) blieben „Woche 1“,
// der Woche-Tab öffnete am Mi 11.11. auf Woche 1, während Heute/Übersicht korrekt „Woche 2“ zeigten.

import { resolveCurrentPlanWeekIndex } from "./appSmartFeatures";

const session = (id: string, dateIso: string, day: string) => ({ id, date: dateIso, dateIso, day, type: "easy", km: 8 });

const PLAN = [
  { wn: 1, s: [session("a", "2026-11-07", "Sa"), session("b", "2026-11-08", "So")] },
  { wn: 2, s: [session("c", "2026-11-09", "Mo"), session("d", "2026-11-12", "Do"), session("e", "2026-11-15", "So")] },
  { wn: 3, s: [session("f", "2026-11-16", "Mo"), session("g", "2026-11-22", "So")] },
];

const at = (ymd: string) => new Date(`${ymd}T12:00:00+01:00`);

describe("resolveCurrentPlanWeekIndex: Planstart mitten in der Woche", () => {
  test.each([
    ["2026-11-07", 0], // Sa, Planstart
    ["2026-11-08", 0], // So, Ende Woche 1
    ["2026-11-09", 1], // Mo, Woche 2
    ["2026-11-11", 1], // Mi, Woche 2 (der gemeldete Fall)
    ["2026-11-13", 1], // Fr, Woche 2
    ["2026-11-14", 1], // Sa, Woche 2
    ["2026-11-15", 1], // So, Ende Woche 2
    ["2026-11-16", 2], // Mo, Woche 3
    ["2026-11-22", 2], // So, Ende Woche 3
  ])("%s → Index %i", (ymd, expected) => {
    expect(resolveCurrentPlanWeekIndex(PLAN, at(ymd))).toBe(expected);
  });

  test("vor Planstart → Woche 1, nach Planende → letzte Woche", () => {
    expect(resolveCurrentPlanWeekIndex(PLAN, at("2026-11-02"))).toBe(0);
    expect(resolveCurrentPlanWeekIndex(PLAN, at("2026-12-20"))).toBe(2);
  });

  test("Plan startet am Montag: unverändert", () => {
    const monPlan = [
      { wn: 1, s: [session("m1", "2026-11-09", "Mo"), session("m2", "2026-11-15", "So")] },
      { wn: 2, s: [session("m3", "2026-11-16", "Mo")] },
    ];
    expect(resolveCurrentPlanWeekIndex(monPlan, at("2026-11-11"))).toBe(0);
    expect(resolveCurrentPlanWeekIndex(monPlan, at("2026-11-16"))).toBe(1);
  });
});
