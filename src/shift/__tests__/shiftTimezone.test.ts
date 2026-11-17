/**
 * Zeitzonen und Sommerzeit (Umstellung 25.10.2026 und 28.03.2027): Rotationsmuster, Tageseignung und
 * Wochenvorschlag rechnen nur mit Kalendertagen — das Ergebnis ist in Berlin, UTC und Los Angeles gleich.
 */
import { applyRotation, parseRotationPattern } from "../rotation";
import { buildShiftCapacityContext } from "../shiftAdapter";
import { proposeShiftWeek } from "../proposeShiftWeek";
import { week } from "../__fixtures__/shiftFixtures";

const ZONES = ["Europe/Berlin", "UTC", "America/Los_Angeles"];
const original = process.env.TZ;
afterAll(() => {
  process.env.TZ = original;
});

function runIn(tz: string, monday: string) {
  process.env.TZ = tz;
  const parsed = parseRotationPattern("F F S S N N – – –");
  if (!parsed.ok) throw new Error("Muster ungültig");
  const entries = applyRotation({ kinds: parsed.kinds, startYmd: monday, weeks: 2 });
  const plan = [week(1, monday, ["easy", "interval", "easy", "tempo", "rest", "easy", "long"]), week(2, entriesMonday(monday), ["easy", "interval", "easy", "tempo", "rest", "easy", "long"])];
  const shiftContext = buildShiftCapacityContext({ enabled: true, worksShifts: true, entries, todayYmd: monday });
  if (!shiftContext) throw new Error("Kontext erwartet");
  const result = proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext, todayYmd: monday });
  return { dates: entries.map((e) => `${e.dateYmd}:${e.kind}`), byDate: shiftContext.byDate, result };
}

function entriesMonday(monday: string): string {
  const [y, m, d] = monday.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
}

describe.each([
  ["Umstellung Herbst", "2026-10-19"],
  ["Umstellung Frühjahr", "2027-03-22"],
])("%s (Woche ab %s)", (_label, monday) => {
  it("14 lückenlose Tage im Muster, gleiche Eignung und gleicher Vorschlag in allen Zonen", () => {
    const runs = ZONES.map((tz) => runIn(tz, monday));
    expect(runs[0].dates).toHaveLength(14);
    expect(new Set(runs[0].dates.map((d) => d.slice(0, 10))).size).toBe(14);
    runs.slice(1).forEach((run) => {
      expect(run.dates).toEqual(runs[0].dates);
      expect(run.byDate).toEqual(runs[0].byDate);
      expect(run.result).toEqual(runs[0].result);
    });
  });

  it("die Nacht vor dem Umstellungssonntag zählt als normaler Nachtdienst (Tag danach nie frei)", () => {
    process.env.TZ = "Europe/Berlin";
    const sunday = entriesMonday(monday).replace(/\d{2}$/, (dd) => String(Number(dd) - 1).padStart(2, "0"));
    const saturday = sunday.replace(/\d{2}$/, (dd) => String(Number(dd) - 1).padStart(2, "0"));
    const ctx = buildShiftCapacityContext({
      enabled: true,
      worksShifts: true,
      entries: [{ dateYmd: saturday, kind: "night", start: "22:00", end: "06:00", label: null }],
      todayYmd: monday,
    });
    expect(ctx?.byDate[sunday]).toMatchObject({ hard: "unsuitable", long: "unsuitable", reasonCode: "after_night" });
  });
});
