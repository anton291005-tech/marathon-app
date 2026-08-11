import { computeDayCapacityScore } from "./capacityScore";
import type { RecurringScheduleBlock, OneOffScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";

function recurring(overrides: Partial<RecurringScheduleBlock>): RecurringScheduleBlock {
  return {
    id: "r1",
    title: "Job",
    category: "job",
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
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
