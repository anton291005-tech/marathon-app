// Abnahme Plan-Kern Schritt 10 (v3): Offline-Vergleich alt/neu ohne Claude. Tabelle: docs/plan-core-comparison.md
// (scripts/planCoreCompare.ts). Der Snapshot hält die Kennzahlen P1–P6 beider Seiten fest; jede Änderung ist sichtbar.

import { compareRandomProfiles, compareReferenceProfiles, type ComparisonRow } from "../testSupport/planCoreComparison";

const compact = (row: ComparisonRow) => ({
  name: row.name,
  coreErrors: row.coreErrors,
  coreViolationRules: row.coreViolationRules,
  core: row.core,
  legacy: row.legacy,
});

describe("Offline-Vergleich alt/neu", () => {
  const reference = compareReferenceProfiles();
  const random = compareRandomProfiles(200);

  it("P1–P6: Mapping ok, Kern ohne error, Lauftage und verfügbare Tage eingehalten", () => {
    expect(reference.map((r) => r.name)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6"]);
    reference.forEach((row) => {
      expect(row.mappingOk).toBe(true);
      expect(row.coreErrors).toBe(0);
      expect(row.core?.runsOnUnavailableDays).toBe(0);
      expect(row.core?.weeksOverRunDays).toBe(0);
      expect(row.core?.weeks).toBe(row.legacy.weeks);
    });
  });

  it("P1–P6: Kennzahlen alt und neu (Snapshot)", () => {
    expect(reference.map(compact)).toMatchSnapshot();
  });

  it("200 Zufallsprofile: Mapping ok, Kern ohne error, nie Training an nicht verfügbaren Tagen oder über der Lauftage-Vorgabe", () => {
    expect(random.filter((r) => !r.mappingOk)).toEqual([]);
    expect(random.filter((r) => r.coreErrors > 0).map((r) => r.label)).toEqual([]);
    // Jede Meldung ist eine warning: die Summe je Regel ergibt genau die Zahl der warnings.
    random.forEach((r) => expect(Object.values(r.coreViolationRules).reduce((a, b) => a + b, 0)).toBe(r.coreWarnings));
    expect(random.filter((r) => (r.core?.runsOnUnavailableDays ?? 1) > 0).map((r) => r.label)).toEqual([]);
    expect(random.filter((r) => (r.core?.weeksOverRunDays ?? 1) > 0).map((r) => r.label)).toEqual([]);
  });
});
