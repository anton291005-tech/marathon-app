/**
 * Platzierung der Wochenschablonen auf Wochentage (docs/plan-spec.md §6, §8).
 *
 * Ein deterministischer Löser zählt je Woche alle Möglichkeiten auf (Lauftage-Teilmenge × Zuordnung der Rollen) und
 * nimmt die beste nach fester Rangfolge. Es wird nie repariert oder verschoben: was nicht passt, entfällt mit einer
 * `LayoutNote` (erst Q2, dann Q1; MLR zählt weniger als jedes Q), die Zahl der Lauftage bleibt.
 *
 * Harte Regeln (jede Woche, auch über die Wochengrenze):
 * - Long Run, Q-Slots und Rennen gelten als hart (`isHardSlot`, Dauer und km sind noch unbekannt); zwischen zwei harten
 *   Tagen liegt mindestens ein Tag ohne harte Einheit (I6). Der Löser setzt `placement.minEasyDaysBetweenHard` = 1 voraus
 *   (Zustand der Vorwoche = ein Tag); `placement.test.ts` hält das fest.
 * - Q-Slots höchstens an Tagen mit Abstand `raceWeek.lastQDaysBefore` zum Rennen, Long Run höchstens an Tagen mit mehr
 *   als `raceWeek.noLongRunDaysBefore` Tagen Abstand (§8).
 * - MLR mindestens `library.mlr.minDaysFromLongRun` Tage (zyklisch) vom Long Run, und nie zwischen zwei harten Tagen.
 *
 * Rangfolge bei mehreren zulässigen Lösungen (kleiner ist besser, danach der Reihe nach):
 * 1. mehr Q-Slots, dann MLR behalten (Reihenfolge der Varianten);
 * 1b. nur Rennwoche, in dieser Reihenfolge: höchstens `maxRestDaysBeforeRace` Ruhetage direkt vor dem Rennen; höchstens
 *     `maxRestDaysInRow` Ruhetage am Stück (auch am Wochenanfang); verfügbare Tage an Renntag−1/−2 belegen, Renntag−2 vor −1
 *     (statt gleichmäßiger Abstände). Alle drei sind weich: Sie gelten, soweit `availableDays` und das Q es zulassen;
 * 2. MLR möglichst nicht direkt neben einem harten Tag;
 * 3. MLR möglichst weit vom Long Run;
 * 4. Q1 nahe Long Run − 3, Q2 nahe Long Run + 2 (Rennwoche: Q1 am spätesten zulässigen Tag);
 * 5. möglichst wenige direkt aufeinanderfolgende Lauftage;
 * 6. möglichst wenige Ruhetage direkt nach einem harten Tag;
 * 7. REC direkt nach dem Long Run, sonst nach einem harten Tag;
 * 8. frühere Wochentage zuerst (Tie-Break).
 */

import { CONFIG } from "./config";
import { addDays, diffDays, isYmd, WEEKDAYS } from "./dates";
import { isHardSlot } from "./hard";
import { isDistance, planCoreError } from "./phases";
import type { PhasePlan } from "./phases";
import { slotsFor, weekModeOf } from "./templates";
import type { LayoutNote, PlacedSlot, WeekMode } from "./templates";
import type { CoreInputs, CorePhase, Distance, RunDays, Weekday, Ymd } from "./types";

export type LayoutDay = { ymd: Ymd; weekday: Weekday; slot: PlacedSlot };

export type WeekLayout = {
  wn: number;
  phase: CorePhase;
  mode: WeekMode;
  /** Nur die Plantage der Woche (Woche 1 und Rennwoche können weniger als 7 haben), in Kalenderreihenfolge. */
  days: LayoutDay[];
  /** Tage mit Lauf inkl. Rennen. */
  runDayCount: number;
  /** Q1, Q1L und Q2. */
  qCount: number;
  hasLongRun: boolean;
  notes: LayoutNote[];
};

/** Zustand am Ende der Vorwoche, der die ersten Tage der nächsten Woche einschränkt. */
export type LayoutCarry = {
  /** Der letzte Tag der Vorwoche war hart. */
  prevHard: boolean;
  /** Der letzte Tag war ein MLR mit hartem Tag davor: am ersten Tag darf nichts Hartes stehen (sonst Sandwich). */
  prevMlrAfterHard: boolean;
};

