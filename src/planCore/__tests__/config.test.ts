import * as fs from "fs";
import * as path from "path";
import { CONFIG, CONFIG_VERSION } from "../config";

const SPEC_FILE = path.resolve(__dirname, "../../../docs/plan-spec.md");

type Leaf = { path: string; node: Record<string, unknown> };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isParam = (value: unknown): boolean =>
  isPlainObject(value) && Object.keys(value).sort().join(",") === "source,spec,value";

/** Läuft durch die Config: jeder Knoten ist ein `Param` oder ein Objekt aus Knoten. */
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

/** Überschriften "## 5. Wochenumfang" / "### 5.1 Start" → {"5", "5.1"}. */
function specSections(): Set<string> {
  const sections = new Set<string>();
  fs.readFileSync(SPEC_FILE, "utf8")
    .split("\n")
    .forEach((line) => {
      const match = /^#{2,3}\s+(\d+(?:\.\d+)?)\.?\s/.exec(line);
      if (match) sections.add(match[1]);
    });
  return sections;
}

/** Alle Objekte mit `min` und `max` unterhalb von `value`, plus alle Zahlen. */
function inspectValue(value: unknown, at: string, problems: string[]): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) problems.push(`${at}: keine endliche Zahl`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(item, `${at}[${index}]`, problems));
    return;
  }
  if (isPlainObject(value)) {
    if (typeof value.min === "number" && typeof value.max === "number" && value.min > value.max) {
      problems.push(`${at}: min ${value.min} > max ${value.max}`);
    }
    Object.keys(value).forEach((key) => inspectValue(value[key], `${at}.${key}`, problems));
  }
}

