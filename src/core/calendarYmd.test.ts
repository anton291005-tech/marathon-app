// Kalendertag und Montag einer dateIso: rein kalendarisch, in jeder Zeitzone gleich.
// Unter TZ=Pacific/Auckland (UTC+13) schob die frühere Rechnung mit lokaler Zeit den Montag einen Tag zurück.
import { calendarYmdOfDateIso, mondayYmdOfDateIso } from "./calendarYmd";

describe("calendarYmdOfDateIso", () => {
  it.each([
    ["2026-11-09", "2026-11-09"],
    ["2026-11-09T12:00:00.000Z", "2026-11-09"],
    ["2026-11-09T00:00:00.000Z", "2026-11-09"],
    ["2026-11-09T23:59:59.000Z", "2026-11-09"],
  ])("%s → %s", (input, expected) => {
    expect(calendarYmdOfDateIso(input)).toBe(expected);
  });

  it.each(["", "kein Datum", "2026-02-30T12:00:00.000Z", "2026-13-01"])("%j → null", (input) => {
    expect(calendarYmdOfDateIso(input)).toBeNull();
  });
});

describe("mondayYmdOfDateIso", () => {
  it.each([
    ["2026-11-09T12:00:00.000Z", "2026-11-09"], // Montag bleibt Montag
    ["2026-11-11T12:00:00.000Z", "2026-11-09"], // Mittwoch
    ["2026-11-15T12:00:00.000Z", "2026-11-09"], // Sonntag gehört zur Woche davor
    ["2026-11-16T12:00:00.000Z", "2026-11-16"],
    ["2026-11-09T00:00:00.000Z", "2026-11-09"], // Tagesanfang UTC bleibt am Tag
    ["2026-11-08T23:00:00.000Z", "2026-11-02"], // Sonntag spät
    ["2027-01-03T12:00:00.000Z", "2026-12-28"], // über den Jahreswechsel
    ["2026-03-29T12:00:00.000Z", "2026-03-23"], // Sommerzeit-Umstellung Europa
  ])("%s → %s", (input, expected) => {
    expect(mondayYmdOfDateIso(input)).toBe(expected);
  });

  it("ungültig → null", () => {
    expect(mondayYmdOfDateIso("nix")).toBeNull();
  });
});
