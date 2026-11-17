/**
 * Schicht-Modus (Migration 023): Dienstplan-Einträge werden bei der Account-Löschung mit gelöscht,
 * und zwar vor `profiles` (dort hängen works_shifts/shift_defaults).
 */
const { USER_DATA_TABLES } = require("../../api/_lib/deleteAccount");

describe("deleteAccount – shift_entries", () => {
  test("shift_entries steht in der Löschliste", () => {
    expect(USER_DATA_TABLES).toContain("shift_entries");
  });

  test("shift_entries wird vor profiles gelöscht", () => {
    expect(USER_DATA_TABLES.indexOf("shift_entries")).toBeLessThan(USER_DATA_TABLES.indexOf("profiles"));
  });
});
