import { WEEKLY_KM_RANGES } from "./marathonPreferencesOnboarding";
import {
  defaultLongRunDay,
  formatYmdGermanWithWeekday,
  longestRunError,
  parseKmInput,
  raceDateTooEarlyMessage,
  readPlanInputsFromPreferences,
  sortWeekdays,
  toProfilePlanInputs,
  trainingWeekError,
  weeklyKmError,
  weeklyKmRangeFromKm,
  type OnboardingPlanInputs,
} from "./onboardingPlanInputs";

const deterministicGenerator = require("../../api/_lib/deterministicPlanGenerator");

describe("weeklyKmRangeFromKm (Kompatibilität mit dem heutigen Pfad)", () => {
  it("Obergrenze inklusive: an jeder Grenze die niedrigere Spanne", () => {
    expect(weeklyKmRangeFromKm(0)).toBe("0–20 km");
    expect(weeklyKmRangeFromKm(19.9)).toBe("0–20 km");
    expect(weeklyKmRangeFromKm(20)).toBe("0–20 km");
    expect(weeklyKmRangeFromKm(20.1)).toBe("20–40 km");
    expect(weeklyKmRangeFromKm(35)).toBe("20–40 km");
    expect(weeklyKmRangeFromKm(40)).toBe("20–40 km");
    expect(weeklyKmRangeFromKm(41)).toBe("40–60 km");
    expect(weeklyKmRangeFromKm(60)).toBe("40–60 km");
    expect(weeklyKmRangeFromKm(61)).toBe("60–80 km");
    expect(weeklyKmRangeFromKm(80)).toBe("60–80 km");
    expect(weeklyKmRangeFromKm(80.5)).toBe("80+ km");
    expect(weeklyKmRangeFromKm(150)).toBe("80+ km");
  });

  it("liefert nur Texte, die der Wizard bisher angeboten hat (zeichengleich, mit Halbgeviertstrich)", () => {
    for (let km = 0; km <= 150; km += 0.5) {
      expect(WEEKLY_KM_RANGES).toContain(weeklyKmRangeFromKm(km));
    }
  });

  it("der alte Generator erkennt jede abgeleitete Spanne, und bis 80 km liegt die Zahl nie über seinem Deckel", () => {
    const { parseWeeklyKmRangeMax, parseWeeklyKmTarget } = deterministicGenerator;
    // Ohne erkannte Spanne fällt der alte Parser auf 50 bzw. 60 zurück; erkannt heißt: das Paar passt zur Spanne.
    const expected: Record<string, [number, number]> = {
      "0–20 km": [15, 20],
      "20–40 km": [30, 40],
      "40–60 km": [50, 60],
      "60–80 km": [70, 80],
      "80+ km": [90, 90],
    };
    const overCap: number[] = [];
    for (let km = 0; km <= 150; km += 0.5) {
      const range = weeklyKmRangeFromKm(km);
      expect([parseWeeklyKmTarget(range), parseWeeklyKmRangeMax(range)]).toEqual(expected[range]);
      if (km > parseWeeklyKmRangeMax(range)) overCap.push(km);
    }
    // Über dem Deckel liegen nur Werte der offenen Spanne „80+“ (Deckel 90, freigegeben 2026-11-03).
    expect(overCap.filter((km) => km <= 90)).toEqual([]);
    expect(overCap.every((km) => weeklyKmRangeFromKm(km) === "80+ km")).toBe(true);
  });
});

