import { CONFIG } from "../config";
import { addDays, WEEKDAYS } from "../dates";
import { checkPlanLayouts, checkWeekLayout, compactWeek } from "../__fixtures__/layoutChecks";
import type { WeekContext } from "../__fixtures__/layoutChecks";
import { isHardSlot } from "../hard";
import { isPlanCoreError, planPhases } from "../phases";
import { carryOf, layoutWeeks, NO_CARRY, placeWeek, resolveLongRunDay } from "../placement";
import type { LayoutCarry, PlaceWeekInput, WeekLayout } from "../placement";
import type { WeekMode } from "../templates";
import type { CorePhase, Distance, RunDays, Weekday, Ymd } from "../types";

const WEEK_START: Ymd = "2027-01-04"; // Montag
const FAR_RACE: Ymd = "2027-09-05"; // weit weg: weder Q- noch Long-Run-Sperre
const ALL: Weekday[] = WEEKDAYS.slice();

function weekInput(over: Partial<PlaceWeekInput>): PlaceWeekInput {
  return {
    wn: 1,
    phase: "build",
    mode: "main",
    weekStartYmd: WEEK_START,
    firstDayYmd: WEEK_START,
    lastDayYmd: addDays(WEEK_START, 6),
    distance: "hm",
    runDays: 6,
    beginner: false,
    availableDays: ALL,
    longRunDay: "So",
    raceDate: FAR_RACE,
    carry: NO_CARRY,
    nextHard: false,
    ...over,
  };
}

function contextOf(input: PlaceWeekInput): WeekContext {
  return {
    mode: input.mode,
    distance: input.distance,
    runDays: input.runDays,
    availableDays: input.availableDays,
    longRunDay: input.longRunDay,
    raceDate: input.raceDate,
    carry: input.carry,
    nextHard: input.nextHard,
  };
}

const STEADY: LayoutCarry = { prevHard: true, prevMlrAfterHard: false };

/** Alle Teilmengen der Wochentage mit mindestens 3 Elementen, in fester Reihenfolge. */
function availableSets(): Weekday[][] {
  const out: Weekday[][] = [];
  for (let mask = 1; mask < 128; mask += 1) {
    const set = ALL.filter((_, index) => (mask & (1 << index)) !== 0);
    if (set.length >= 3) out.push(set);
  }
  return out;
}

/**
 * Zustände, die es in einem Plan geben kann: Ein Montag-Long-Run hat nie einen harten Sonntag davor, ein harter Montag
 * danach (`nextHard`) kommt nur bei Long Run am Montag oder vor einer Taper-Woche mit Montagsrennen vor, und ein
 * Sonntags-Long-Run hat nie einen harten Montag danach.
 */
function reachable(longRunDay: Weekday, carry: LayoutCarry, nextHard: boolean, mode: WeekMode): boolean {
  if (longRunDay === "Mo" && (carry.prevHard || carry.prevMlrAfterHard)) return false;
  if (nextHard && mode !== "taper" && longRunDay !== "Mo") return false;
  if (longRunDay === "So" && nextHard) return false;
  return true;
}

const CARRIES: LayoutCarry[] = [NO_CARRY, STEADY, { prevHard: false, prevMlrAfterHard: true }];

