import {
  computeDayCapacityScore,
  computeSessionDayFitScore,
  isPhysicalLoadConflict,
  isPhysicalLoadTitle,
  PHYSICAL_LOAD_DAY_FIT_SCORE,
  PHYSICAL_LOAD_TITLE_KEYWORDS,
  type DayCapacityScore,
} from "./capacityScore";
import { MIN_FIT_SCORE_THRESHOLD } from "../ai/mutations/assignSessionToBestCapacityDay";
import type { RecurringScheduleBlock, OneOffScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";

function capacity(score: number): DayCapacityScore {
  return {
    dateIso: "2026-08-10",
    isWeekend: false,
    windowMinutes: 960,
    busyMinutes: Math.round((1 - score) * 960),
    freeMinutes: Math.round(score * 960),
    capacityScore: score,
    isFullyBooked: score === 0,
    isFullyFree: score === 1,
    physicalLoadBlockTitles: [],
  };
}

function recurring(overrides: Partial<RecurringScheduleBlock>): RecurringScheduleBlock {
  return {
    id: "r1",
    title: "Job",
    category: "job",
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    source: "manual",
    isRecurring: true,
    dayOfWeek: 1, // Montag
    recurrenceStartDate: null,
    recurrenceEndDate: null,
    ...overrides,
  };
}

function oneOff(overrides: Partial<OneOffScheduleBlock>): OneOffScheduleBlock {
  return {
    id: "o1",
    title: "Termin",
    category: "other",
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    source: "manual",
    isRecurring: false,
    specificDate: "2026-08-10",
    ...overrides,
  };
}

describe("computeDayCapacityScore", () => {
  // 2026-08-10 is a Monday (dayOfWeek=1), 2026-08-15 is a Saturday (dayOfWeek=6)

  test("komplett freier Tag → capacityScore 1, isFullyFree true", () => {
    const result = computeDayCapacityScore("2026-08-10", []);
    expect(result.capacityScore).toBe(1);
    expect(result.isFullyFree).toBe(true);
    expect(result.isFullyBooked).toBe(false);
    expect(result.busyMinutes).toBe(0);
  });

  test("voll ausgebuchter Tag → capacityScore 0, isFullyBooked true", () => {
    const blocks = [recurring({ startTime: "06:00", endTime: "22:00" })];
    const result = computeDayCapacityScore("2026-08-10", blocks);
    expect(result.capacityScore).toBe(0);
    expect(result.isFullyBooked).toBe(true);
    expect(result.isFullyFree).toBe(false);
  });

  test("Teilverfügbarkeit → score zwischen 0 und 1, korrekte Minutenberechnung", () => {
    // Werktag: Fenster 06:00-22:00 = 960min, Block 09:00-17:00 = 480min busy
    const blocks = [recurring({ startTime: "09:00", endTime: "17:00" })];
    const result = computeDayCapacityScore("2026-08-10", blocks);
    expect(result.windowMinutes).toBe(960);
    expect(result.busyMinutes).toBe(480);
    expect(result.freeMinutes).toBe(480);
    expect(result.capacityScore).toBe(0.5);
  });

  test("überlappende Blocks werden nicht doppelt gezählt", () => {
    const blocks = [
      recurring({ id: "r1", startTime: "09:00", endTime: "13:00" }),
      recurring({ id: "r2", startTime: "12:00", endTime: "15:00" }),
    ];
    const result = computeDayCapacityScore("2026-08-10", blocks);
    // Merged interval 09:00-15:00 = 360min, nicht 240+180=420min
    expect(result.busyMinutes).toBe(360);
  });

  test("Wochenend-Sonderfall: anderes Zeitfenster als Werktag", () => {
    const saturday = computeDayCapacityScore("2026-08-15", []);
    expect(saturday.isWeekend).toBe(true);
    expect(saturday.windowMinutes).toBe(960);

    const monday = computeDayCapacityScore("2026-08-10", []);
    expect(monday.isWeekend).toBe(false);
    // Beide Fenster sind 16h lang, aber zeitlich verschoben (Wochenende später)
    expect(saturday.capacityScore).toBe(monday.capacityScore);
  });

  test("one-off Block gilt nur am spezifischen Datum, nicht an Folgetagen", () => {
    const blocks = [oneOff({ specificDate: "2026-08-10", startTime: "06:00", endTime: "22:00" })];
    const monday = computeDayCapacityScore("2026-08-10", blocks);
    const tuesday = computeDayCapacityScore("2026-08-11", blocks);
    expect(monday.isFullyBooked).toBe(true);
    expect(tuesday.isFullyFree).toBe(true);
  });

  test("recurring Block außerhalb von recurrenceStartDate/EndDate wirkt nicht", () => {
    const blocks = [
      recurring({
        startTime: "06:00",
        endTime: "22:00",
        recurrenceStartDate: "2026-09-01",
        recurrenceEndDate: "2026-12-31",
      }),
    ];
    const result = computeDayCapacityScore("2026-08-10", blocks);
    expect(result.isFullyFree).toBe(true);
  });

  test("recurring Block an falschem Wochentag wirkt nicht", () => {
    const blocks = [recurring({ dayOfWeek: 2 })]; // Dienstag, wir prüfen Montag
    const result = computeDayCapacityScore("2026-08-10", blocks);
    expect(result.isFullyFree).toBe(true);
  });
});

describe("computeSessionDayFitScore", () => {
  test("hochintensive Session (tempo/interval/race/long) wird auf einem überlasteten Tag stark bestraft", () => {
    const busy = capacity(0.1);
    expect(computeSessionDayFitScore({ type: "tempo" }, busy)).toBe(0.1);
    expect(computeSessionDayFitScore({ type: "interval" }, busy)).toBe(0.1);
    expect(computeSessionDayFitScore({ type: "race" }, busy)).toBe(0.1);
    expect(computeSessionDayFitScore({ type: "long" }, busy)).toBe(0.1);
  });

  test("easy/rest Session wird auf einem überlasteten Tag kaum bestraft", () => {
    const busy = capacity(0.1);
    const free = capacity(1);
    const easyBusy = computeSessionDayFitScore({ type: "easy" }, busy);
    const easyFree = computeSessionDayFitScore({ type: "easy" }, free);
    expect(easyBusy).toBeGreaterThan(0.85);
    expect(easyFree).toBe(1);
    expect(easyBusy).toBeLessThan(easyFree);
  });

  test("beide Gruppen bleiben monoton in capacityScore (kein Rangwechsel bei besserer Capacity)", () => {
    expect(computeSessionDayFitScore({ type: "tempo" }, capacity(0.3))).toBeLessThan(
      computeSessionDayFitScore({ type: "tempo" }, capacity(0.9)),
    );
    expect(computeSessionDayFitScore({ type: "easy" }, capacity(0.3))).toBeLessThan(
      computeSessionDayFitScore({ type: "easy" }, capacity(0.9)),
    );
  });
});

describe("isPhysicalLoadTitle", () => {
  test.each([
    "Fußballturnier",
    "Fussballturnier",
    "FUSSBALL",
    "Football mit Freunden",
    "Soccer",
    "Wettkampf",
    "Match",
    "Handball-Spiel",
    "Basketball",
    "Volleyball (Beach)",
    "Hockey",
    "Tennis",
    "Klettern",
    "Triathlon Vorbereitung",
    "Hallenfußball", // Kompositum: Stichwort am Wortende
    "Beachvolleyball",
  ])("%s zählt als körperliche Belastung", (title) => {
    expect(isPhysicalLoadTitle(title)).toBe(true);
  });

  test.each([
    "Schicht",
    "Arbeit",
    "Job",
    "Schachturnier", // "Turnier" allein ist kein Belastungs-Stichwort
    "Turnier",
    "Vorlesung",
    "Training", // zu generisch
    "Spiel", // zu generisch
    "Spieleabend",
    "Matcha Latte", // kurzes Stichwort "match" gilt nur als ganzes Wort
    "Zahnarzt",
    "",
  ])("%s zählt NICHT als körperliche Belastung", (title) => {
    expect(isPhysicalLoadTitle(title)).toBe(false);
  });

  test("Stichwortliste ist klein geschrieben und enthält keine zu generischen Wörter", () => {
    for (const keyword of PHYSICAL_LOAD_TITLE_KEYWORDS) {
      expect(keyword).toBe(keyword.toLowerCase());
    }
    expect(PHYSICAL_LOAD_TITLE_KEYWORDS).not.toContain("spiel");
    expect(PHYSICAL_LOAD_TITLE_KEYWORDS).not.toContain("training");
    expect(PHYSICAL_LOAD_TITLE_KEYWORDS).not.toContain("turnier");
  });
});

describe("Belastungs-Blocks in computeDayCapacityScore / computeSessionDayFitScore", () => {
  // 2026-09-20 ist ein Sonntag (Wochenendfenster 07:00-23:00 = 960min)
  const tournament = oneOff({
    id: "o-fb",
    title: "Fußballturnier",
    category: "other",
    source: "eventkit",
    specificDate: "2026-09-20",
    startTime: "11:00",
    endTime: "19:00",
  });

  test("Tag mit Belastungs-Block: Anteil-Check bleibt unverändert (50 % belegt), Titel wird durchgereicht", () => {
    const day = computeDayCapacityScore("2026-09-20", [tournament]);
    expect(day.busyMinutes).toBe(480);
    expect(day.capacityScore).toBe(0.5);
    expect(day.physicalLoadBlockTitles).toEqual(["Fußballturnier"]);
  });

  test("Block mit neutralem Titel (Schicht/Arbeit) und gleichen Zeiten: keine Belastung", () => {
    for (const title of ["Schicht", "Arbeit"]) {
      const day = computeDayCapacityScore("2026-09-20", [{ ...tournament, title }]);
      expect(day.capacityScore).toBe(0.5);
      expect(day.physicalLoadBlockTitles).toEqual([]);
    }
  });

  test("Schachturnier (gleiche Zeiten, kein Sport-Stichwort) ist kein Belastungstag; Fußballturnier bleibt es", () => {
    const chess = computeDayCapacityScore("2026-09-20", [{ ...tournament, title: "Schachturnier" }]);
    expect(chess.physicalLoadBlockTitles).toEqual([]);
    expect(computeSessionDayFitScore({ type: "long" }, chess)).toBeGreaterThanOrEqual(MIN_FIT_SCORE_THRESHOLD);
    expect(computeDayCapacityScore("2026-09-20", [tournament]).physicalLoadBlockTitles).toEqual(["Fußballturnier"]);
  });

  test("Belastungs-Block an einem anderen Datum färbt den Tag nicht", () => {
    expect(computeDayCapacityScore("2026-09-19", [tournament]).physicalLoadBlockTitles).toEqual([]);
  });

  test("Belastungs-Block komplett außerhalb des Tagesfensters zählt nicht", () => {
    const early = { ...tournament, startTime: "04:00", endTime: "06:30" }; // Wochenendfenster beginnt 07:00
    expect(computeDayCapacityScore("2026-09-20", [early]).physicalLoadBlockTitles).toEqual([]);
  });

  test("harte Session (tempo/interval/race/long) auf Belastungstag liegt unter MIN_FIT_SCORE_THRESHOLD", () => {
    const day = computeDayCapacityScore("2026-09-20", [tournament]);
    for (const type of ["tempo", "interval", "race", "long"] as const) {
      const fit = computeSessionDayFitScore({ type }, day);
      expect(fit).toBeLessThan(MIN_FIT_SCORE_THRESHOLD);
      expect(isPhysicalLoadConflict({ type }, day)).toBe(true);
    }
  });

  test("leichte Sessions (easy/strength/bike/rest) bleiben auf dem Belastungstag unverändert", () => {
    const withLoad = computeDayCapacityScore("2026-09-20", [tournament]);
    const withoutLoad = computeDayCapacityScore("2026-09-20", [{ ...tournament, title: "Schicht" }]);
    for (const type of ["easy", "strength", "bike", "rest"] as const) {
      expect(computeSessionDayFitScore({ type }, withLoad)).toBe(computeSessionDayFitScore({ type }, withoutLoad));
      expect(isPhysicalLoadConflict({ type }, withLoad)).toBe(false);
    }
    expect(computeSessionDayFitScore({ type: "easy" }, withLoad)).toBeGreaterThanOrEqual(MIN_FIT_SCORE_THRESHOLD);
  });

  test("Belastungs-Deckel liegt unter der Konfliktschwelle und hebt ein besseres Fit-Score nie an", () => {
    expect(PHYSICAL_LOAD_DAY_FIT_SCORE).toBeLessThan(MIN_FIT_SCORE_THRESHOLD);
    const nearlyBooked = computeDayCapacityScore("2026-09-20", [
      { ...tournament, startTime: "07:00", endTime: "22:30" },
    ]);
    expect(nearlyBooked.capacityScore).toBeLessThan(PHYSICAL_LOAD_DAY_FIT_SCORE);
    expect(computeSessionDayFitScore({ type: "long" }, nearlyBooked)).toBe(nearlyBooked.capacityScore);
  });
});
