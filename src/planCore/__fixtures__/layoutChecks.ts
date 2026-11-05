/**
 * Unabhängiger Prüfer für Wochenformen (Tests). Er benutzt den Löser nicht, sondern prüft nur die Ausgabe gegen
 * docs/plan-spec.md §6, §8 und die Invarianten I6, I7, I10, I13–I16 (Layout-Anteile). Leer = alles gehalten.
 * Liegt unter `__fixtures__`, weil Jest jede Datei unter `__tests__` als Testdatei behandelt.
 */

import { CONFIG } from "../config";
import { addDays, diffDays, WEEKDAYS } from "../dates";
import { findHardSpacingViolations, isHardSlot } from "../hard";
import type { LayoutCarry, WeekLayout } from "../placement";
import type { LayoutNoteCode, PlacedSlot, WeekMode } from "../templates";
import type { Distance, RunDays, Weekday, Ymd } from "../types";

export type WeekContext = {
  mode: WeekMode;
  distance: Distance;
  runDays: RunDays;
  availableDays: Weekday[];
  longRunDay: Weekday;
  raceDate: Ymd;
  carry: LayoutCarry;
  nextHard: boolean;
};

const cyc = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
};

const KNOWN_NOTES: LayoutNoteCode[] = [
  "q2-dropped",
  "q1-dropped",
  "q-dropped-race-gap",
  "mlr-as-e",
  "no-long-run-in-window",
];

const isQ = (slot: PlacedSlot): boolean => slot === "Q1" || slot === "Q1L" || slot === "Q2";