describe("Beispielwochen (alle Tage frei, Long Run So, eingeschwungen: Vorwoche endete mit hartem Tag)", () => {
  const week = (over: Partial<PlaceWeekInput>) => compactWeek(placeWeek(weekInput({ carry: STEADY, ...over })));

  it("6 Tage Aufbau HM/M: Mo REC · Di Q2 · Mi MLR · Do Ruhe · Fr Q1 · Sa E · So LR", () => {
    expect(week({})).toBe("Mo REC · Di Q2 · Mi MLR · Do – · Fr Q1 · Sa E · So LR");
    expect(week({ distance: "m", phase: "peak" })).toBe("Mo REC · Di Q2 · Mi MLR · Do – · Fr Q1 · Sa E · So LR");
  });

  it("der MLR liegt nicht zwischen Q1 und Q2: Q1 ≈ LR−3 (Do) wäre hier ein Sandwich und weicht auf Fr aus", () => {
    const layout = placeWeek(weekInput({ carry: STEADY }));
    const slotOf = (weekday: Weekday) => layout.days.filter((d) => d.weekday === weekday)[0].slot;
    expect(slotOf("Do")).toBe("REST");
    expect(slotOf("Fr")).toBe("Q1");
    expect(layout.notes).toEqual([]);
  });

  it("andere Lauftage", () => {
    expect(week({ runDays: 6, mode: "base", phase: "base" })).toBe("Mo REC · Di E · Mi E · Do Q1 · Fr E · Sa – · So LR");
    expect(week({ runDays: 5 })).toBe("Mo E · Di Q2 · Mi – · Do Q1 · Fr E · Sa – · So LR");
    expect(week({ runDays: 4 })).toBe("Mo – · Di Q2 · Mi – · Do Q1 · Fr E · Sa – · So LR");
    expect(week({ runDays: 4, mode: "base", phase: "base" })).toBe("Mo – · Di E · Mi – · Do Q1L · Fr E · Sa – · So LR");
    expect(week({ runDays: 3 })).toBe("Mo – · Di E · Mi – · Do Q1 · Fr – · Sa – · So LR");
    expect(week({ runDays: 3, mode: "base", phase: "base" })).toBe("Mo – · Di E · Mi – · Do E · Fr – · Sa – · So LR");
  });

  it("4 Tage im Einsteiger-Modus: kein Q2", () => {
    expect(week({ runDays: 4, beginner: true })).toBe("Mo – · Di E · Mi – · Do Q1 · Fr E · Sa – · So LR");
  });

  it("6 Tage aus 6 verfügbaren (Mo–Sa), Long Run in der Mitte (Mi): zwei Q, MLR und kein Verstoß", () => {
    const layout = placeWeek(weekInput({ availableDays: ALL.slice(0, 6), longRunDay: "Mi" }));
    expect(compactWeek(layout)).toBe("Mo Q1 · Di E · Mi LR · Do REC · Fr Q2 · Sa MLR · So –");
    expect(layout.notes).toEqual([]);
  });
});