export const NO_CARRY: LayoutCarry = { prevHard: false, prevMlrAfterHard: false };

export type LayoutInputs = Pick<
  CoreInputs,
  "distance" | "raceDate" | "runDaysPerWeek" | "availableDays" | "longRunDay"
>;

// ───────────────────────────── Eingaben ─────────────────────────────

/** Vorgabe nach §2: So, sonst Sa, sonst der letzte verfügbare Wochentag. Ein angegebener Tag muss verfügbar sein. */
export function resolveLongRunDay(inputs: Pick<CoreInputs, "availableDays" | "longRunDay">): Weekday {
  const available = inputs.availableDays;
  if (inputs.longRunDay !== undefined) {
    if (available.indexOf(inputs.longRunDay) < 0) throw planCoreError("invalid-input", "longRunDay");
    return inputs.longRunDay;
  }
  const defaults = CONFIG.inputs.defaultLongRunDays.value;
  for (let index = 0; index < defaults.length; index += 1) {
    if (available.indexOf(defaults[index]) >= 0) return defaults[index];
  }
  let last = -1;
  available.forEach((day) => {
    last = Math.max(last, WEEKDAYS.indexOf(day));
  });
  return WEEKDAYS[last];
}

function validateLayoutInputs(inputs: LayoutInputs): void {
  if (!isDistance(inputs.distance)) throw planCoreError("invalid-input", "distance");
  if (!isYmd(inputs.raceDate)) throw planCoreError("invalid-input", "raceDate");
  const runDays = CONFIG.scope.runDaysPerWeek.value;
  if (
    inputs.runDaysPerWeek % 1 !== 0 ||
    inputs.runDaysPerWeek < runDays.min ||
    inputs.runDaysPerWeek > runDays.max
  ) {
    throw planCoreError("invalid-input", "runDaysPerWeek");
  }
  const seen: Record<string, boolean> = {};
  inputs.availableDays.forEach((day) => {
    if (WEEKDAYS.indexOf(day) < 0 || seen[day]) throw planCoreError("invalid-input", "availableDays");
    seen[day] = true;
  });
  if (inputs.availableDays.length < inputs.runDaysPerWeek) throw planCoreError("invalid-input", "availableDays");
}

// ───────────────────────────── Löser ─────────────────────────────

type SolveSpec = {
  /** Tage (Mo = 0 … So = 6), an denen ein Lauf stehen darf. Der Renntag ist nie enthalten. */
  usable: boolean[];
  /** Tage, an denen ein Q stehen darf (Abstand zum Rennen). */
  qOk: boolean[];
  lrDay: number;
  lrPlaced: boolean;
  raceIdx: number;
  q1: boolean;
  q2: boolean;
  mlr: boolean;
  rec: boolean;
  /** Läufe ohne feste Rolle (E, REC); gibt der Wochenform die Zahl der Lauftage. */
  fillers: number;
  q1Target: number;
  q2Target: number;
  /** Abstände zwischen Tagen zyklisch rechnen (volle Woche) oder linear (Rennwoche). */
  cyclic: boolean;
  prevHard: boolean;
  prevMlrAfterHard: boolean;
  /** Der erste Tag der Folgewoche ist ein fester harter Tag (Long Run am Montag, Rennen am Montag). */
  nextHard: boolean;
};

const WEEK = 7;
const MAX_CACHE_ENTRIES = 200000;
let cacheEntries = 0;
let solveCache: Record<string, PlacedSlot[] | null> = {};

const cycDist = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WEEK - d);
};

