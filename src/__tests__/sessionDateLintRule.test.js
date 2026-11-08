// Pinnt die ESLint-Regel aus package.json (no-restricted-syntax): Datum aus Session-Label + festem Jahr ist
// verboten, `dateIso` (über sessionDate()/sessionYmd()) ist die Quelle der Wahrheit. Die Ausnahmen stehen
// als eigene `overrides` in package.json und werden hier mitgetestet.

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ESLINT = path.join(ROOT, "node_modules", ".bin", "eslint");

function lint(code, filename) {
  const res = spawnSync(ESLINT, ["--stdin", "--stdin-filename", filename, "-f", "json"], {
    cwd: ROOT,
    input: code,
    encoding: "utf8",
  });
  const parsed = JSON.parse(res.stdout);
  return parsed[0].messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
}

const LEGACY = /parseSessionDateLabel|label plus a year/i;
const FIXED_YEAR = /No fixed year/;

const IMPORT = 'import { parseSessionDateLabel } from "../appSmartFeatures";\n';
const LEGACY_CALL = 'export const d = (s) => parseSessionDateLabel(s.date, 2026);\n';

describe("ESLint: kein Datum aus Session-Label + festem/Default-Jahr", () => {
  jest.setTimeout(60000);

  test("parseSessionDateLabel (Import und Aufruf) ist in normalem Code verboten", () => {
    const messages = lint(IMPORT + LEGACY_CALL, "src/features/foo.ts");
    expect(messages.filter((m) => LEGACY.test(m))).toHaveLength(2);
  });

  test("sessionYmd/sessionDate/labelToYmd mit festem Jahr (Literal) sind verboten", () => {
    for (const call of ["sessionYmd(s, 2026)", "sessionDate(s, 2027)", 'labelToYmd(s.date, 2026)']) {
      const messages = lint(`import { sessionYmd, sessionDate, labelToYmd } from "../core/time/sessionDate";\nexport const x = (s) => ${call};\n`, "src/features/foo.ts");
      expect(messages.filter((m) => FIXED_YEAR.test(m))).toHaveLength(1);
    }
  });

  test("erlaubt: dateIso-Helper ohne Jahr, mit Jahr aus injizierter Uhr, mit Konstante aus einem Anker", () => {
    const code = [
      'import { sessionYmd, sessionDate } from "../core/time/sessionDate";',
      "export const a = (s) => sessionYmd(s);",
      "export const b = (s, now) => sessionDate(s, now.getFullYear());",
      "export const c = (s, anchorYear) => sessionYmd(s, anchorYear);",
      "",
    ].join("\n");
    expect(lint(code, "src/features/foo.ts")).toEqual([]);
  });

  test("Ausnahme Legacy-Jahresanker: normalizeTrainingPlan/fromBasePlan dürfen parseSessionDateLabel, aber kein festes Jahr", () => {
    for (const file of ["src/planV2/normalizeTrainingPlan.ts", "src/planV2/fromBasePlan.ts", "src/App.tsx"]) {
      const messages = lint(IMPORT + LEGACY_CALL, file);
      expect(messages.filter((m) => LEGACY.test(m))).toEqual([]);
      expect(messages.filter((m) => FIXED_YEAR.test(m))).toEqual([]); // parseSessionDateLabel ist nicht Teil der Literal-Regel
      const literal = lint('import { sessionYmd } from "../core/time/sessionDate";\nexport const x = (s) => sessionYmd(s, 2026);\n', file);
      expect(literal.filter((m) => FIXED_YEAR.test(m))).toHaveLength(1);
    }
  });

  test("Ausnahme sessionDate.ts: Formatprobe mit Schaltjahr", () => {
    const code = 'export const probe = (l) => labelToYmd(l, 2024) !== null;\n';
    expect(lint(code, "src/core/time/sessionDate.ts")).toEqual([]);
    expect(lint(code, "src/features/foo.ts").filter((m) => FIXED_YEAR.test(m))).toHaveLength(1);
  });

  test("die bestehenden Zeit-Regeln bleiben in den Ausnahme-Dateien aktiv (new Date() ohne Argumente)", () => {
    for (const file of ["src/planV2/fromBasePlan.ts", "src/core/time/sessionDate.ts"]) {
      const messages = lint("export const now = new Date();\n", file);
      expect(messages.some((m) => /getAppNow/.test(m))).toBe(true);
    }
  });
});
