import { generateMarathonPlanV2ToRace, type AiPlanRules } from "./coachPlanMutations";

function findRaceWorkout(plan: ReturnType<typeof generateMarathonPlanV2ToRace>) {
  return plan.workouts.find((w) => w.sessionType === "race");
}

function maxLongRunKm(plan: ReturnType<typeof generateMarathonPlanV2ToRace>): number {
  return plan.workouts
    .filter((w) => w.sessionType === "long")
    .reduce((max, w) => Math.max(max, w.km), 0);
}

function tuesdaySessions(plan: ReturnType<typeof generateMarathonPlanV2ToRace>) {
  return plan.workouts.filter((w) => new Date(w.dateIso).getDay() === 2);
}

function fridaySessions(plan: ReturnType<typeof generateMarathonPlanV2ToRace>) {
  return plan.workouts.filter((w) => new Date(w.dateIso).getDay() === 5);
}

function trainingSessions(plan: ReturnType<typeof generateMarathonPlanV2ToRace>) {
  return plan.workouts.filter((w) => w.sessionType !== "rest" && w.sessionType !== "race");
}

function maxTrainingDaysInAnyWeek(plan: ReturnType<typeof generateMarathonPlanV2ToRace>): number {
  const byWeek = new Map<string, number>();
  for (const w of trainingSessions(plan)) {
    const d = new Date(w.dateIso);
    const mon = new Date(d);
    const dow = mon.getDay();
    mon.setDate(mon.getDate() - ((dow + 6) % 7));
    const key = mon.toISOString().slice(0, 10);
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
  }
  const counts = Array.from(byWeek.values());
  return counts.length ? Math.max(...counts) : 0;
}

function trainingWeekKm(plan: ReturnType<typeof generateMarathonPlanV2ToRace>, weekNumber: number): number {
  const week = plan.weeks.find((w) => w.meta?.wn === weekNumber);
  if (!week) return 0;
  return week.workouts
    .filter((w) => w.sessionType !== "rest" && w.sessionType !== "race" && w.km > 0)
    .reduce((sum, w) => sum + w.km, 0);
}

describe("generateMarathonPlanV2ToRace distance/volume/rest", () => {
  const start = new Date(2026, 0, 5, 12, 0, 0);
  const race = new Date(2026, 5, 14, 12, 0, 0);

  test("10 km + 20–40 km + rest Tuesday", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "time", 10, "20–40 km", 2);
    const raceW = findRaceWorkout(plan);
    expect(raceW?.title).toBe("🏁 10 km");
    expect(raceW?.km).toBe(10);
    expect(maxLongRunKm(plan)).toBeLessThanOrEqual(18);
    expect(tuesdaySessions(plan).every((w) => w.sessionType === "rest")).toBe(true);
  });

  test("marathon + 60–80 km", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "time", 42.2, "60–80 km");
    const raceW = findRaceWorkout(plan);
    expect(raceW?.title).toBe("🏁 Marathon");
    expect(raceW?.km).toBe(42.2);
    expect(maxLongRunKm(plan)).toBeLessThanOrEqual(32);
  });

  test("half marathon + default volume", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "time", 21.1, "40–60 km");
    const raceW = findRaceWorkout(plan);
    expect(raceW?.title).toBe("🏁 Halbmarathon");
    expect(raceW?.km).toBe(21.1);
    expect(maxLongRunKm(plan)).toBeLessThanOrEqual(26);
  });

  test("legacy call without new params still produces marathon race", () => {
    const plan = generateMarathonPlanV2ToRace(start, race);
    expect(findRaceWorkout(plan)?.km).toBe(42.2);
  });

  test("10 km finish + 20–40 km: Tuesday rest when explicitly requested", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "finish", 10, "20–40 km", 2);
    expect(tuesdaySessions(plan).every((w) => w.sessionType === "rest")).toBe(true);
    const easyKm = plan.workouts.filter((w) => w.sessionType === "easy").map((w) => w.km);
    expect(easyKm.every((km) => km === 0 || km >= 5)).toBe(true);
  });

  test("10 km finish without explicit rest day uses distance pattern", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "finish", 10, "20–40 km");
    expect(maxTrainingDaysInAnyWeek(plan)).toBeLessThanOrEqual(4);
  });

  test("half marathon time: Friday not blanket rest (only Monday in pattern)", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "time", 21.1);
    const fridays = fridaySessions(plan).filter((w) => w.sessionType !== "race");
    expect(fridays.some((w) => w.sessionType !== "rest")).toBe(true);
  });

  test("marathon time + 60–80 km: higher weekly training load", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "time", 42.2, "60–80 km");
    expect(maxTrainingDaysInAnyWeek(plan)).toBeGreaterThanOrEqual(5);
    expect(findRaceWorkout(plan)?.km).toBe(42.2);
  });

  test("AI rules: Tuesday rest and Wednesday strength across full plan", () => {
    const aiRules: AiPlanRules = {
      restDays: [2],
      strengthDays: [3],
      longRunDay: 0,
      intervalDay: 4,
      tempoDay: 6,
      weeklyKmMultiplier: 0.8,
    };
    const plan = generateMarathonPlanV2ToRace(
      start,
      race,
      "finish",
      10,
      "20–40 km",
      undefined,
      aiRules,
    );
    expect(tuesdaySessions(plan).every((w) => w.sessionType === "rest")).toBe(true);
    expect(
      plan.workouts
        .filter((w) => new Date(w.dateIso).getDay() === 3 && w.sessionType !== "race")
        .every((w) => w.sessionType === "strength"),
    ).toBe(true);
  });

  test("4-week volume wave: every 4th week is recovery with lower km", () => {
    const plan = generateMarathonPlanV2ToRace(start, race, "time", 42.2);
    const recoveryWeeks = plan.weeks.filter((w) => w.meta?.isRecoveryWeek);
    expect(recoveryWeeks.length).toBeGreaterThan(0);
    expect(recoveryWeeks.every((w) => w.meta?.focus?.includes("Entlastungswoche"))).toBe(true);

    const w3 = trainingWeekKm(plan, 3);
    const w4 = trainingWeekKm(plan, 4);
    expect(w4).toBeLessThan(w3);
  });
});