describe("planCore config", () => {
  const { leaves, stray } = collectAll();

  it("enthält Werte, und jeder Wert steckt in einem Param", () => {
    expect(leaves.length).toBeGreaterThan(50);
    expect(stray).toEqual([]);
  });

  it("jeder Eintrag hat Herkunft L/P/E und eine Fundstelle", () => {
    const problems = leaves
      .filter(({ node }) => !["L", "P", "E"].includes(node.source as string) || !/^§\d+(\.\d+)?$/.test(node.spec as string))
      .map(({ path: at }) => at);
    expect(problems).toEqual([]);
  });

  it("jede Fundstelle gibt es als Überschrift in docs/plan-spec.md", () => {
    const sections = specSections();
    expect(sections.size).toBeGreaterThan(10);
    const missing = leaves
      .filter(({ node }) => !sections.has((node.spec as string).slice(1)))
      .map(({ path: at, node }) => `${at} → ${node.spec}`);
    expect(missing).toEqual([]);
  });

  it("Bereiche haben min ≤ max und alle Zahlen sind endlich", () => {
    const problems: string[] = [];
    leaves.forEach(({ path: at, node }) => inspectValue(node.value, at, problems));
    expect(problems).toEqual([]);
  });

  it("ist vollständig eingefroren", () => {
    const unfrozen: string[] = [];
    const visit = (node: unknown, at: string) => {
      if (node === null || typeof node !== "object") return;
      if (!Object.isFrozen(node)) unfrozen.push(at);
      Object.keys(node as Record<string, unknown>).forEach((key) =>
        visit((node as Record<string, unknown>)[key], `${at}.${key}`),
      );
    };
    visit(CONFIG, "CONFIG");
    expect(unfrozen).toEqual([]);
  });

  it("CONFIG_VERSION ist eine Versionsnummer", () => {
    expect(CONFIG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe("Zusammenhänge der Spec-Tabellen", () => {
    it("Phasenaufteilung ergibt 100 %", () => {
      const { base, build, specific } = CONFIG.phases.split.value;
      expect(Math.round((base + build + specific) * 1000) / 1000).toBe(1);
    });

    it("harte Untergrenze = Beginn des Warnbereichs, Empfehlung endet unter dem Maximum", () => {
      (["5k", "10k", "hm", "m"] as const).forEach((distance) => {
        expect(CONFIG.planLength.belowRecommendedWeeks.value[distance].min).toBe(CONFIG.planLength.hardMinWeeks.value[distance]);
        expect(CONFIG.planLength.recommendedWeeks.value[distance].max).toBeLessThanOrEqual(
          CONFIG.planLength.maxWeeks.value[distance],
        );
      });
    });

    it("Peak-Tabelle: mehr Lauftage tragen nie weniger km", () => {
      (["5k", "10k", "hm", "m"] as const).forEach((distance) => {
        const row = CONFIG.volume.peakKm.value[distance];
        ([3, 4, 5] as const).forEach((days) => {
          expect(row[(days + 1) as 4 | 5 | 6].min).toBeGreaterThanOrEqual(row[days].min);
          expect(row[(days + 1) as 4 | 5 | 6].max).toBeGreaterThanOrEqual(row[days].max);
        });
      });
    });

    it("Wochenschablonen: so viele Slots wie Lauftage, genau ein Long Run, Q-Slots passen zu maxQ", () => {
      ([3, 4, 5, 6] as const).forEach((days) => {
        const template = CONFIG.weekTemplates.slots.value[days];
        (["base", "main"] as const).forEach((column) => {
          expect(template[column]).toHaveLength(days);
          expect(template[column].filter((slot) => slot === "LR")).toHaveLength(1);
        });
        const qSlots = template.main.filter((slot) => slot === "Q1" || slot === "Q2").length;
        expect(qSlots).toBe(CONFIG.placement.maxQ.value[days]);
      });
    });

    it("Zahlen, die die Spec an zwei Stellen nennt, sind gleich", () => {
      expect(CONFIG.volume.startKmMax.value).toBe(CONFIG.inputs.currentWeeklyKm.value.max);
      expect(CONFIG.library.longRunPlusM.maxKm.value).toBe(CONFIG.library.m.maxKm.value);
      expect(CONFIG.library.longRunPlusM.maxMinutes.value).toBe(CONFIG.library.m.maxMinutes.value);
      // Wochen-Entlastung fest −20 % (§5.3); der Long Run darf in der Entlastungswoche −20 bis −30 % kürzer sein (§7.1).
      expect(CONFIG.volume.recovery.reduction.value).toBe(CONFIG.longRun.recoveryReduction.value.min);
    });

    it("Schritt-6-Werte liegen in den Bereichen der Spec", () => {
      const { library, longRun, intensity, qualityTypes } = CONFIG;
      expect(longRun.recoveryReductionUsed.value).toBeGreaterThanOrEqual(longRun.recoveryReduction.value.min);
      expect(longRun.recoveryReductionUsed.value).toBeLessThanOrEqual(longRun.recoveryReduction.value.max);
      library.warmupCooldownByWeekKm.value.forEach((row) => {
        [row.warmupKm, row.cooldownKm].forEach((km) => {
          expect(km).toBeGreaterThanOrEqual(library.warmupCooldownKm.value.min);
          expect(km).toBeLessThanOrEqual(library.warmupCooldownKm.value.max);
        });
      });
      [library.strides.repsStandard.value, library.strides.repsRaceWeek.value].forEach((reps) => {
        expect(reps).toBeGreaterThanOrEqual(library.strides.reps.value.min);
        expect(reps).toBeLessThanOrEqual(library.strides.reps.value.max);
      });
      expect(library.i.repTargetMinutes.value).toBeGreaterThanOrEqual(library.i.repMinutes.value.min);
      expect(library.i.repTargetMinutes.value).toBeLessThanOrEqual(library.i.repMinutes.value.max);
      expect(library.m.nearLongRunMaxKm.value).toBeLessThan(library.m.maxKm.value);
      expect(intensity.qualityShareTargetFewDays.value).toBeLessThan(intensity.qualityShareTarget.value);
      expect(intensity.qualityShareTarget.value).toBeLessThanOrEqual(intensity.qualityShareHard.value);
      expect(intensity.firstQualityBudgetShare.value).toBeGreaterThan(0);
      expect(intensity.firstQualityBudgetShare.value).toBeLessThan(1);
      qualityTypes.hmSpecificQ2.value.forEach((token) => expect(["I", "T"]).toContain(token));
      // Strides zählen nicht zu den Wochen-km: der Parser zählt Wiederholungen bis 150 m als Strides.
      expect(library.strides.meters.value).toBeLessThanOrEqual(150);
    });

    it("Long-Run-Anteil sinkt mit mehr Lauftagen", () => {
      const share = CONFIG.longRun.maxShareOfWeek.value;
      expect(share[3]).toBeGreaterThan(share[4]);
      expect(share[4]).toBeGreaterThan(share[5]);
      expect(share[5]).toBeGreaterThan(share[6]);
    });
  });

  it("Snapshot der Config: Änderungen am Review sind bewusst", () => {
    expect({ version: CONFIG_VERSION, config: CONFIG }).toMatchSnapshot();
  });
});
