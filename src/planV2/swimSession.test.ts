// Spec §15.4: Die Normalisierung darf Nicht-Lauf-Typen nie zu Lauf-Typen umdeuten.
// Früher fiel `swim` in mapSessionType auf "easy" zurück → die Schwimm-Einheit wurde zum lockeren Lauf (sport "run").
import { mapSessionType } from "../lib/ai/mapSessionType";
import { normalizePlanSessionToAi } from "../lib/ai/planToAi";
import { normalizeTrainingPlan } from "./normalizeTrainingPlan";
import { toPlanWeeks } from "./toPlanWeeks";

describe("mapSessionType: swim bleibt swim", () => {
  it.each(["swim", "Swim", "  SWIM "])("%j → swim", (input) => {
    expect(mapSessionType(input)).toBe("swim");
  });

  it("bekannte Typen unverändert, Unbekanntes fällt weiter konservativ auf easy", () => {
    expect(mapSessionType("bike")).toBe("bike");
    expect(mapSessionType("strength")).toBe("strength");
    expect(mapSessionType("völlig-unbekannt")).toBe("easy");
  });
});

describe("Schwimm-Einheit durch die Plan-Pipeline", () => {
  const legacyPlan = {
    weeks: [
      {
        wn: 1,
        s: [
          { id: "swim-1", day: "Di", date: "10. Nov", dateIso: "2026-11-10", type: "swim", title: "Schwimmen", km: 0 },
          { id: "run-1", day: "Do", date: "12. Nov", dateIso: "2026-11-12", type: "easy", title: "Lockerer Lauf", km: 8 },
        ],
      },
    ],
  };

  it("normalizeTrainingPlan: Sportart und Typ bleiben swim", () => {
    const plan = normalizeTrainingPlan(legacyPlan as never);
    const swim = plan.weeks.flatMap((w) => w.workouts).find((w) => w.id === "swim-1");
    expect(swim?.sport).toBe("swim");
    expect(swim?.sessionType).toBe("swim");
  });

  it("toPlanWeeks → normalizePlanSessionToAi: type bleibt swim, der Lauf daneben easy", () => {
    const weeks = toPlanWeeks(normalizeTrainingPlan(legacyPlan as never));
    const sessions = weeks.flatMap((w) => w.s).map((s) => normalizePlanSessionToAi(s));
    expect(sessions.find((s) => s.id === "swim-1")?.type).toBe("swim");
    expect(sessions.find((s) => s.id === "run-1")?.type).toBe("easy");
  });
});