describe("Eingaben prüfen", () => {
  it("parseKmInput: Komma und Punkt, eine Nachkommastelle, sonst null", () => {
    expect(parseKmInput("35")).toBe(35);
    expect(parseKmInput(" 35,5 ")).toBe(35.5);
    expect(parseKmInput("12.34")).toBe(12.3);
    expect(parseKmInput("0")).toBe(0);
    expect(parseKmInput("")).toBeNull();
    expect(parseKmInput("-3")).toBeNull();
    expect(parseKmInput("abc")).toBeNull();
    expect(parseKmInput("1e3")).toBeNull();
  });

  it("Wochen-km: Pflicht, 0–150", () => {
    expect(weeklyKmError("")).toBe("Bitte deine Wochen-km eingeben.");
    expect(weeklyKmError("viel")).toBe("Bitte eine Zahl eingeben, z. B. 25.");
    expect(weeklyKmError("151")).toBe("Höchstens 150 km pro Woche.");
    expect(weeklyKmError("0")).toBeNull();
    expect(weeklyKmError("150")).toBeNull();
  });

  it("längster Lauf: optional, 0–45", () => {
    expect(longestRunError("")).toBeNull();
    expect(longestRunError("  ")).toBeNull();
    expect(longestRunError("46")).toBe("Höchstens 45 km.");
    expect(longestRunError("x")).toBe("Bitte eine Zahl eingeben, z. B. 12.");
    expect(longestRunError("45")).toBeNull();
  });

  it("Trainingswoche: Lauftage gewählt, genug Tage, Long-Run-Tag unter den Tagen", () => {
    expect(trainingWeekError(null, ["Mo", "Mi", "Fr"], "Fr")).toMatch(/wie vielen Tagen/);
    expect(trainingWeekError(4, ["Mo", "Mi", "Fr"], "Fr")).toBe("Wähle mindestens 4 Tage, an denen du laufen kannst.");
    expect(trainingWeekError(3, ["Mo", "Mi", "Fr"], "So")).toBe("Der Long-Run-Tag muss einer deiner Lauftage sein.");
    expect(trainingWeekError(3, ["Mo", "Mi", "Fr"], null)).toBe("Der Long-Run-Tag muss einer deiner Lauftage sein.");
    expect(trainingWeekError(3, ["Mo", "Mi", "Fr"], "Fr")).toBeNull();
  });

  it("Long-Run-Tag-Vorgabe wie im Kern: So, sonst Sa, sonst der letzte verfügbare Tag", () => {
    expect(defaultLongRunDay(["Mo", "Sa", "So"])).toBe("So");
    expect(defaultLongRunDay(["Mo", "Sa"])).toBe("Sa");
    expect(defaultLongRunDay(["Mo", "Mi", "Do"])).toBe("Do");
    expect(defaultLongRunDay([])).toBeNull();
  });

  it("sortWeekdays: Mo–So, ohne Unbekanntes", () => {
    expect(sortWeekdays(["So", "Mo", "Xx", "Mi", "Mo"])).toEqual(["Mo", "Mi", "So"]);
  });
});

describe("Mindest-Planlänge (§4)", () => {
  const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

  it("10 km ab Mittwoch, 11.11.2026: frühestes Renndatum Mo, 07.12.2026", () => {
    expect(raceDateTooEarlyMessage("10k", local(2026, 11, 11), local(2026, 12, 6))).toBe(
      "Für einen 10-km-Plan brauchst du mindestens 5 Trainingswochen. Frühestes Renndatum: Mo, 07.12.2026.",
    );
    expect(raceDateTooEarlyMessage("10k", local(2026, 11, 11), local(2026, 12, 7))).toBeNull();
  });

  it("Marathon ab Montag, 9.11.2026: 8 Wochen, frühestens Mo, 28.12.2026", () => {
    expect(raceDateTooEarlyMessage("m", local(2026, 11, 9), local(2026, 12, 27))).toBe(
      "Für einen Marathon-Plan brauchst du mindestens 8 Trainingswochen. Frühestes Renndatum: Mo, 28.12.2026.",
    );
    expect(raceDateTooEarlyMessage("m", local(2026, 11, 9), local(2026, 12, 28))).toBeNull();
  });

  it("5k und HM nennen ihre Mindestwochen", () => {
    expect(raceDateTooEarlyMessage("5k", local(2026, 11, 9), local(2026, 11, 20))).toMatch(/5-km-Plan .* 4 Trainingswochen/);
    expect(raceDateTooEarlyMessage("hm", local(2026, 11, 9), local(2026, 11, 20))).toMatch(/Halbmarathon-Plan .* 6 Trainingswochen/);
  });

  it("formatYmdGermanWithWeekday", () => {
    expect(formatYmdGermanWithWeekday("2026-12-07")).toBe("Mo, 07.12.2026");
    expect(formatYmdGermanWithWeekday("2027-03-14")).toBe("So, 14.03.2027");
  });
});

