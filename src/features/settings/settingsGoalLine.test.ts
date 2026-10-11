import { buildSettingsGoalLine, daysUntilRace, formatRaceCountdown } from "./settingsGoalLine";

describe("daysUntilRace", () => {
  test("zählt Kalendertage, auch über Monats-, Jahres- und Sommerzeitgrenzen", () => {
    expect(daysUntilRace("2026-12-01", "2026-10-11")).toBe(51);
    expect(daysUntilRace("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntilRace("2026-10-26", "2026-10-24")).toBe(2);
    expect(daysUntilRace("2026-10-11", "2026-10-11")).toBe(0);
    expect(daysUntilRace("2026-10-10", "2026-10-11")).toBe(-1);
  });

  test("fehlende oder ungültige Daten → null", () => {
    expect(daysUntilRace(null, "2026-10-11")).toBeNull();
    expect(daysUntilRace("2026-12-01", undefined)).toBeNull();
    expect(daysUntilRace("27. Sep", "2026-10-11")).toBeNull();
  });
});

describe("formatRaceCountdown", () => {
  test("Numerus und Sonderfälle", () => {
    expect(formatRaceCountdown(51)).toBe("noch 51 Tage");
    expect(formatRaceCountdown(1)).toBe("noch 1 Tag");
    expect(formatRaceCountdown(0)).toBe("heute");
    expect(formatRaceCountdown(-3)).toBe("Rennen vorbei");
  });
});

describe("buildSettingsGoalLine", () => {
  const base = { raceYmd: "2026-12-01", todayYmd: "2026-10-11" };

  test("Distanz · Countdown · Zielzeit", () => {
    expect(buildSettingsGoalLine({ ...base, distanceLabel: "Marathon", raceGoal: "time", targetTime: "2:50:00" })).toBe(
      "Marathon · noch 51 Tage · Ziel 2:50:00",
    );
  });

  test("Finish-Ziel zeigt keine Zeit, auch wenn eine gespeichert ist", () => {
    expect(buildSettingsGoalLine({ ...base, distanceLabel: "Halbmarathon", raceGoal: "finish", targetTime: "1:45:00" })).toBe(
      "Halbmarathon · noch 51 Tage · Ziel: Finishen",
    );
  });

  test("fehlende Teile entfallen", () => {
    expect(buildSettingsGoalLine({ ...base, distanceLabel: "  ", targetTime: "" })).toBe("Rennen · noch 51 Tage");
    expect(buildSettingsGoalLine({ ...base, targetTime: " 3:30:00 " })).toBe("Rennen · noch 51 Tage · Ziel 3:30:00");
  });

  test("ohne Renndatum kein aktives Ziel", () => {
    expect(buildSettingsGoalLine({ raceYmd: null, todayYmd: "2026-10-11", distanceLabel: "Marathon" })).toBeNull();
  });
});
