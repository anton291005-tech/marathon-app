import { parseRestDayFromPreferences } from "./Onboarding";

describe("parseRestDayFromPreferences", () => {
  test("ignores weekday without rest context", () => {
    expect(parseRestDayFromPreferences(["Krafttraining Freitags"])).toBeUndefined();
    expect(parseRestDayFromPreferences(["Laufen Mittwochs ist ok"])).toBeUndefined();
  });

  test("parses explicit rest day with weekday", () => {
    expect(parseRestDayFromPreferences(["kein Training Dienstag"])).toBe(2);
    expect(parseRestDayFromPreferences(["Kein Training am Dienstag"])).toBe(2);
    expect(parseRestDayFromPreferences(["Ruhetag Montag"])).toBe(1);
  });
});