function combinations(items: number[], size: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === size) {
      out.push(chosen.slice());
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      chosen.push(items[index]);
      pick(index + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

function lessThan(a: number[], b: number[]): boolean {
  for (let index = 0; index < a.length && index < b.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index];
  }
  return false;
}

function search(spec: SolveSpec): PlacedSlot[] | null {
  const baseHard: boolean[] = [];
  const taken: boolean[] = [];
  for (let i = 0; i < WEEK; i += 1) {
    baseHard.push(false);
    taken.push(false);
  }
  if (spec.lrPlaced) {
    baseHard[spec.lrDay] = true;
    taken[spec.lrDay] = true;
  }
  if (spec.raceIdx >= 0) {
    baseHard[spec.raceIdx] = true;
    taken[spec.raceIdx] = true;
  }
  const free: number[] = [];
  for (let i = 0; i < WEEK; i += 1) if (spec.usable[i] && !taken[i]) free.push(i);

  const dist = (a: number, b: number): number => (spec.cyclic ? cycDist(a, b) : Math.abs(a - b));
  const minMlrDays = CONFIG.library.mlr.minDaysFromLongRun.value;

  const q1Options = spec.q1 ? free.filter((i) => spec.qOk[i]) : [-1];
  const q2Options = spec.q2 ? free.filter((i) => spec.qOk[i]) : [-1];
  const mlrOptions = spec.mlr ? free : [-1];

  let best: { score: number[]; slots: PlacedSlot[] } | null = null;

  for (let a = 0; a < q1Options.length; a += 1) {
    const q1 = q1Options[a];
    for (let b = 0; b < q2Options.length; b += 1) {
      const q2 = q2Options[b];
      if (q2 >= 0 && q2 === q1) continue;
      const hard = baseHard.slice();
      if (q1 >= 0) hard[q1] = true;
      if (q2 >= 0) hard[q2] = true;

      let spacingOk = true;
      for (let i = 0; i < WEEK && spacingOk; i += 1) {
        if (!hard[i]) continue;
        if (i === 0 && (spec.prevHard || spec.prevMlrAfterHard)) spacingOk = false;
        else if (i === WEEK - 1 && spec.nextHard) spacingOk = false;
        else if (i < WEEK - 1 && hard[i + 1]) spacingOk = false;
      }
      if (!spacingOk) continue;

      for (let c = 0; c < mlrOptions.length; c += 1) {
        const mlr = mlrOptions[c];
        if (mlr >= 0 && (mlr === q1 || mlr === q2)) continue;
        let before = false;
        let after = false;
        if (mlr >= 0) {
          if (spec.lrPlaced && cycDist(mlr, spec.lrDay) < minMlrDays) continue;
          before = mlr === 0 ? spec.prevHard : hard[mlr - 1];
          after = mlr === WEEK - 1 ? spec.nextHard : hard[mlr + 1];
          if (CONFIG.placement.mlrNoSandwich.value && before && after) continue;
        }

        const rest = free.filter((i) => i !== q1 && i !== q2 && i !== mlr);
        if (rest.length < spec.fillers) continue;
        const fillerSets = combinations(rest, spec.fillers);

        for (let d = 0; d < fillerSets.length; d += 1) {
          const fillers = fillerSets[d];
          const run: boolean[] = hard.slice();
          if (mlr >= 0) run[mlr] = true;
          fillers.forEach((i) => {
            run[i] = true;
          });

          let pairs = 0;
          for (let i = 0; i < WEEK - 1; i += 1) if (run[i] && run[i + 1]) pairs += 1;
          if (spec.cyclic && run[WEEK - 1] && run[0]) pairs += 1;

          const afterHard = (i: number): boolean => (i === 0 ? spec.prevHard : hard[i - 1]);
          let restAfterHard = 0;
          for (let i = 0; i < WEEK; i += 1) if (spec.usable[i] && !run[i] && afterHard(i)) restAfterHard += 1;

          let recDay = -1;
          let recPenalty = 0;
          if (spec.rec && fillers.length > 0) {
            recPenalty = 3;
            for (let k = 0; k < fillers.length; k += 1) {
              const i = fillers[k];
              const penalty = spec.lrPlaced && (i - 1 + WEEK) % WEEK === spec.lrDay ? 0 : afterHard(i) ? 1 : 2;
              if (penalty < recPenalty) {
                recPenalty = penalty;
                recDay = i;
              }
            }
          }

          const qDeviation =
            (q1 >= 0 ? dist(q1, spec.q1Target) : 0) + (q2 >= 0 ? dist(q2, spec.q2Target) : 0);
          // Rennwoche: höchstens `maxRestDaysBeforeRace` Ruhetage direkt vor dem Rennen, E/REC bevorzugt an Renntag−2, dann −1.
          let raceRestPenalty = 0;
          let raceStreakPenalty = 0;
          let raceUnused = 0;
          let raceUnusedFar = 0;
          if (spec.raceIdx >= 0) {
            let restRun = 0;
            for (let i = spec.raceIdx - 1; i >= 0 && !run[i]; i -= 1) restRun += 1;
            raceRestPenalty = Math.max(0, restRun - CONFIG.raceWeek.maxRestDaysBeforeRace.value);
            let streak = 0;
            let longest = 0;
            for (let i = 0; i < spec.raceIdx; i += 1) {
              streak = run[i] ? 0 : streak + 1;
              longest = Math.max(longest, streak);
            }
            raceStreakPenalty = Math.max(0, longest - CONFIG.raceWeek.maxRestDaysInRow.value);
            const lastDays = CONFIG.raceWeek.lastDaysCount.value;
            for (let back = 1; back <= lastDays; back += 1) {
              const i = spec.raceIdx - back;
              if (i >= 0 && spec.usable[i] && !run[i]) {
                raceUnused += 1;
                if (back === lastDays) raceUnusedFar += 1;
              }
            }
          }
          const score = [
            raceRestPenalty,
            raceStreakPenalty,
            raceUnused,
            raceUnusedFar,
            mlr >= 0 ? (before ? 1 : 0) + (after ? 1 : 0) : 0,
            mlr >= 0 && spec.lrPlaced ? -cycDist(mlr, spec.lrDay) : 0,
            qDeviation,
            pairs,
            restAfterHard,
            recPenalty,
            q1,
            q2,
            mlr,
          ].concat(fillers);

          if (best === null || lessThan(score, best.score)) {
            const slots: PlacedSlot[] = [];
            for (let i = 0; i < WEEK; i += 1) slots.push("REST");
            if (spec.lrPlaced) slots[spec.lrDay] = "LR";
            if (spec.raceIdx >= 0) slots[spec.raceIdx] = "RACE";
            if (q1 >= 0) slots[q1] = "Q1";
            if (q2 >= 0) slots[q2] = "Q2";
            if (mlr >= 0) slots[mlr] = "MLR";
            fillers.forEach((i) => {
              slots[i] = i === recDay ? "REC" : "E";
            });
            best = { score, slots };
          }
        }
      }
    }
  }
  return best === null ? null : best.slots;
}

function solve(spec: SolveSpec): PlacedSlot[] | null {
  const key = JSON.stringify(spec);
  if (Object.prototype.hasOwnProperty.call(solveCache, key)) return solveCache[key];
  if (cacheEntries >= MAX_CACHE_ENTRIES) {
    solveCache = {};
    cacheEntries = 0;
  }
  const result = search(spec);
  solveCache[key] = result;
  cacheEntries += 1;
  return result;
}

// ───────────────────────────── Woche ─────────────────────────────

export type PlaceWeekInput = {
  wn: number;
  phase: CorePhase;
  mode: WeekMode;
  /** Montag der Woche. */
  weekStartYmd: Ymd;
  /** Erster und letzter Plantag der Woche (Woche 1 ab Planstart, Rennwoche bis zum Renntag). */
  firstDayYmd: Ymd;
  lastDayYmd: Ymd;
  distance: Distance;
  runDays: RunDays;
  beginner: boolean;
  availableDays: Weekday[];
  longRunDay: Weekday;
  raceDate: Ymd;
  carry: LayoutCarry;
  nextHard: boolean;
};

/**
 * Eine Woche. Nicht-Rennwochen werden als volle Woche Mo–So gelöst und danach auf die Plantage gekürzt (eine
 * angebrochene Woche 1 behält so genau die Tage, die die volle Wochenform dort hat); die Rennwoche wird nur auf
 * Mo … Renntag gelöst. Ein Long Run, der dabei wegfällt, bekommt `no-long-run-in-window` und wird nicht verschoben.
 */
export function placeWeek(input: PlaceWeekInput): WeekLayout {
  const { mode, distance, runDays, raceDate } = input;
  const isRace = mode === "race";
  const dayYmd: Ymd[] = [];
  for (let i = 0; i < WEEK; i += 1) dayYmd.push(addDays(input.weekStartYmd, i));
  const inWindow = dayYmd.map((ymd) => ymd >= input.firstDayYmd && ymd <= input.lastDayYmd);
  const available = WEEKDAYS.map((day) => input.availableDays.indexOf(day) >= 0);
  const lrDay = WEEKDAYS.indexOf(input.longRunDay);
  const raceIdx = isRace ? diffDays(raceDate, input.weekStartYmd) : -1;
  if (isRace && (raceIdx < 0 || raceIdx >= WEEK || input.lastDayYmd !== raceDate)) {
    throw planCoreError("invalid-input", "raceDate");
  }

  const usable = available.map((isAvailable, i) => isAvailable && i !== raceIdx && (!isRace || inWindow[i]));
  const usableCount = usable.filter((isUsable) => isUsable).length;
  const gap = CONFIG.raceWeek.lastQDaysBefore.value[distance];
  const noLrDays = CONFIG.raceWeek.noLongRunDaysBefore.value;
  const qOk = dayYmd.map((ymd) => diffDays(raceDate, ymd) >= gap);
  const lrOk = dayYmd.map((ymd) => diffDays(raceDate, ymd) > noLrDays);

  const slots = slotsFor({ distance, runDays, mode, phase: input.phase, beginner: input.beginner });
  const wantLr = slots.indexOf("LR") >= 0;
  const q1Light = slots.indexOf("Q1L") >= 0;
  const wantQ1 = slots.indexOf("Q1") >= 0 || q1Light;
  const wantQ2 = slots.indexOf("Q2") >= 0;
  const wantMlr = slots.indexOf("MLR") >= 0;
  const wantRec = slots.indexOf("REC") >= 0;
  const wantQ = wantQ2 ? 2 : wantQ1 ? 1 : 0;
  const lrPlaced = wantLr && usable[lrDay] && lrOk[lrDay];
  const total = slots.length;

  const { q1DaysBeforeLongRun, q2DaysAfterLongRun } = CONFIG.placement;
  const q1Target = isRace ? raceIdx - gap : (lrDay - q1DaysBeforeLongRun.value + WEEK) % WEEK;
  const q2Target = isRace ? raceIdx - gap : (lrDay + q2DaysAfterLongRun.value) % WEEK;

  const trySolve = (q: number, mlrKept: boolean, relaxedQ: boolean): PlacedSlot[] | null => {
    const fixed = (lrPlaced ? 1 : 0) + q + (mlrKept ? 1 : 0);
    if (fixed > usableCount) return null;
    const fillers = Math.max(0, Math.min(total, usableCount) - fixed);
    return solve({
      usable,
      qOk: relaxedQ ? qOk.map(() => true) : qOk,
      lrDay,
      lrPlaced,
      raceIdx,
      q1: q >= 1,
      q2: q >= 2,
      mlr: mlrKept,
      rec: wantRec && fillers > 0,
      fillers,
      q1Target,
      q2Target,
      cyclic: !isRace,
      prevHard: input.carry.prevHard,
      prevMlrAfterHard: input.carry.prevMlrAfterHard,
      nextHard: input.nextHard,
    });
  };

  let chosen: PlacedSlot[] | null = null;
  let usedQ = 0;
  let usedMlr = false;
  for (let q = wantQ; q >= 0 && chosen === null; q -= 1) {
    const keeps = wantMlr ? [true, false] : [false];
    for (let k = 0; k < keeps.length && chosen === null; k += 1) {
      chosen = trySolve(q, keeps[k], false);
      if (chosen !== null) {
        usedQ = q;
        usedMlr = keeps[k];
      }
    }
  }
  if (chosen === null) throw planCoreError("invalid-input", "week-layout");

  const notes: LayoutNote[] = [];
  if (usedQ < wantQ) {
    // Rennwoche und Wochen, in denen dieselbe Wahl ohne Rennabstand ginge: Rennabstand. Sonst die Abstände zwischen den harten Tagen.
    const byRaceGap = isRace || (usable.some((u, i) => u && !qOk[i]) && trySolve(usedQ + 1, usedMlr, true) !== null);
    if (wantQ2 && usedQ < 2) notes.push({ code: byRaceGap ? "q-dropped-race-gap" : "q2-dropped", slot: "Q2" });
    if (wantQ1 && usedQ < 1) notes.push({ code: byRaceGap ? "q-dropped-race-gap" : "q1-dropped", slot: "Q1" });
  }
  if (wantMlr && !usedMlr) notes.push({ code: "mlr-as-e", slot: "MLR" });

  const days: LayoutDay[] = [];
  for (let i = 0; i < WEEK; i += 1) {
    if (!inWindow[i]) continue;
    const slot = chosen[i] === "Q1" && q1Light ? "Q1L" : chosen[i];
    days.push({ ymd: dayYmd[i], weekday: WEEKDAYS[i], slot });
  }
  const hasLongRun = days.some((day) => day.slot === "LR");
  if (wantLr && !hasLongRun) notes.push({ code: "no-long-run-in-window", slot: "LR" });

  return {
    wn: input.wn,
    phase: input.phase,
    mode,
    days,
    runDayCount: days.filter((day) => day.slot !== "REST").length,
    qCount: days.filter((day) => day.slot === "Q1" || day.slot === "Q1L" || day.slot === "Q2").length,
    hasLongRun,
    notes,
  };
}

/** Zustand für die nächste Woche aus dem letzten Tag dieser Woche. */
export function carryOf(layout: WeekLayout): LayoutCarry {
  const last = layout.days[layout.days.length - 1];
  const before = layout.days.length > 1 ? layout.days[layout.days.length - 2] : undefined;
  if (last === undefined) return NO_CARRY;
  return {
    prevHard: isHardSlot(last.slot),
    prevMlrAfterHard: last.slot === "MLR" && before !== undefined && isHardSlot(before.slot),
  };
}

// ───────────────────────────── Plan ─────────────────────────────

/**
 * Wochenformen für den ganzen Plan, von Woche 1 bis zur Rennwoche. `phasePlan` kommt aus `planPhases`,
 * `beginner` aus `buildPaceProfile(...).mode === "beginner"`. Rechnet von links nach rechts und reicht den Zustand am
 * Wochenende weiter, damit I6 und die Sandwich-Regel auch zwischen So und Mo halten.
 */
export function layoutWeeks(
  inputs: LayoutInputs,
  phasePlan: PhasePlan,
  options: { beginner: boolean },
): WeekLayout[] {
  validateLayoutInputs(inputs);
  const longRunDay = resolveLongRunDay(inputs);
  const lrIndex = WEEKDAYS.indexOf(longRunDay);
  const weeks = phasePlan.weeks;
  const lastIndex = weeks.length - 1;

  const nextHardAfter = (index: number): boolean => {
    const next = weeks[index + 1];
    if (next === undefined) return false;
    if (index + 1 === lastIndex) return next.firstDayYmd === inputs.raceDate;
    return lrIndex === 0 && diffDays(inputs.raceDate, next.startYmd) > CONFIG.raceWeek.noLongRunDaysBefore.value;
  };
  const inputFor = (index: number, carry: LayoutCarry, fullWeek: boolean): PlaceWeekInput => {
    const week = weeks[index];
    return {
      wn: week.wn,
      phase: week.phase,
      mode: weekModeOf(week.phase, index === lastIndex),
      weekStartYmd: week.startYmd,
      firstDayYmd: fullWeek ? week.startYmd : week.firstDayYmd,
      lastDayYmd: fullWeek ? addDays(week.startYmd, WEEK - 1) : week.lastDayYmd,
      distance: inputs.distance,
      runDays: inputs.runDaysPerWeek,
      beginner: options.beginner,
      availableDays: inputs.availableDays,
      longRunDay,
      raceDate: inputs.raceDate,
      carry,
      nextHard: nextHardAfter(index),
    };
  };

  // Woche 1 hat keine Vorwoche. Damit sie nicht anders aussieht als die Folgewochen (Beispiel: Verfügbar Mo/Di/Fr/Sa/So,
  // 4 Tage Basis: mit Übertrag läuft die Woche Mo/Di/Fr/So, ohne Sa statt Mo/Di), startet sie mit dem Zustand, den eine volle
  // Vorwoche gleicher Art hinterließe (zwei Probeläufe). Der Property-Test hält fest: Woche 1 = Ausschnitt der Folgewoche.
  let carry = NO_CARRY;
  if (weeks.length > 1) {
    for (let probe = 0; probe < 2; probe += 1) carry = carryOf(placeWeek(inputFor(0, carry, true)));
  }

  const out: WeekLayout[] = [];
  for (let index = 0; index < weeks.length; index += 1) {
    const layout = placeWeek(inputFor(index, carry, false));
    out.push(layout);
    carry = carryOf(layout);
  }
  return out;
}