describe("toProfilePlanInputs", () => {
  const inputs: OnboardingPlanInputs = {
    runDaysPerWeek: 4,
    availableDays: ["So", "Mo", "Mi", "Fr"],
    longRunDay: "So",
    currentWeeklyKm: 35,
    longestRecentRunKm: null,
    recentRace: null,
  };

  it("ohne längsten Lauf: Standardwert nach Distanz und Lauftagen, als Standard markiert", () => {
    expect(toProfilePlanInputs(inputs, "hm")).toEqual({
      runDaysPerWeek: 4,
      availableDays: ["Mo", "Mi", "Fr", "So"],
      longRunDay: "So",
      currentWeeklyKm: 35,
      longestRecentRunKm: 10,
      longestRecentRunKmIsDefault: true,
      recentRace: null,
    });
    expect(toProfilePlanInputs(inputs, "m").longestRecentRunKm).toBe(12);
  });

  it("mit Angabe: die Angabe, auch 0", () => {
    expect(toProfilePlanInputs({ ...inputs, longestRecentRunKm: 14 }, "m")).toMatchObject({
      longestRecentRunKm: 14,
      longestRecentRunKmIsDefault: false,
    });
    expect(toProfilePlanInputs({ ...inputs, longestRecentRunKm: 0 }, "m")).toMatchObject({
      longestRecentRunKm: 0,
      longestRecentRunKmIsDefault: false,
    });
  });
});

describe("readPlanInputsFromPreferences (Vorausfüllen für Bestandsnutzer)", () => {
  const stored: OnboardingPlanInputs = {
    runDaysPerWeek: 5,
    availableDays: ["Mo", "Di", "Do", "Sa", "So"],
    longRunDay: "Sa",
    currentWeeklyKm: 42.5,
    longestRecentRunKm: 16,
    recentRace: { distanceKm: 21.1, timeSeconds: 6300, dateYmd: "2026-09-27", estimated: false },
  };

  it("liest gespeicherte Eingaben vollständig", () => {
    expect(readPlanInputsFromPreferences({ planInputs: stored })).toEqual(stored);
  });

  it("ohne gespeicherte Eingaben (alter Plan, neues Gerät): null", () => {
    expect(readPlanInputsFromPreferences({})).toBeNull();
    expect(readPlanInputsFromPreferences(null)).toBeNull();
    expect(readPlanInputsFromPreferences({ planInputs: "x" })).toBeNull();
    expect(readPlanInputsFromPreferences({ planInputs: {} })).toBeNull();
  });

  it("ungültige Teile fallen einzeln weg", () => {
    const out = readPlanInputsFromPreferences({
      planInputs: {
        ...stored,
        runDaysPerWeek: 7,
        currentWeeklyKm: 999,
        longRunDay: "Xx",
        recentRace: { distanceKm: 15, timeSeconds: 4000, dateYmd: null, estimated: true },
      },
    });
    expect(out).toEqual({ availableDays: stored.availableDays, longestRecentRunKm: 16 });
  });

  it("Schätzung nur für 5/10 km; Wettkampf braucht ein Datum; null bleibt null", () => {
    expect(
      readPlanInputsFromPreferences({ planInputs: { recentRace: { distanceKm: 10, timeSeconds: 2900, dateYmd: null, estimated: true } } }),
    ).toEqual({ recentRace: { distanceKm: 10, timeSeconds: 2900, dateYmd: null, estimated: true } });
    expect(
      readPlanInputsFromPreferences({ planInputs: { recentRace: { distanceKm: 42.2, timeSeconds: 14000, dateYmd: null, estimated: true } } }),
    ).toBeNull();
    expect(
      readPlanInputsFromPreferences({ planInputs: { recentRace: { distanceKm: 10, timeSeconds: 2900, dateYmd: null, estimated: false } } }),
    ).toBeNull();
    expect(readPlanInputsFromPreferences({ planInputs: { recentRace: null, longestRecentRunKm: null } })).toEqual({
      recentRace: null,
      longestRecentRunKm: null,
    });
  });
});
