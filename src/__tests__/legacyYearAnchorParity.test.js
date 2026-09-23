// Pinnt die beiden Spiegel der Jahres-Ankerregel gegeneinander:
//   src/planV2/legacyYearAnchor.ts  (Client-Bundle)
//   api/_lib/legacyYearAnchor.js    (Serverlaufzeit)
//
// Geteilt wird der Vektor, nicht der Code: CRAs ModuleScopePlugin lässt keinen
// Import aus api/ in den Client-Bundle zu. Driftet eine Seite ab, schlägt genau
// dieser Test fehl, bevor Client und Server unterschiedliche Jahre schreiben.

const vectors = require("../planV2/__fixtures__/legacyYearAnchorVectors.json");

const client = require("../planV2/legacyYearAnchor");
const server = require("../../api/_lib/legacyYearAnchor");

const IMPLEMENTATIONS = [
  ["client (src/planV2/legacyYearAnchor.ts)", client],
  ["server (api/_lib/legacyYearAnchor.js)", server],
];

describe.each(IMPLEMENTATIONS)("legacyYearAnchor — %s", (_name, impl) => {
  it.each(vectors.yearFromAnchorDate.map((c) => [JSON.stringify(c.input), c]))(
    "yearFromAnchorDate(%s)",
    (_label, testCase) => {
      expect(impl.yearFromAnchorDate(testCase.input)).toBe(testCase.expected);
    },
  );

  it.each(vectors.sequences.map((c) => [c.name, c]))("%s", (_label, testCase) => {
    const anchor = impl.resolveLegacyYearAnchor(testCase.input);
    expect(anchor.source).toBe(testCase.expectedSource);
    expect(impl.resolveLegacyYears(testCase.months, anchor)).toEqual(testCase.expectedYears);
  });
});
