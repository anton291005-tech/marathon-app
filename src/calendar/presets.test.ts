import { freezeTimeForTests } from "../core/time/timeSystem";
import { presetToScheduleBlocks, SCHEDULE_PRESETS } from "./presets";

describe("presetToScheduleBlocks", () => {
  beforeEach(() => {
    freezeTimeForTests(new Date(2026, 7, 24, 12, 0)); // Montag, 24.08.2026 lokal
  });

  afterEach(() => {
    freezeTimeForTests(null);
  });

  it("fulltime erzeugt 5 recurring Job-Zeilen Mo–Fr mit source='preset'", () => {
    const blocks = presetToScheduleBlocks("fulltime");

    expect(blocks).toHaveLength(5);
    expect(blocks.map((b) => b.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    for (const block of blocks) {
      expect(block).toMatchObject({
        category: "job",
        startTime: "09:00",
        endTime: "17:00",
        source: "preset",
        isRecurring: true,
        recurrenceStartDate: "2026-08-24",
        recurrenceEndDate: null,
      });
      expect(block.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it("parttime erzeugt 3 Zeilen Mo–Mi", () => {
    const blocks = presetToScheduleBlocks("parttime");
    expect(blocks.map((b) => b.dayOfWeek)).toEqual([1, 2, 3]);
    expect(blocks[0]).toMatchObject({ startTime: "09:00", endTime: "14:00", category: "job" });
  });

  it("study erzeugt study-Zeilen, shift trägt den Varianz-Hinweis in notes", () => {
    expect(presetToScheduleBlocks("study").every((b) => b.category === "study")).toBe(true);
    expect(presetToScheduleBlocks("shift").every((b) => b.notes === "Schichtarbeit – Zeiten variieren")).toBe(true);
  });

  it("erzeugt eindeutige IDs über alle Zeilen", () => {
    const ids = presetToScheduleBlocks("fulltime").map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("jedes Preset in SCHEDULE_PRESETS ist auflösbar und nicht leer", () => {
    for (const preset of SCHEDULE_PRESETS) {
      expect(presetToScheduleBlocks(preset.id).length).toBeGreaterThan(0);
    }
  });
});
