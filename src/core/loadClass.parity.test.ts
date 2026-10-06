import * as ts from "./loadClass";

// Server-Kopie (api/ darf nicht aus src/ importieren). Beide Dateien müssen sich identisch verhalten.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const js = require("../../api/_lib/loadClass");

const TYPES = ["easy", "long", "long_run", "interval", "tempo", "race", "rest", "strength", "bike", "swim", "", "xyz", " Tempo ", "LONG"];
const SPORTS = [undefined, "run", "bike", "rest", "strength", "swim"];
const TITLES = [
  undefined,
  "",
  "Long Run W12",
  "Long Run 28 km mit MP",
  "Marathon-Pace-Long-Run",
  "Marathon Pace",
  "Race Pace Finish",
  "Goal Pace",
  "Zieltempo",
  "Renntempo",
  "Tempodauerlauf",
  "Camping",
  "Progressiver Long Run",
  "Easy + 3× MP-Strides",
];
const DESCS = [undefined, null, "Coach-Plan (40 Tage bis Rennen).", "letzte 8 km @ MP", "locker"];
const STORED = [undefined, "low", "medium", "high", "bogus"];

describe("loadClass: TS-Quelle und api/_lib/loadClass.js sind identisch", () => {
  test("gleiches Marker-Muster", () => {
    expect(js.RACE_PACE_MARKER_PATTERN).toBe(ts.RACE_PACE_MARKER_PATTERN);
  });

  test("classifyLoad / resolveLoadClass / hasRacePaceMarker / isLongRunType liefern über die gesamte Matrix dasselbe", () => {
    let compared = 0;
    for (const sessionType of TYPES) {
      expect(js.isLongRunType(sessionType)).toBe(ts.isLongRunType(sessionType));
      for (const sport of SPORTS) {
        for (const title of TITLES) {
          for (const desc of DESCS) {
            const input = { sessionType, sport, title, desc };
            expect(js.classifyLoad(input)).toBe(ts.classifyLoad(input));
            expect(js.hasRacePaceMarker(title, desc)).toBe(ts.hasRacePaceMarker(title, desc));
            for (const intensity of STORED) {
              const w = { ...input, intensity };
              expect(js.resolveLoadClass(w)).toBe(ts.resolveLoadClass(w));
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5000);
  });
});
