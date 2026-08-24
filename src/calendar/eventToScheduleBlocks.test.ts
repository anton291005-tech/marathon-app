import { occurrencesToScheduleBlocks, type RawCalendarOccurrence } from "./eventToScheduleBlocks";

const WINDOW_START = "2026-08-24";
const WINDOW_END = "2026-09-20"; // 28-Tage-Fenster

/** Lokale Zeit → Epoch ms (Tests laufen in der lokalen Zeitzone, wie die Implementierung). */
function localMs(year: number, month1: number, day: number, hour: number, minute: number): number {
  return new Date(year, month1 - 1, day, hour, minute).getTime();
}

function occurrence(overrides: Partial<RawCalendarOccurrence> = {}): RawCalendarOccurrence {
  return {
    title: "Vorlesung Statistik",
    calendarTitle: "Uni",
    calendarType: "calDAV",
    startMs: localMs(2026, 8, 25, 10, 0),
    endMs: localMs(2026, 8, 25, 12, 0),
    isAllDay: false,
    status: "confirmed",
    ...overrides,
  };
}

describe("occurrencesToScheduleBlocks", () => {
  it("mappt ein normales Vorkommen auf eine One-Off-Zeile mit lokalen Zeiten", () => {
    const blocks = occurrencesToScheduleBlocks([occurrence()], WINDOW_START, WINDOW_END);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      title: "Vorlesung Statistik",
      category: "study",
      startTime: "10:00",
      endTime: "12:00",
      source: "eventkit",
      isRecurring: false,
      specificDate: "2026-08-25",
      notes: null,
    });
  });

  it("überspringt All-Day-Events, birthday-/subscription-Kalender und stornierte Events", () => {
    const blocks = occurrencesToScheduleBlocks(
      [
        occurrence({ isAllDay: true }),
        occurrence({ calendarType: "birthday" }),
        occurrence({ calendarType: "subscription" }),
        occurrence({ status: "canceled" }),
        occurrence({ status: "cancelled" }),
      ],
      WINDOW_START,
      WINDOW_END
    );

    expect(blocks).toHaveLength(0);
  });

  it("überspringt Events unter 5 Minuten", () => {
    const blocks = occurrencesToScheduleBlocks(
      [occurrence({ startMs: localMs(2026, 8, 25, 10, 0), endMs: localMs(2026, 8, 25, 10, 4) })],
      WINDOW_START,
      WINDOW_END
    );
    expect(blocks).toHaveLength(0);
  });

  it("splittet ein mitternachtsüberschreitendes Event in zwei Zeilen (Tag 1 endet 23:59)", () => {
    const blocks = occurrencesToScheduleBlocks(
      [
        occurrence({
          title: "Nachtschicht",
          startMs: localMs(2026, 8, 25, 22, 0),
          endMs: localMs(2026, 8, 26, 6, 0),
        }),
      ],
      WINDOW_START,
      WINDOW_END
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ specificDate: "2026-08-25", startTime: "22:00", endTime: "23:59" });
    expect(blocks[1]).toMatchObject({ specificDate: "2026-08-26", startTime: "00:00", endTime: "06:00" });
  });

  it("verwirft das Null-Längen-Segment, wenn ein Event exakt um Mitternacht endet", () => {
    const blocks = occurrencesToScheduleBlocks(
      [occurrence({ startMs: localMs(2026, 8, 25, 22, 0), endMs: localMs(2026, 8, 26, 0, 0) })],
      WINDOW_START,
      WINDOW_END
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ specificDate: "2026-08-25", startTime: "22:00", endTime: "23:59" });
  });

  it("dedupliziert identische Vorkommen aus verschiedenen Kalendern", () => {
    const blocks = occurrencesToScheduleBlocks(
      [occurrence({ calendarTitle: "Uni" }), occurrence({ calendarTitle: "Geteilt", title: "vorlesung statistik " })],
      WINDOW_START,
      WINDOW_END
    );
    expect(blocks).toHaveLength(1);
  });

  it("clampt aufs Fenster: Vorkommen außerhalb fallen weg, Segmente innerhalb bleiben", () => {
    const blocks = occurrencesToScheduleBlocks(
      [
        occurrence({ startMs: localMs(2026, 8, 23, 10, 0), endMs: localMs(2026, 8, 23, 12, 0) }), // vor Fenster
        occurrence({ title: "Spät", startMs: localMs(2026, 9, 21, 10, 0), endMs: localMs(2026, 9, 21, 12, 0) }), // nach Fenster
        occurrence({ title: "Silvester", startMs: localMs(2026, 8, 23, 22, 0), endMs: localMs(2026, 8, 24, 2, 0) }), // ragt hinein
      ],
      WINDOW_START,
      WINDOW_END
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ title: "Silvester", specificDate: "2026-08-24", startTime: "00:00", endTime: "02:00" });
  });

  it("nutzt 'Termin' als Fallback-Titel für leere Titel", () => {
    const blocks = occurrencesToScheduleBlocks([occurrence({ title: "   " })], WINDOW_START, WINDOW_END);
    expect(blocks[0].title).toBe("Termin");
    expect(blocks[0].category).toBe("study"); // Kalendername "Uni" greift weiterhin
  });

  it("erzeugt gültige, eindeutige UUID-IDs", () => {
    const blocks = occurrencesToScheduleBlocks(
      [occurrence(), occurrence({ startMs: localMs(2026, 8, 26, 10, 0), endMs: localMs(2026, 8, 26, 12, 0) })],
      WINDOW_START,
      WINDOW_END
    );
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });
});
