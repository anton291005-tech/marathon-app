import {
  buildSettingsGoalLine,
  daysUntilRace,
  formatRaceCountdown,
  formatRaceDistanceLabel,
  preferencesDescribeActivePlan,
} from "./settingsGoalLine";

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

describe("formatRaceDistanceLabel", () => {
  test("Standarddistanzen mit Namen, alles andere in km mit Komma", () => {
    expect(formatRaceDistanceLabel(42.2)).toBe("Marathon");
    expect(formatRaceDistanceLabel(42.195)).toBe("Marathon");
    expect(formatRaceDistanceLabel(21.1)).toBe("Halbmarathon");
    expect(formatRaceDistanceLabel(10)).toBe("10 km");
    expect(formatRaceDistanceLabel(7.5)).toBe("7,5 km");
    expect(formatRaceDistanceLabel(0)).toBeNull();
    expect(formatRaceDistanceLabel(null)).toBeNull();
  });
});

describe("preferencesDescribeActivePlan", () => {
  test("fremde Preferences zählen nie", () => {
    expect(preferencesDescribeActivePlan({ preferencesOwned: false, planRaceDistanceKm: 10, preferencesDistanceKm: 10 })).toBe(false);
  });

  test("widersprechende Distanz entlarvt Preferences eines anderen Plans", () => {
    expect(preferencesDescribeActivePlan({ preferencesOwned: true, planRaceDistanceKm: 10, preferencesDistanceKm: 42.2 })).toBe(false);
    expect(preferencesDescribeActivePlan({ preferencesOwned: true, planRaceDistanceKm: 42.2, preferencesDistanceKm: 42.195 })).toBe(true);
  });

  test("ohne Vergleichswert entscheidet die Plan-Bindung", () => {
    expect(preferencesDescribeActivePlan({ preferencesOwned: true, planRaceDistanceKm: null, preferencesDistanceKm: 42.2 })).toBe(true);
    expect(preferencesDescribeActivePlan({ preferencesOwned: true, planRaceDistanceKm: 10, preferencesDistanceKm: null })).toBe(true);
  });
});

describe("buildSettingsGoalLine", () => {
  const base = { raceYmd: "2026-12-01", todayYmd: "2026-10-11" };
  const marathonPrefs = { raceDistanceKm: 42.2, raceDistanceLabel: "Marathon (42,2 km)", raceGoal: "time", targetTime: "2:50:00" };

  test("Distanz · Countdown · Zielzeit, wenn die Preferences zum Plan gehören", () => {
    expect(
      buildSettingsGoalLine({ ...base, planRaceDistanceKm: 42.2, preferences: marathonPrefs, preferencesOwned: true }),
    ).toBe("Marathon · noch 51 Tage · Ziel 2:50:00");
  });

  test("Web-Test Schritt 1: aktiver Plan 10 km, Preferences noch vom Marathon → Distanz aus dem Plan, kein fremdes Ziel", () => {
    const line = buildSettingsGoalLine({
      ...base,
      planRaceDistanceKm: 10,
      preferences: { ...marathonPrefs, raceGoal: "finish", targetTime: "" },
      preferencesOwned: true,
    });
    expect(line).toBe("10 km · noch 51 Tage");
    expect(line).not.toContain("Marathon");
    expect(line).not.toContain("Finishen");
  });

  test("Preferences eines anderen Plans liefern auch bei gleicher Distanz kein Ziel", () => {
    expect(
      buildSettingsGoalLine({ ...base, planRaceDistanceKm: 42.2, preferences: marathonPrefs, preferencesOwned: false }),
    ).toBe("Marathon · noch 51 Tage");
  });

  test("Zeile folgt dem Zielzeit-Feld: eingetragene Zeit schlägt das Finish-Ziel", () => {
    const prefs = { raceDistanceKm: 21.1, raceGoal: "finish", targetTime: "1:45:00" };
    expect(buildSettingsGoalLine({ ...base, planRaceDistanceKm: 21.1, preferences: prefs, preferencesOwned: true })).toBe(
      "Halbmarathon · noch 51 Tage · Ziel 1:45:00",
    );
  });

  test(`„Ziel: Finishen“ nur bei Finish-Ziel UND leerem Zielzeit-Feld`, () => {
    const finish = { raceDistanceKm: 21.1, raceGoal: "finish", targetTime: null };
    expect(buildSettingsGoalLine({ ...base, planRaceDistanceKm: 21.1, preferences: finish, preferencesOwned: true })).toBe(
      "Halbmarathon · noch 51 Tage · Ziel: Finishen",
    );
    const noGoal = { raceDistanceKm: 21.1, raceGoal: "time", targetTime: "  " };
    expect(buildSettingsGoalLine({ ...base, planRaceDistanceKm: 21.1, preferences: noGoal, preferencesOwned: true })).toBe(
      "Halbmarathon · noch 51 Tage",
    );
  });

  test(`ohne Plan-km: Label der zugehörigen Preferences, sonst neutral „Rennen“`, () => {
    expect(
      buildSettingsGoalLine({ ...base, planRaceDistanceKm: null, preferences: { raceDistanceLabel: "Leadville 100" }, preferencesOwned: true }),
    ).toBe("Leadville 100 · noch 51 Tage");
    expect(
      buildSettingsGoalLine({ ...base, planRaceDistanceKm: null, preferences: { raceDistanceLabel: "Leadville 100" }, preferencesOwned: false }),
    ).toBe("Rennen · noch 51 Tage");
    expect(buildSettingsGoalLine({ ...base, planRaceDistanceKm: null, preferences: null, preferencesOwned: true })).toBe(
      "Rennen · noch 51 Tage",
    );
  });

  test("ohne Renntag im Plan kein aktives Ziel", () => {
    expect(
      buildSettingsGoalLine({ raceYmd: null, todayYmd: "2026-10-11", planRaceDistanceKm: 42.2, preferences: marathonPrefs, preferencesOwned: true }),
    ).toBeNull();
  });
});