/** Eine Woche für sich (mit Zustand der Vorwoche und dem festen Harttag danach). */
export function checkWeekLayout(layout: WeekLayout, ctx: WeekContext): string[] {
  const out: string[] = [];
  const { days } = layout;
  const gap = CONFIG.raceWeek.lastQDaysBefore.value[ctx.distance];
  const noLr = CONFIG.raceWeek.noLongRunDaysBefore.value;
  const maxQ = CONFIG.placement.maxQ.value[ctx.runDays];
  const isRace = ctx.mode === "race";

  days.forEach((day, index) => {
    if (day.weekday !== WEEKDAYS[(WEEKDAYS.indexOf(days[0].weekday) + index) % 7]) out.push("days-not-contiguous");
    if (index > 0 && diffDays(day.ymd, days[index - 1].ymd) !== 1) out.push("days-not-consecutive");
    const runs = day.slot !== "REST";
    if (runs && day.slot !== "RACE" && ctx.availableDays.indexOf(day.weekday) < 0) out.push(`run-on-unavailable:${day.ymd}`);
    if (day.slot === "RACE" && (!isRace || day.ymd !== ctx.raceDate)) out.push(`race-misplaced:${day.ymd}`);
    if (isQ(day.slot) && diffDays(ctx.raceDate, day.ymd) < gap) out.push(`q-too-close-to-race:${day.ymd}`);
    if (day.slot === "LR" && diffDays(ctx.raceDate, day.ymd) <= noLr) out.push(`lr-too-close-to-race:${day.ymd}`);
    if (day.slot === "LR" && day.weekday !== ctx.longRunDay) out.push(`lr-on-wrong-day:${day.ymd}`);
  });

  const races = days.filter((day) => day.slot === "RACE").length;
  if (isRace && (races !== 1 || days[days.length - 1].slot !== "RACE")) out.push("race-week-without-race-last");
  if (!isRace && races !== 0) out.push("race-outside-race-week");
  if (days.filter((day) => day.slot === "LR").length > 1) out.push("more-than-one-lr");
  if (isRace && days.some((day) => day.slot === "LR")) out.push("lr-in-race-week");

  // Lauftage
  const runDayCount = days.filter((day) => day.slot !== "REST").length;
  if (runDayCount !== layout.runDayCount) out.push("run-day-count-mismatch");
  const full = days.length === 7;
  if (isRace) {
    const usable = days.filter((day) => day.slot !== "RACE" && ctx.availableDays.indexOf(day.weekday) >= 0).length;
    const expected = Math.min(ctx.runDays - CONFIG.taper.minRunDaysBelowRunDays.value, 1 + usable);
    if (runDayCount !== expected) out.push(`race-week-run-days:${runDayCount}!=${expected}`);
  } else if (full) {
    if (runDayCount !== ctx.runDays) out.push(`run-days:${runDayCount}!=${ctx.runDays}`);
  } else if (runDayCount > ctx.runDays) {
    out.push(`partial-week-too-many-runs:${runDayCount}`);
  }

  // Q-Zahl (I7, I13)
  const qCount = days.filter((day) => isQ(day.slot)).length;
  if (qCount !== layout.qCount) out.push("q-count-mismatch");
  if (qCount > maxQ) out.push(`q-count>${maxQ}`);
  if ((ctx.mode === "taper" || isRace) && qCount > CONFIG.taper.qualitySessionsPerWeek.value) out.push("taper-q>1");

  // I6 in der Woche und über beide Ränder
  const hardAt = (index: number): boolean => isHardSlot(days[index].slot);
  days.forEach((day, index) => {
    if (!hardAt(index)) return;
    if (index > 0 && hardAt(index - 1)) out.push(`hard-adjacent:${days[index - 1].ymd}>${day.ymd}`);
    if (index === 0 && day.weekday === "Mo" && (ctx.carry.prevHard || ctx.carry.prevMlrAfterHard)) {
      out.push(`hard-after-carry:${day.ymd}`);
    }
    if (index === days.length - 1 && day.weekday === "So" && ctx.nextHard) out.push(`hard-before-next-hard:${day.ymd}`);
  });
  const spacing = findHardSpacingViolations(days.map((day) => ({ ymd: day.ymd, hard: isHardSlot(day.slot) })));
  spacing.forEach((code) => out.push(code));

  // MLR: Abstand zum LR, Sandwich
  const lrIndexInWeek = WEEKDAYS.indexOf(ctx.longRunDay);
  days.forEach((day, index) => {
    if (day.slot !== "MLR") return;
    if (days.some((d) => d.slot === "LR") && cyc(WEEKDAYS.indexOf(day.weekday), lrIndexInWeek) < CONFIG.library.mlr.minDaysFromLongRun.value) {
      out.push(`mlr-too-close-to-lr:${day.ymd}`);
    }
    const before = index === 0 ? day.weekday === "Mo" && ctx.carry.prevHard : hardAt(index - 1);
    const after = index === days.length - 1 ? day.weekday === "So" && ctx.nextHard : hardAt(index + 1);
    if (before && after) out.push(`mlr-sandwich:${day.ymd}`);
  });

  layout.notes.forEach((note) => {
    if (KNOWN_NOTES.indexOf(note.code) < 0) out.push(`unknown-note:${note.code}`);
  });
  return out;
}

export type PlanContext = {
  distance: Distance;
  runDays: RunDays;
  availableDays: Weekday[];
  longRunDay: Weekday;
  raceDate: Ymd;
};

