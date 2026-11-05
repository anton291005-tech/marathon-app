// Der Plan-Kern (src/planCore) muss rein bleiben: Server und App nutzen denselben Code.
// Erlaubt sind nur relative Importe innerhalb von src/planCore, keine Uhr, kein Zufall, keine Umgebung.
// ESLint prüft dasselbe (package.json, Override für src/planCore), läuft aber nur für importierte Dateien im Build.
// Dieser Test ist deshalb die Absicherung, solange der Kern noch nirgends importiert wird.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "planCore");

function listSources(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...listSources(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  });
  return out;
}

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const stripStrings = (source) =>
  source.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');

const SPECIFIER_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[\w*\s{},$]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function specifiersOf(source) {
  const clean = stripComments(source);
  const found = [];
  SPECIFIER_PATTERNS.forEach((pattern) => {
    const re = new RegExp(pattern.source, "g");
    let match = re.exec(clean);
    while (match) {
      found.push(match[1]);
      match = re.exec(clean);
    }
  });
  return found;
}

const FORBIDDEN_TOKENS = [
  [/\bMath\.random\b/, "Math.random"],
  [/\bDate\.now\b/, "Date.now"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date() ohne Argument"],
  [/\bperformance\b/, "performance"],
  [/\bprocess\b/, "process"],
  [/\brequire\b/, "require"],
  [/\bwindow\b/, "window"],
  [/\bdocument\b/, "document"],
  [/\b(?:localStorage|sessionStorage)\b/, "Web-Speicher"],
  [/\bconsole\b/, "console"],
  [/\bfetch\b/, "fetch"],
  [/\b(?:setTimeout|setInterval)\b/, "Timer"],
  [/\bBuffer\b/, "Buffer"],
  [/\bcrypto\b/, "crypto"],
  [/\bIntl\b/, "Intl"],
  [/\.toLocale\w*/, "toLocale…"],
  [/\bimport\s*\(/, "dynamischer Import"],
];

function forbiddenTokensIn(source) {
  const clean = stripStrings(stripComments(source));
  return FORBIDDEN_TOKENS.filter(([pattern]) => pattern.test(clean)).map(([, label]) => label);
}

function importProblems(file, source) {
  const dir = path.dirname(file);
  // Testhilfen unter __fixtures__ dürfen auch aus dem Kern importieren (../config …); der Zielpfad muss trotzdem in src/planCore liegen.
  const isFixture = file.split(path.sep).includes("__fixtures__");
  return specifiersOf(source).flatMap((specifier) => {
    const allowed = specifier.startsWith("./") || (isFixture && specifier.startsWith("../"));
    if (!allowed) return [`${specifier}: nur ./… erlaubt`];
    const target = path.resolve(dir, specifier);
    const inside = target === ROOT || target.startsWith(ROOT + path.sep);
    if (!inside || target.includes(`${path.sep}__tests__`)) return [`${specifier}: außerhalb von src/planCore`];
    const exists = fs.existsSync(`${target}.ts`) || fs.existsSync(path.join(target, "index.ts"));
    return exists ? [] : [`${specifier}: Datei fehlt`];
  });
}

describe("src/planCore bleibt rein", () => {
  const files = listSources(ROOT);

  it("enthält nur .ts-Dateien (der Scanner prüft nur diese)", () => {
    const others = [];
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(full);
        } else if (!entry.name.endsWith(".ts")) {
          others.push(path.relative(ROOT, full));
        }
      });
    walk(ROOT);
    expect(others).toEqual([]);
  });

  it("hat das Gerüst", () => {
    const names = files.map((file) => path.relative(ROOT, file)).sort();
    ["config.ts", "dates.ts", "index.ts", "random.ts", "types.ts"].forEach((name) => expect(names).toContain(name));
  });

  it("importiert nur Dateien aus src/planCore", () => {
    const problems = files.flatMap((file) =>
      importProblems(file, fs.readFileSync(file, "utf8")).map((p) => `${path.relative(ROOT, file)}: ${p}`),
    );
    expect(problems).toEqual([]);
  });

  it("nutzt keine Uhr, keinen Zufall und keine Umgebung", () => {
    const problems = files.flatMap((file) =>
      forbiddenTokensIn(fs.readFileSync(file, "utf8")).map((label) => `${path.relative(ROOT, file)}: ${label}`),
    );
    expect(problems).toEqual([]);
  });

  it("exportiert den Zufallsgenerator nicht (nur für Tests)", () => {
    const index = stripComments(fs.readFileSync(path.join(ROOT, "index.ts"), "utf8"));
    expect(index).not.toMatch(/random/);
  });

  describe("Prüfer erkennt Verstöße (Selbsttest)", () => {
    const file = path.join(ROOT, "x.ts");

    it("Importe", () => {
      expect(importProblems(file, 'import { a } from "./types";')).toEqual([]);
      expect(importProblems(file, 'export * from "./types"; export type { Param } from "./config";')).toEqual([]);
      expect(importProblems(file, 'import React from "react";')).toHaveLength(1);
      expect(importProblems(file, 'import x from "../planV2/types";')).toHaveLength(1);
      expect(importProblems(file, 'const fs = require("fs");')).toHaveLength(1);
      expect(importProblems(file, 'const m = await import("./types");')).toEqual([]);
      expect(importProblems(file, 'import "./gibt-es-nicht";')).toHaveLength(1);
      expect(importProblems(file, 'import {\n  a,\n  b,\n} from "node:fs";')).toHaveLength(1);
      expect(importProblems(file, '// import x from "react"\nconst a = 1;')).toEqual([]);
    });

    it("Tokens", () => {
      expect(forbiddenTokensIn("const r = Math.random();")).toEqual(["Math.random"]);
      expect(forbiddenTokensIn("const d = new Date();")).toEqual(["new Date() ohne Argument"]);
      expect(forbiddenTokensIn("const d = Date.now();")).toEqual(["Date.now"]);
      expect(forbiddenTokensIn("console.log(1);")).toEqual(["console"]);
      expect(forbiddenTokensIn("x.toLocaleString()")).toEqual(["toLocale…"]);
      expect(forbiddenTokensIn("const d = new Date(0); const u = Date.UTC(2026, 0, 1);")).toEqual([]);
      expect(forbiddenTokensIn('// Math.random\nconst s = "console window process";')).toEqual([]);
    });
  });
});
