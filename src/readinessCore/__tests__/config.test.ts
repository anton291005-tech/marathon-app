import * as fs from "fs";
import * as path from "path";
import { CONFIG, CONFIG_VERSION } from "../config";

const SPEC_FILE = path.resolve(__dirname, "../../../docs/readiness-spec.md");

type Leaf = { path: string; node: Record<string, unknown> };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isParam = (value: unknown): boolean =>
  isPlainObject(value) && Object.keys(value).sort().join(",") === "source,spec,value";

function collect(node: unknown, at: string, leaves: Leaf[], stray: string[]): void {
  if (isParam(node)) {
    leaves.push({ path: at, node: node as Record<string, unknown> });
    return;
  }
  if (!isPlainObject(node)) {
    stray.push(at);
    return;
  }
  Object.keys(node).forEach((key) => collect(node[key], at ? `${at}.${key}` : key, leaves, stray));
}

function collectAll(): { leaves: Leaf[]; stray: string[] } {
  const leaves: Leaf[] = [];
  const stray: string[] = [];
  collect(CONFIG, "", leaves, stray);
  return { leaves, stray };
}

/** Überschriften "## 5. Trainingslast" / "### 8.3a Vorschlag" → {"5", "8.3a"}. */
function specSections(): Set<string> {
  const sections = new Set<string>();
  fs.readFileSync(SPEC_FILE, "utf8")
    .split("\n")
    .forEach((line) => {
      const match = /^#{2,3}\s+(\d+(?:\.\d+[a-z]?)?)\.?\s/.exec(line);
      if (match) sections.add(match[1]);
    });
  return sections;
}

function numberProblems(value: unknown, at: string, problems: string[]): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) problems.push(`${at}: keine endliche Zahl`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => numberProblems(item, `${at}[${index}]`, problems));
    return;
  }
  if (isPlainObject(value)) {
    if (typeof value.min === "number" && typeof value.max === "number" && value.min > value.max) {
      problems.push(`${at}: min ${value.min} > max ${value.max}`);
    }
    Object.keys(value).forEach((key) => numberProblems(value[key], `${at}.${key}`, problems));
  }
}

describe("readinessCore/config", () => {
  const { leaves, stray } = collectAll();

  it("besteht nur aus Param-Einträgen", () => {
    expect(stray).toEqual([]);
    expect(leaves.length).toBeGreaterThan(100);
  });

  it("jeder Eintrag hat eine gültige Herkunft (L/P/E)", () => {
    const bad = leaves.filter(({ node }) => !["L", "P", "E"].includes(node.source as string)).map((l) => l.path);
    expect(bad).toEqual([]);
  });

  it("jede Fundstelle existiert in docs/readiness-spec.md", () => {
    const sections = specSections();
    const bad = leaves
      .filter(({ node }) => {
        const match = /^§(\d+(?:\.\d+[a-z]?)?)$/.exec(node.spec as string);
        return !match || !sections.has(match[1]);
      })
      .map((l) => `${l.path} → ${String(l.node.spec)}`);
    expect(bad).toEqual([]);
  });

  it("alle Zahlen sind endlich, Bereiche geordnet", () => {
    const problems: string[] = [];
    leaves.forEach(({ path: at, node }) => numberProblems(node.value, at, problems));
    expect(problems).toEqual([]);
  });

  it("Stufen-Grenzen sind absteigend und um 0 symmetrisch für normal", () => {
    const t = CONFIG.output.levelThresholds.value;
    expect(t.above).toBeGreaterThan(t.normal);
    expect(t.normal).toBeGreaterThan(t.below);
    expect(t.above).toBe(-t.normal);
  });

  it("HRV kann nie positiv zählen und nie allein eine Stufe kippen (R7)", () => {
    expect(CONFIG.body.hrvFloor.value).toBeLessThan(0);
    expect(CONFIG.body.hrvFloor.value).toBeGreaterThanOrEqual(-1);
  });

  it("Vorschläge rücken nur zu weniger Belastung nach (§8.1)", () => {
    expect(CONFIG.actions.fallbackOrder.value).toEqual(["H2", "H3"]);
    expect(CONFIG.actions.lighterFactor.value).toBeLessThan(1);
    expect(CONFIG.actions.calmerWeekEasyFactor.value).toBeLessThan(1);
    expect(CONFIG.actions.calmerWeekLongRunFactor.value).toBeLessThan(1);
  });

  it("Snapshot (Wert geändert → CONFIG_VERSION erhöhen)", () => {
    expect({ CONFIG_VERSION, CONFIG }).toMatchSnapshot();
  });
});
