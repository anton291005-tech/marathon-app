import {
  formatRecoverySevenDayWindowYmds,
  formatSleepHoursAvg,
  interpret7dTrainingLoad,
  meanFiniteNumbers,
} from "./recoveryRuntimePresentation";

describe("recoveryRuntimePresentation", () => {
  const anchor = new Date("2026-05-15T12:00:00.000Z");

  it("formatRecoverySevenDayWindowYmds matches legacy 7-day inclusive window for a valid YMD", () => {
    expect(formatRecoverySevenDayWindowYmds("2026-05-15", anchor)).toEqual([
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ]);
  });

  it("meanFiniteNumbers mirrors prior mean() helper on mixed inputs", () => {
    expect(meanFiniteNumbers([1, 2, NaN, "x" as unknown as number])).toBe(1.5);
    expect(meanFiniteNumbers([])).toBeNull();
  });

  it("formatSleepHoursAvg matches prior outputs", () => {
    expect(formatSleepHoursAvg(1.25)).toBe("1h 15m");
    expect(formatSleepHoursAvg(0.5)).toBe("30m");
    expect(formatSleepHoursAvg(2)).toBe("2h");
  });

  it("interpret7dTrainingLoad thresholds unchanged", () => {
    expect(interpret7dTrainingLoad(0, 0)).toBe("Keine Trainingsdaten in den letzten 7 Tagen");
    expect(interpret7dTrainingLoad(27, 1)).toBe("Geringe Trainingsbelastung in den letzten 7 Tagen");
    expect(interpret7dTrainingLoad(28, 2)).toBe("Moderate Trainingsbelastung mit ausreichenden Erholungstagen");
    expect(interpret7dTrainingLoad(60, 4)).toBe("Moderat erhöhte Trainingsbelastung durch regelmäßige Einheiten");
    expect(interpret7dTrainingLoad(95, 6)).toBe("Deutlich erhöhte Trainingsbelastung durch sehr regelmäßige Einheiten");
  });
});
