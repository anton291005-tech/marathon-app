import { copyWeek, entryOfKind } from "../rotation";
import type { StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";

const byDate = (entries: StoredShiftEntry[]): Record<string, StoredShiftEntry> => Object.fromEntries(entries.map((e) => [e.dateYmd, e]));

describe("„Woche kopieren“ mit vergangenen Tagen in der Quellwoche", () => {
  // Heute Do 19.11.2026. Die Quellwoche beginnt am Mo 16.11.; Mo–Mi liegen in der Vergangenheit und sind auf der
  // Seite nicht eintragbar. Do–So sind eingetragen, nächste Woche Mo–Mi ebenfalls.
  const today = "2026-11-19";
  const entries = byDate([
    entryOfKind("2026-11-19", "early"),
    entryOfKind("2026-11-20", "early"),
    entryOfKind("2026-11-21", "off"),
    entryOfKind("2026-11-22", "off"),
    entryOfKind("2026-11-23", "night"),
    entryOfKind("2026-11-24", "night"),
    entryOfKind("2026-11-25", "late"),
  ]);

  it("vergangene, leere Quelltage löschen in den Zielwochen nichts", () => {
    const result = copyWeek({ entriesByDate: entries, sourceStartYmd: "2026-11-16", times: 2, untilYmd: "2026-12-16", editableFromYmd: today });
    expect(result.deletes).toEqual([]);
    expect(result.upserts.map((e) => `${e.dateYmd}:${e.kind}`)).toEqual([
      "2026-11-26:early",
      "2026-11-27:early",
      "2026-11-28:off",
      "2026-11-29:off",
      "2026-12-03:early",
      "2026-12-04:early",
      "2026-12-05:off",
      "2026-12-06:off",
    ]);
  });

  it("ohne die Grenze (altes Verhalten) wären Mo–Mi der nächsten Woche gelöscht worden", () => {
    const result = copyWeek({ entriesByDate: entries, sourceStartYmd: "2026-11-16", times: 1, untilYmd: "2026-12-16" });
    expect(result.deletes).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
  });

  it("leere Quelltage ab heute löschen weiterhin (die Kopie soll gleich aussehen)", () => {
    const source = byDate([entryOfKind("2026-11-19", "early"), entryOfKind("2026-11-27", "night")]);
    const result = copyWeek({ entriesByDate: source, sourceStartYmd: "2026-11-16", times: 1, untilYmd: "2026-12-16", editableFromYmd: today });
    expect(result.deletes).toEqual(["2026-11-27"]);
    expect(result.upserts.map((e) => e.dateYmd)).toEqual(["2026-11-26"]);
  });
});