describe("Erschöpfender Test der Wochenform", () => {
  type Scenario = { label: string; mode: WeekMode; phase: CorePhase; distance: Distance; beginner: boolean; runDays?: RunDays[] };
  const SCENARIOS: Scenario[] = [
    { label: "Basis HM", mode: "base", phase: "base", distance: "hm", beginner: false },
    { label: "Aufbau HM", mode: "main", phase: "build", distance: "hm", beginner: false },
    { label: "Aufbau 5k (MLR → E)", mode: "main", phase: "build", distance: "5k", beginner: false, runDays: [6] },
    { label: "Aufbau Einsteiger", mode: "main", phase: "build", distance: "10k", beginner: true, runDays: [4, 5] },
    { label: "Taper M", mode: "taper", phase: "taper", distance: "m", beginner: false },
  ];

  it("I6 (auch über beide Wochenränder), I7, I16, MLR-Abstand und Sandwich: alle verfügbaren Tage × Long-Run-Tag × Lauftage × Art × Zustand", () => {
    const problems: string[] = [];
    let cases = 0;
    availableSets().forEach((availableDays) =>
      availableDays.forEach((longRunDay) =>
        ([3, 4, 5, 6] as RunDays[]).forEach((runDays) => {
          if (runDays > availableDays.length) return;
          SCENARIOS.forEach((scenario) => {
            if (scenario.runDays !== undefined && scenario.runDays.indexOf(runDays) < 0) return;
            CARRIES.forEach((carry) =>
              [false, true].forEach((nextHard) => {
                if (!reachable(longRunDay, carry, nextHard, scenario.mode)) return;
                const input = weekInput({ ...scenario, runDays, availableDays, longRunDay, carry, nextHard });
                const layout = placeWeek(input);
                cases += 1;
                checkWeekLayout(layout, contextOf(input)).forEach((code) =>
                  problems.push(`${scenario.label}|${availableDays.join("")}|LR ${longRunDay}|${runDays}|${JSON.stringify(carry)}|${nextHard}: ${code}`),
                );
              }),
            );
          });
        }),
      ),
    );
    expect(cases).toBeGreaterThan(10000);
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it("Sandwich-Regel: kein MLR zwischen zwei harten Tagen, in keinem der Fälle mit MLR; die Regel wird nicht umgangen, indem der MLR ständig entfällt", () => {
    let withMlr = 0;
    let droppedMlr = 0;
    const sandwiched: string[] = [];
    availableSets().forEach((availableDays) => {
      if (availableDays.length < 6) return;
      availableDays.forEach((longRunDay) =>
        CARRIES.forEach((carry) =>
          [false, true].forEach((nextHard) => {
            if (!reachable(longRunDay, carry, nextHard, "main")) return;
            ["hm", "m"].forEach((distance) => {
              const layout = placeWeek(
                weekInput({ distance: distance as Distance, runDays: 6, availableDays, longRunDay, carry, nextHard }),
              );
              const days = layout.days;
              days.forEach((day, index) => {
                if (day.slot !== "MLR") return;
                withMlr += 1;
                const before = index === 0 ? carry.prevHard : isHardSlot(days[index - 1].slot);
                const after = index === days.length - 1 ? nextHard : isHardSlot(days[index + 1].slot);
                if (before && after) sandwiched.push(`${availableDays.join("")}|${longRunDay}|${index}`);
              });
              if (layout.notes.some((note) => note.code === "mlr-as-e")) droppedMlr += 1;
            });
          }),
        ),
      );
    });
    expect(sandwiched).toEqual([]);
    expect(withMlr).toBeGreaterThan(100);
    expect(droppedMlr).toBeGreaterThan(0);

    // Bei sieben freien Tagen bleibt der MLR im eingeschwungenen Zustand immer erhalten: Die Regel kostet dort nur eine Verschiebung von Q1.
    ALL.forEach((longRunDay) => {
      const nextHard = longRunDay === "Mo"; // wie in layoutWeeks
      let carry = NO_CARRY;
      for (let probe = 0; probe < 2; probe += 1) carry = carryOf(placeWeek(weekInput({ longRunDay, carry, nextHard })));
      const layout = placeWeek(weekInput({ longRunDay, carry, nextHard }));
      expect([longRunDay, layout.days.some((d) => d.slot === "MLR"), layout.qCount]).toEqual([longRunDay, true, 2]);
    });
  });

  it("der Zustand 'MLR am Wochenende nach hartem Tag' sperrt den harten Montag (Sandwich über die Wochengrenze)", () => {
    const layout = placeWeek(weekInput({ carry: { prevHard: false, prevMlrAfterHard: true } }));
    expect(isHardSlot(layout.days[0].slot)).toBe(false);
    // Und der Löser setzt am Sonntag keinen MLR hinter einen harten Samstag, wenn der Montag danach hart sein muss.
    const monday = placeWeek(weekInput({ longRunDay: "Mo", nextHard: true }));
    const sundayIsSandwiched = monday.days[6].slot === "MLR" && isHardSlot(monday.days[5].slot);
    expect(sundayIsSandwiched).toBe(false);
  });

  it("carryOf: letzter Tag hart; MLR nach hartem Tag", () => {
    const hard = placeWeek(weekInput({ carry: STEADY }));
    expect(carryOf(hard)).toEqual({ prevHard: true, prevMlrAfterHard: false });
    const mlrLast = {
      ...hard,
      days: hard.days.slice(0, 5).concat([
        { ...hard.days[5], slot: "Q1" as const },
        { ...hard.days[6], slot: "MLR" as const },
      ]),
    };
    expect(carryOf(mlrLast)).toEqual({ prevHard: false, prevMlrAfterHard: true });
    expect(carryOf({ ...hard, days: [] })).toEqual(NO_CARRY);
  });

  it("ist deterministisch: gleiche Eingabe, gleiche Woche", () => {
    const input = weekInput({ carry: STEADY, availableDays: ["Mo", "Mi", "Do", "Fr", "Sa", "So"], longRunDay: "Sa" });
    expect(placeWeek(input)).toEqual(placeWeek({ ...input }));
  });
});

describe("Weitere Beispielwochen (Rangstufen festgenagelt: Q-Soll-Tage, MLR-Nachbarschaft, MLR weit vom Long Run)", () => {
  // Eingeschwungener Zustand wie in layoutWeeks (zwei Probeläufe), HM, Aufbau, alle Tage frei.
  function steadyWeek(longRunDay: Weekday, runDays: RunDays): string {
    const nextHard = longRunDay === "Mo";
    let carry = NO_CARRY;
    for (let probe = 0; probe < 2; probe += 1) carry = carryOf(placeWeek(weekInput({ longRunDay, runDays, carry, nextHard })));
    return compactWeek(placeWeek(weekInput({ longRunDay, runDays, carry, nextHard })));
  }

  const CASES: Array<[Weekday, RunDays, string]> = [
    ["Sa", 6, "Mo Q2 · Di MLR · Mi – · Do Q1 · Fr E · Sa LR · So REC"],
    ["Sa", 5, "Mo Q2 · Di E · Mi Q1 · Do E · Fr – · Sa LR · So –"],
    ["Sa", 4, "Mo Q2 · Di – · Mi Q1 · Do E · Fr – · Sa LR · So –"],
    ["Mi", 6, "Mo Q1 · Di E · Mi LR · Do REC · Fr Q2 · Sa – · So MLR"],
    ["Mi", 5, "Mo E · Di – · Mi LR · Do E · Fr Q2 · Sa – · So Q1"],
    ["Fr", 6, "Mo MLR · Di – · Mi Q1 · Do E · Fr LR · Sa REC · So Q2"],
    ["Fr", 4, "Mo – · Di Q1 · Mi E · Do – · Fr LR · Sa – · So Q2"],
    ["Do", 6, "Mo – · Di Q1 · Mi E · Do LR · Fr REC · Sa Q2 · So MLR"],
    ["Do", 5, "Mo Q1 · Di E · Mi – · Do LR · Fr E · Sa Q2 · So –"],
  ];

  CASES.forEach(([longRunDay, runDays, expected]) => {
    it(`LR ${longRunDay}, ${runDays} Tage: ${expected}`, () => {
      expect(steadyWeek(longRunDay, runDays)).toBe(expected);
    });
  });
});

describe("Fehlerpfad und Woche 1", () => {
  it("placeWeek wirft invalid-input, wenn kein Zustand lösbar ist (harter Vortag und Long Run am Montag)", () => {
    expect(() => placeWeek(weekInput({ longRunDay: "Mo", carry: STEADY }))).toThrow("invalid-input: week-layout");
  });

  it("Woche 1 ist der Ausschnitt der Folgewoche gleicher Art (Probelauf für den Zustand): Mo/Di/Fr/Sa/So frei, 4 Tage, Start Mittwoch", () => {
    const raceDate: Ymd = "2027-06-27";
    const startYmd: Ymd = "2027-02-24"; // Mittwoch
    const inputs = { distance: "m" as Distance, raceDate, runDaysPerWeek: 4 as RunDays, availableDays: ["Mo", "Di", "Fr", "Sa", "So"] as Weekday[], longRunDay: undefined };
    const [first, second] = layoutWeeks(inputs, planPhases({ distance: "m", raceDate, startYmd }), { beginner: false });
    expect(compactWeek(second)).toBe("Mo E · Di E · Mi – · Do – · Fr Q1L · Sa – · So LR");
    // Ohne Übertrag stünde in Woche 1 ein E am Samstag statt der E-Läufe von Mo/Di.
    expect(compactWeek(first)).toBe("Mi – · Do – · Fr Q1L · Sa – · So LR");
    expect(first.days.map((d) => d.slot)).toEqual(second.days.slice(2).map((d) => d.slot));
    expect(isHardSlot(second.days[0].slot)).toBe(false);
  });
});

describe("Unlösbare Kombinationen: Q entfällt mit Hinweis, die Lauftage bleiben", () => {
  it("3 Tage Sa/So/Mo mit Long Run So: beide Nachbartage des LR sind für Q gesperrt → Q1 entfällt", () => {
    const input = weekInput({ runDays: 3, availableDays: ["Mo", "Sa", "So"], carry: STEADY });
    const layout = placeWeek(input);
    expect(layout.notes.map((n) => n.code)).toEqual(["q1-dropped"]);
    expect(layout.runDayCount).toBe(3);
    expect(layout.qCount).toBe(0);
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
  });

  it("4 aufeinanderfolgende Lauftage Fr–Mo mit Long Run Sa: höchstens ein Q, Q2 entfällt", () => {
    const input = weekInput({ runDays: 4, availableDays: ["Mo", "Fr", "Sa", "So"], longRunDay: "Sa", carry: NO_CARRY });
    const layout = placeWeek(input);
    expect(layout.qCount).toBeLessThanOrEqual(1);
    expect(layout.notes.some((n) => n.code === "q2-dropped" || n.code === "q1-dropped")).toBe(true);
    expect(layout.runDayCount).toBe(4);
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
  });

  it("Long Run in der Wochenmitte (Do) bei Mo–Sa: keine Verstöße, alle sechs Lauftage", () => {
    const input = weekInput({ availableDays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa"], longRunDay: "Do", carry: STEADY });
    const layout = placeWeek(input);
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
    expect(layout.runDayCount).toBe(6);
  });
});

describe("Rennwoche und Sperrfenster", () => {
  function raceWeek(distance: Distance, raceWeekday: number, over: Partial<PlaceWeekInput> = {}): WeekLayout {
    const raceDate = addDays(WEEK_START, raceWeekday);
    return placeWeek(
      weekInput({
        distance,
        mode: "race",
        phase: "taper",
        raceDate,
        lastDayYmd: raceDate,
        runDays: 5,
        carry: STEADY,
        ...over,
      }),
    );
  }

  it("Rennen am Sonntag: kein LR, ein Q spätestens bei Renntag−3 (HM) bzw. −4 (M), Rennen am letzten Tag", () => {
    const hm = raceWeek("hm", 6);
    expect(hm.days[6].slot).toBe("RACE");
    expect(hm.hasLongRun).toBe(false);
    expect(hm.qCount).toBe(1);
    expect(hm.days.map((d) => d.slot).lastIndexOf("Q1")).toBeLessThanOrEqual(3);
    const m = raceWeek("m", 6);
    expect(m.days.map((d) => d.slot).lastIndexOf("Q1")).toBeLessThanOrEqual(2);
    expect(hm.runDayCount).toBe(5); // Frequenz bleibt (Schritt 6): 5 Lauftage, Rennen eingerechnet
  });

  it("Rennen am Sonntag, alle Tage frei: E bevorzugt an Renntag−2/−1, höchstens 2 Ruhetage direkt vor dem Rennen", () => {
    const line = (distance: Distance, runDays: RunDays) => compactWeek(raceWeek(distance, 6, { runDays }));
    // Seit Schritt 6 alle Lauftage inklusive Rennen (fullRunDaysUpToRunDays = 6).
    expect(line("m", 4)).toBe("Mo – · Di – · Mi Q1 · Do – · Fr E · Sa E · So RACE");
    expect(line("m", 3)).toBe("Mo – · Di – · Mi Q1 · Do – · Fr E · Sa – · So RACE");
    // 10k mit 4 Läufen: Q1 auf Mi (Renntag−4), damit am Wochenanfang nicht drei Ruhetage am Stück stehen und E an Renntag−2/−1 passt.
    expect(line("10k", 4)).toBe("Mo – · Di – · Mi Q1 · Do – · Fr E · Sa E · So RACE");
    // HM mit 5 Läufen: E am Montag bricht die Ruhetage am Wochenanfang, Q1 bleibt am Soll-Tag Do (Renntag−3).
    expect(line("hm", 5)).toBe("Mo E · Di – · Mi – · Do Q1 · Fr E · Sa E · So RACE");
    expect(line("m", 6)).toBe("Mo E · Di – · Mi Q1 · Do E · Fr E · Sa E · So RACE");
  });

  it("höchstens 2 Ruhetage am Stück auch am Wochenanfang: Mo/Do/Fr frei, 3 Tage → E rückt auf Mo (sonst Mo–Mi ohne Lauf)", () => {
    const input = weekInput({
      mode: "race",
      phase: "taper",
      distance: "10k",
      runDays: 3,
      availableDays: ["Mo", "Do", "Fr"],
      longRunDay: "Fr",
      raceDate: addDays(WEEK_START, 6),
      lastDayYmd: addDays(WEEK_START, 6),
      carry: NO_CARRY,
    });
    const layout = placeWeek(input);
    expect(compactWeek(layout)).toBe("Mo E · Di – · Mi – · Do Q1 · Fr – · Sa – · So RACE");
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
  });

  it("die Rennwoche hat alle Lauftage inklusive Rennen (Schritt 6: fullRunDaysUpToRunDays = 6)", () => {
    expect(raceWeek("10k", 6, { runDays: 3 }).runDayCount).toBe(3);
    expect(raceWeek("m", 6, { runDays: 3 }).runDayCount).toBe(3);
    expect(raceWeek("m", 6, { runDays: 4 }).runDayCount).toBe(4);
    expect(raceWeek("m", 6, { runDays: 6 }).runDayCount).toBe(6);
  });

  it("Fr/Sa nicht verfügbar, Do verfügbar: Beispielwoche mit höchstens 2 Ruhetagen direkt vor dem Rennen (die Regel selbst sichert die erschöpfende Rennwochen-Prüfung)", () => {
    const input = weekInput({
      mode: "race",
      phase: "taper",
      distance: "m",
      runDays: 5,
      availableDays: ["Mo", "Di", "Mi", "Do", "So"],
      longRunDay: "So",
      raceDate: addDays(WEEK_START, 6),
      lastDayYmd: addDays(WEEK_START, 6),
      carry: STEADY,
    });
    const layout = placeWeek(input);
    expect(compactWeek(layout)).toBe("Mo E · Di E · Mi Q1 · Do E · Fr – · Sa – · So RACE");
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
  });

  it("nur Mo/Di/Mi und So verfügbar: die Ruhetage direkt vor dem Rennen sind unvermeidbar und kein Verstoß", () => {
    const input = weekInput({
      mode: "race",
      phase: "taper",
      distance: "m",
      runDays: 4,
      availableDays: ["Mo", "Di", "Mi", "So"],
      longRunDay: "So",
      raceDate: addDays(WEEK_START, 6),
      lastDayYmd: addDays(WEEK_START, 6),
      carry: STEADY,
    });
    const layout = placeWeek(input);
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
    expect(layout.days.slice(3, 6).map((d) => d.slot)).toEqual(["REST", "REST", "REST"]);
  });

  it("Rennen am Mittwoch: kein zulässiger Q-Tag → kein Q, Hinweis q-dropped-race-gap", () => {
    const layout = raceWeek("hm", 2);
    expect(layout.days).toHaveLength(3);
    expect(layout.qCount).toBe(0);
    expect(layout.notes.map((n) => n.code)).toEqual(["q-dropped-race-gap"]);
    expect(layout.days[2].slot).toBe("RACE");
  });

  it("Rennen am Montag: die Rennwoche besteht nur aus dem Rennen; der Sonntag davor hat keinen harten Tag", () => {
    const layout = raceWeek("m", 0, { carry: NO_CARRY });
    expect(layout.days.map((d) => d.slot)).toEqual(["RACE"]);
    const taper = placeWeek(
      weekInput({
        mode: "taper",
        phase: "taper",
        raceDate: addDays(WEEK_START, 7),
        weekStartYmd: WEEK_START,
        nextHard: true,
        runDays: 5,
        carry: STEADY,
      }),
    );
    expect(isHardSlot(taper.days[6].slot)).toBe(false);
  });

  it("Long Run im Sperrfenster (Renntag−6 … −1) entfällt mit Hinweis und wird nicht verschoben", () => {
    // Taper-Woche Mo 4.1. … So 10.1., Rennen Mi 13.1.: der Sonntag liegt 3 Tage vor dem Rennen.
    const input = weekInput({ mode: "taper", phase: "taper", raceDate: "2027-01-13", runDays: 5, carry: STEADY });
    const layout = placeWeek(input);
    expect(layout.hasLongRun).toBe(false);
    expect(layout.notes.map((n) => n.code)).toContain("no-long-run-in-window");
    expect(layout.runDayCount).toBe(5);
    expect(layout.days.filter((d) => d.slot === "LR")).toEqual([]);
    expect(checkWeekLayout(layout, contextOf(input))).toEqual([]);
  });

  it("Rennwoche: erschöpfend über Renntag, Distanz, Lauftage, verfügbare Tage und Zustand", () => {
    const problems: string[] = [];
    const counter = { cases: 0 };
    availableSets().forEach((availableDays) =>
      ([3, 4, 5, 6] as RunDays[]).forEach((runDays) => {
        if (runDays > availableDays.length) return;
        for (let raceWeekday = 0; raceWeekday < 7; raceWeekday += 1) {
          (["m", "10k"] as Distance[]).forEach((distance) =>
            [NO_CARRY, STEADY].forEach((carry) => {
              // Rennen am Montag nach hartem Sonntag gibt es nicht: die Vorwoche setzt dann `nextHard`.
              if (raceWeekday === 0 && carry.prevHard) return;
              const raceDate = addDays(WEEK_START, raceWeekday);
              const input = weekInput({
                mode: "race",
                phase: "taper",
                distance,
                runDays,
                availableDays,
                longRunDay: availableDays[0],
                raceDate,
                lastDayYmd: raceDate,
                carry,
              });
              const layout = placeWeek(input);
              counter.cases += 1;
              checkWeekLayout(layout, contextOf(input)).forEach((code) =>
                problems.push(`${availableDays.join("")}|${runDays}|${raceWeekday}|${distance}|${JSON.stringify(carry)}: ${code}`),
              );
            }),
          );
        }
      }),
    );
    expect(counter.cases).toBeGreaterThan(5000);
    expect(problems.slice(0, 10)).toEqual([]);
  });
});

describe("Angebrochene Woche 1", () => {
  it("Start am Mittwoch: nur Mi–So, dieselbe Form wie die volle Woche an diesen Tagen", () => {
    const full = placeWeek(weekInput({ carry: STEADY, runDays: 5 }));
    const partial = placeWeek(
      weekInput({ carry: STEADY, runDays: 5, firstDayYmd: addDays(WEEK_START, 2), phase: "base", mode: "base" }),
    );
    expect(partial.days.map((d) => d.weekday)).toEqual(["Mi", "Do", "Fr", "Sa", "So"]);
    expect(partial.hasLongRun).toBe(true);
    expect(partial.runDayCount).toBeLessThanOrEqual(5);
    expect(full.runDayCount).toBe(5);
  });

  it("Long-Run-Tag vor dem Start: Woche 1 hat keinen Long Run, Hinweis, nichts wird verschoben", () => {
    const input = weekInput({ longRunDay: "Mo", firstDayYmd: addDays(WEEK_START, 2), runDays: 5 });
    const layout = placeWeek(input);
    expect(layout.hasLongRun).toBe(false);
    expect(layout.notes.map((n) => n.code)).toContain("no-long-run-in-window");
    expect(layout.days.some((d) => d.slot === "LR")).toBe(false);
  });
});

describe("resolveLongRunDay und Eingabeprüfung (§2)", () => {
  it("Vorgabe So, sonst Sa, sonst letzter verfügbarer Wochentag; angegebener Tag gewinnt", () => {
    expect(resolveLongRunDay({ availableDays: ALL })).toBe("So");
    expect(resolveLongRunDay({ availableDays: ["Mo", "Mi", "Sa"] })).toBe("Sa");
    expect(resolveLongRunDay({ availableDays: ["Mo", "Mi", "Fr"] })).toBe("Fr");
    expect(resolveLongRunDay({ availableDays: ["Fr", "Di", "Mi"] })).toBe("Fr");
    expect(resolveLongRunDay({ availableDays: ALL, longRunDay: "Mi" })).toBe("Mi");
  });

  const phasePlan = planPhases({ distance: "10k", raceDate: "2027-03-14", startYmd: "2027-01-04" });
  const base = { distance: "10k" as Distance, raceDate: "2027-03-14", runDaysPerWeek: 4 as RunDays, availableDays: ALL };

  function codeOf(fn: () => unknown): string {
    try {
      fn();
    } catch (error) {
      return isPlanCoreError(error) ? error.message : "other-error";
    }
    return "no-error";
  }

  it("weniger verfügbare Tage als Lauftage, doppelte oder ungültige Tage, unverfügbarer Long-Run-Tag → invalid-input", () => {
    expect(codeOf(() => layoutWeeks({ ...base, availableDays: ["Mo", "Di", "Mi"] }, phasePlan, { beginner: false }))).toBe(
      "invalid-input: availableDays",
    );
    expect(codeOf(() => layoutWeeks({ ...base, availableDays: ["Mo", "Mo", "Di", "Mi", "Do"] }, phasePlan, { beginner: false }))).toBe(
      "invalid-input: availableDays",
    );
    expect(
      codeOf(() => layoutWeeks({ ...base, availableDays: ["Mo", "Xx", "Di", "Mi", "Do"] as Weekday[] }, phasePlan, { beginner: false })),
    ).toBe("invalid-input: availableDays");
    expect(codeOf(() => layoutWeeks({ ...base, availableDays: ["Mo", "Di", "Mi", "Do"], longRunDay: "So" }, phasePlan, { beginner: false }))).toBe(
      "invalid-input: longRunDay",
    );
    expect(codeOf(() => layoutWeeks({ ...base, runDaysPerWeek: 7 as RunDays }, phasePlan, { beginner: false }))).toBe(
      "invalid-input: runDaysPerWeek",
    );
    expect(codeOf(() => layoutWeeks({ ...base, raceDate: "2027-02-30" }, phasePlan, { beginner: false }))).toBe(
      "invalid-input: raceDate",
    );
    expect(codeOf(() => layoutWeeks(base, phasePlan, { beginner: false }))).toBe("no-error");
  });
});

describe("Regressionen aus dem Altcode", () => {
  function plan(over: Partial<{ runDays: RunDays; availableDays: Weekday[]; longRunDay: Weekday; distance: Distance; weeks: number }>) {
    const distance = over.distance ?? "10k";
    const raceDate: Ymd = "2027-03-14";
    const weeks = over.weeks ?? 10;
    const startYmd = addDays("2027-03-08", -7 * (weeks - 1));
    const inputs = {
      distance,
      raceDate,
      runDaysPerWeek: over.runDays ?? 4,
      availableDays: over.availableDays ?? ALL,
      longRunDay: over.longRunDay,
    };
    const layouts = layoutWeeks(inputs, planPhases({ distance, raceDate, startYmd }), { beginner: false });
    return { layouts, inputs };
  }

  it("harte Einheiten So → Mo: bei Long Run So und verfügbarem Mo steht am Montag nie etwas Hartes (kein Q am Montag, keine Reparatur nötig)", () => {
    const { layouts, inputs } = plan({ runDays: 3, availableDays: ["Sa", "So", "Mo"], distance: "10k" });
    const all = layouts.reduce((list, layout) => list.concat(layout.days), [] as WeekLayout["days"]);
    const hardAfterHard = all.filter(
      (day, index) => day.weekday === "Mo" && index > 0 && isHardSlot(all[index - 1].slot) && isHardSlot(day.slot),
    );
    expect(hardAfterHard).toEqual([]);
    expect(all.filter((day) => day.weekday === "Mo" && isHardSlot(day.slot))).toEqual([]);
    expect(checkPlanLayouts(layouts, { ...inputs, longRunDay: "So" })).toEqual([]);
    // Die Folge: in den Hauptwochen entfällt Q1 mit Hinweis, statt gegen I6 zu verstoßen.
    const main = layouts.filter((layout) => layout.mode === "main");
    expect(main.length).toBeGreaterThan(0);
    main.forEach((layout) => expect(layout.notes.map((n) => n.code)).toContain("q1-dropped"));
  });

  it("nie mehr Lauftage als eingestellt: 5 Lauftage aus 7 verfügbaren ergeben in jeder vollen Woche genau 5 (Altcode: 6 trotz max. 5)", () => {
    (["5k", "10k", "hm", "m"] as Distance[]).forEach((distance) => {
      const { layouts } = plan({ runDays: 5, distance, weeks: 12 });
      layouts
        .filter((layout) => layout.days.length === 7 && layout.mode !== "race")
        .forEach((layout) => expect([distance, layout.wn, layout.runDayCount]).toEqual([distance, layout.wn, 5]));
    });
  });

  it("Plan über mehrere Wochen: eingeschwungene Aufbauwoche mit 6 Tagen entspricht dem Beispiel", () => {
    const { layouts } = plan({ runDays: 6, distance: "m", weeks: 16 });
    const build = layouts.filter((layout) => layout.phase === "build" && layout.days.length === 7);
    expect(build.length).toBeGreaterThan(1);
    build.forEach((layout) => expect(compactWeek(layout)).toBe("Mo REC · Di Q2 · Mi MLR · Do – · Fr Q1 · Sa E · So LR"));
  });

  it("der Löser setzt minEasyDaysBetweenHard = 1 voraus; Q-Soll-Tage stammen aus der Config (LR−3, LR+2)", () => {
    expect(CONFIG.placement.minEasyDaysBetweenHard.value).toBe(1);
    expect(CONFIG.placement.q1DaysBeforeLongRun.value).toBe(3);
    expect(CONFIG.placement.q2DaysAfterLongRun.value).toBe(2);
    // LR Sa, 5 Tage: Q2 genau 2 Tage danach (Mo), Q1 genau 3 Tage davor (Mi).
    const layout = placeWeek(weekInput({ runDays: 5, longRunDay: "Sa" }));
    const dayOf = (slot: string) => layout.days.filter((d) => d.slot === slot)[0].weekday;
    expect([dayOf("Q1"), dayOf("Q2")]).toEqual(["Mi", "Mo"]);
  });

  it("layoutWeeks ist deterministisch", () => {
    const first = plan({ runDays: 6, distance: "m", weeks: 14 }).layouts;
    const second = plan({ runDays: 6, distance: "m", weeks: 14 }).layouts;
    expect(second).toEqual(first);
  });
});
