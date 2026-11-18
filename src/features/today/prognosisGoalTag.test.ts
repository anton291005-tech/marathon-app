import { prognosisGoalTag } from "./prognosisGoalTag";

const h = (hh: number, mm = 0, ss = 0) => hh * 3600 + mm * 60 + ss;

describe("prognosisGoalTag", () => {
  it("Ziel 4:00:00, Prognose 3:52:10 → Bezug auf das eigene Ziel, nie auf Sub-3h", () => {
    const tag = prognosisGoalTag(h(3, 52, 10), h(4));
    expect(tag).toBe("8 min unter deinem Ziel");
    expect(tag).not.toMatch(/Sub-3/);
  });
  it("knapp über dem Ziel (bis 5 min) und deutlich darüber", () => {
    expect(prognosisGoalTag(h(4, 3), h(4))).toBe("knapp an deinem Ziel");
    expect(prognosisGoalTag(h(4, 20), h(4))).toBe("20 min über deinem Ziel");
  });
  it("gilt für jede Distanz (10 km in 0:45:00)", () => {
    expect(prognosisGoalTag(46 * 60 + 40, 45 * 60)).toBe("knapp an deinem Ziel");
    expect(prognosisGoalTag(44 * 60, 45 * 60)).toBe("1 min unter deinem Ziel");
  });
  it("ohne Zielzeit oder ohne Prognose kein Zusatz", () => {
    expect(prognosisGoalTag(h(3, 52), null)).toBeNull();
    expect(prognosisGoalTag(h(3, 52), 0)).toBeNull();
    expect(prognosisGoalTag(null, h(4))).toBeNull();
  });
});