/** Der ganze Plan: Wochen hängen lückenlos aneinander, I6 und Sandwich über die Wochengrenzen, I10/I13–I16 (Layout). */
export function checkPlanLayouts(layouts: WeekLayout[], ctx: PlanContext): string[] {
  const out: string[] = [];
  const gap = CONFIG.raceWeek.lastQDaysBefore.value[ctx.distance];
  const noLr = CONFIG.raceWeek.noLongRunDaysBefore.value;
  const all = layouts.reduce((list, layout) => list.concat(layout.days), [] as WeekLayout["days"]);

  all.forEach((day, index) => {
    if (index > 0 && diffDays(day.ymd, all[index - 1].ymd) !== 1) out.push(`gap-between-days:${day.ymd}`);
  });
  if (all[all.length - 1].ymd !== ctx.raceDate) out.push("plan-does-not-end-on-race-day");
  if (all.filter((day) => day.slot === "RACE").length !== 1) out.push("not-exactly-one-race");

  // I6 über den ganzen Plan
  findHardSpacingViolations(all.map((day) => ({ ymd: day.ymd, hard: isHardSlot(day.slot) }))).forEach((code) =>
    out.push(code),
  );
  // Sandwich über den ganzen Plan
  all.forEach((day, index) => {
    if (day.slot !== "MLR") return;
    const before = index > 0 && isHardSlot(all[index - 1].slot);
    const after = index < all.length - 1 && isHardSlot(all[index + 1].slot);
    if (before && after) out.push(`mlr-sandwich-plan:${day.ymd}`);
  });
  // I15: die letzten zwei Tage vor dem Rennen ohne Long Run oder Q
  all.forEach((day) => {
    const before = diffDays(ctx.raceDate, day.ymd);
    if (before >= 1 && before <= CONFIG.raceWeek.lastDaysCount.value && isHardSlot(day.slot)) out.push(`hard-before-race:${day.ymd}`);
  });

  layouts.forEach((layout, index) => {
    const weekStart = addDays(layout.days[0].ymd, -((WEEKDAYS.indexOf(layout.days[0].weekday) + 0) % 7));
    const lrYmd = addDays(weekStart, WEEKDAYS.indexOf(ctx.longRunDay));
    const isRace = index === layouts.length - 1;
    const full = layout.days.length === 7;

    if (isRace) {
      // Kein Q im Fenster, wenn es keinen zulässigen Tag gibt; sonst genau eines (I13).
      // Der erste Tag scheidet aus, wenn die Vorwoche hart endete (oder mit MLR nach hartem Tag).
      const previous = layouts[index - 1];
      const lastPrev = previous === undefined ? undefined : previous.days[previous.days.length - 1];
      const beforeLastPrev = previous === undefined ? undefined : previous.days[previous.days.length - 2];
      const mondayBlocked =
        lastPrev !== undefined &&
        (isHardSlot(lastPrev.slot) || (lastPrev.slot === "MLR" && beforeLastPrev !== undefined && isHardSlot(beforeLastPrev.slot)));
      const usableQDays = layout.days.filter(
        (day, dayIndex) =>
          day.slot !== "RACE" &&
          ctx.availableDays.indexOf(day.weekday) >= 0 &&
          diffDays(ctx.raceDate, day.ymd) >= gap &&
          !(dayIndex === 0 && day.weekday === "Mo" && mondayBlocked),
      );
      if (usableQDays.length > 0 && layout.qCount !== 1) out.push(`race-week-q:${layout.qCount}`);
      if (usableQDays.length === 0 && layout.qCount !== 0) out.push("race-week-q-without-day");
      return;
    }

    // I10 (Layout): Long Run in jeder Nicht-Rennwoche, außer Long-Run-Tag vor dem Start oder im Sperrfenster.
    const lrInWindow = layout.days.some((day) => day.ymd === lrYmd);
    const lrAllowed = lrInWindow && diffDays(ctx.raceDate, lrYmd) > noLr;
    if (lrAllowed && !layout.hasLongRun) out.push(`missing-lr:${layout.wn}`);
    if (!lrAllowed && layout.hasLongRun) out.push(`lr-in-forbidden-spot:${layout.wn}`);
    if (!lrAllowed && !layout.notes.some((note) => note.code === "no-long-run-in-window")) out.push(`missing-lr-note:${layout.wn}`);

    if (layout.mode === "taper") {
      const dropped = layout.notes.some((note) => note.code === "q1-dropped" || note.code === "q-dropped-race-gap");
      if (full && layout.qCount !== 1 && !dropped) out.push(`taper-q:${layout.wn}:${layout.qCount}`);
      if (full && layout.runDayCount < ctx.runDays - CONFIG.taper.minRunDaysBelowRunDays.value) out.push(`taper-run-days:${layout.wn}`);
    }
  });
  return out;
}

/** Kompakte Darstellung einer Woche, z. B. "Mo REC · Di Q2 · Mi MLR · Do – · Fr Q1 · Sa E · So LR". */
export function compactWeek(layout: WeekLayout): string {
  return layout.days.map((day) => `${day.weekday} ${day.slot === "REST" ? "–" : day.slot}`).join(" · ");
}
