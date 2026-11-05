/**
 * Invarianten-Prüfer des Plan-Kerns (docs/plan-spec.md §12, Schritt 7a). Eine Quelle für Tests, Server und App.
 *
 * `checkPlan(plan, inputs)` prüft einen fertigen `SessionPlan` (Wochenformen, Einheiten, Volumen, Paces) und liefert
 * maschinenlesbare Verstöße ohne Nutzerinhalte: Code (I1–I22 oder Regelgruppe), Regel, Schwere, Woche, Tag, Ist/Soll.
 * Der Prüfer benutzt die Bau-Funktionen nicht, sondern rechnet aus den Bausteinen und den Config-Zahlen nach; geteilt
 * sind nur die Definitionen „hart“ (`hard.ts`) und die Wahl des Long-Run-Tags.
 *
 * Schwere (freigegeben 2026-11-05): `error` = Sicherheitsgrenze, verletzte Vorgabe des Nutzers oder für die App kaputter
 * Plan (Server verweigert ihn); `warning` = Zielwert, Qualitätsregel, Mittelwert oder begründete Abweichung. Jede
 * error-Grenze auf Zahlen hat eine Toleranz (0,1 km, 0,5 Prozentpunkte, 1 min): Überschreitung innerhalb der Toleranz
 * ist `warning`, darüber `error`. Begründete Abweichungen (ein Hinweis des Kerns erklärt sie, die Bedingung des
 * Hinweises stimmt nachgerechnet) erscheinen als `warning` mit eigener Regel (`reasoned`).
 *
 * I19 (Claude-Text-Schritt, §11) ist im MVP nicht anwendbar, I20 (Determinismus) prüft der Property-Test; I21/I22
 * prüft `checkAssembledPlan` am fertigen `CorePlan` (Schritt 7b).
 */

import { CONFIG } from "./config";
import { addDays, diffDays, WEEKDAYS } from "./dates";
import { findHardSpacingViolations, isHardSession, isHardSlot } from "./hard";
import { carryOf, NO_CARRY, resolveLongRunDay } from "./placement";
import type { LayoutCarry, WeekLayout } from "./placement";
import type { SessionPlan, WeekSessions } from "./planSessions";
import type { CoreSession, Segment } from "./sessions";
import type { LayoutNoteCode, PlacedSlot, WeekMode } from "./templates";
import type { CoreInputs, CoreKind, Distance, RunDays, Weekday, Ymd } from "./types";
import type { PlanVolume } from "./volume";

// ───────────────────────────── Regeln ─────────────────────────────

export type Severity = "error" | "warning";

export type InvariantCode =
  | "I1"
  | "I2"
  | "I3"
  | "I4"
  | "I5"
  | "I6"
  | "I7"
  | "I8"
  | "I9"
  | "I10"
  | "I11"
  | "I12"
  | "I13"
  | "I14"
  | "I15"
  | "I16"
  | "I17"
  | "I18"
  | "I21"
  | "I22"
  /** Mindestgrößen der Q-Einheiten (§7, Review-Punkt 31). */
  | "QMIN"
  /** Einsteiger-Modus (§3, §7.2). */
  | "BEGINNER"
  /** Volumenplan: Struktur und Verlauf, soweit nicht I3–I5/I13. */
  | "VOLUME"
  /** Wochenformen: Struktur und weiche Regeln der Platzierung (§6). */
  | "LAYOUT"
  /** Fertiger Plan (`CorePlan`): IDs. */
  | "PLAN";

export type ToleranceUnit = "km" | "share" | "min";

/** Toleranz der error-Grenzen (freigegeben 2026-11-05): 0,1 km, 0,5 Prozentpunkte, 1 min. */
export const INVARIANT_TOLERANCE: Readonly<Record<ToleranceUnit, number>> = { km: 0.1, share: 0.005, min: 1 };

export type RuleDef = {
  code: InvariantCode;
  severity: Severity;
  /** Nur bei `error` auf Zahlen: bis zu `INVARIANT_TOLERANCE[unit]` über (bzw. unter) der Grenze ist es `warning`. */
  tolerance?: ToleranceUnit;
  /** Begründete Abweichung (Hinweis des Kerns): immer `warning`. */
  reasoned?: true;
};

const err = (code: InvariantCode, tolerance?: ToleranceUnit): RuleDef => (tolerance ? { code, severity: "error", tolerance } : { code, severity: "error" });
const warn = (code: InvariantCode): RuleDef => ({ code, severity: "warning" });
const reasoned = (code: InvariantCode): RuleDef => ({ code, severity: "warning", reasoned: true });

/**
 * Alle Regeln mit Schwere, Schlüssel `Code/regel`. Begründung der Einteilung im Kopf der Datei und in
 * docs/plan-core-plan.md (Schritt 7).
 */
export const INVARIANT_RULES = {
  // I1 Summen
  "I1/week-sum": err("I1", "km"),
  "I1/segments-sum": err("I1", "km"),
  "I1/zero-km": err("I1"),
  "I1/race-week-sum": err("I1", "km"),
  // I2 Typen und Limits der Einheiten
  "I2/slot-kind": err("I2"),
  "I2/mlr-distance": err("I2"),
  "I2/below-15-min": err("I2", "min"),
  "I2/shortened-not-to-long-run": err("I2"),
  "I2/fit-note-outside-build": err("I2"),
  "I2/fit-note-without-shortening": err("I2"),
  "I2/too-short": warn("I2"),
  "I2/too-long": warn("I2"),
  "I2/warmup-cooldown": warn("I2"),
  "I2/strides": warn("I2"),
  "I2/e-shortened-to-long-run": reasoned("I2"),
  "I2/e-shortened-to-fit-week": reasoned("I2"),
  "I2/mlr-as-e": reasoned("I2"),
  "I2/q-softened": reasoned("I2"),
  // I3–I5 Volumen
  "I3/two-week": err("I3", "km"),
  "I4/weekly": warn("I4"),
  "I4/after-recovery": warn("I4"),
  "I4/drop": warn("I4"),
  "I4/peak-not-last": warn("I4"),
  "I4/shown-drop": warn("I4"),
  "I4/shown-above-peak-week": warn("I4"),
  "I5/cap": err("I5", "km"),
  "I5/recovery-above-previous": warn("I5"),
  "I5/recovery-too-deep": warn("I5"),
  "I5/recovery-too-shallow": warn("I5"),
  "I5/min-week-km-raised": reasoned("I5"),
  // I6 harte Tage
  "I6/hard-spacing": err("I6"),
  "I6/hard-adjacent": err("I6"),
  "I6/hard-after-carry": err("I6"),
  "I6/hard-before-next-hard": err("I6"),
  "I6/harder-than-layout": err("I6"),
  "I6/mlr-sandwich": err("I6"),
  // I7, I8
  "I7/q-count": err("I7"),
  "I8/quality-share": err("I8", "share"),
  // I9 Long Run
  "I9/share": err("I9", "share"),
  "I9/minutes": err("I9", "min"),
  "I9/below-15-min": err("I9", "min"),
  "I9/start": err("I9", "km"),
  "I9/step": err("I9", "km"),
  "I9/after-recovery": err("I9", "km"),
  "I9/recovery": err("I9", "km"),
  "I9/taper": err("I9", "km"),
  "I9/raised-not-to-minimum": err("I9"),
  "I9/long-run-raised-to-minimum": reasoned("I9"),
  // I10 Long Run je Woche
  "I10/missing-long-run": warn("I10"),
  "I10/long-run-forbidden": warn("I10"),
  "I10/missing-note": warn("I10"),
  "I10/more-than-one": warn("I10"),
  "I10/layout-mismatch": warn("I10"),
  "I10/no-long-run-in-window": reasoned("I10"),
  // I11 lockere Einheiten und Long Run
  "I11/longer-than-long-run": warn("I11"),
  "I11/above-share": warn("I11"),
  "I11/note-mismatch": warn("I11"),
  "I11/e-above-75-percent-long-run": reasoned("I11"),
  // I12 Q-Limits
  "I12/t-share": err("I12", "share"),
  "I12/i-share": err("I12", "share"),
  "I12/i-km": err("I12", "km"),
  "I12/r-share": err("I12", "share"),
  "I12/r-km": err("I12", "km"),
  "I12/m-km": err("I12", "km"),
  "I12/m-minutes": err("I12", "min"),
  "I12/m-near-long-run": err("I12", "km"),
  "I12/recovery-q1": err("I12", "km"),
  "I12/lrm-share": err("I12", "share"),
  "I12/lrm-km": err("I12", "km"),
  "I12/lrm-minutes": err("I12", "min"),
  "I12/r-distance": err("I12"),
  // I13 Taper
  "I13/taper-q": warn("I13"),
  "I13/beginner-race-week-q": warn("I13"),
  "I13/taper-mean": warn("I13"),
  "I13/taper-q-excused": reasoned("I13"),
  "I13/taper-mean-excused": reasoned("I13"),
  // I14 Rennen
  "I14/race": err("I14"),
  "I14/race-km": err("I14", "km"),
  "I14/plan-end": err("I14"),
  // I15 Abstände vor dem Rennen
  "I15/q-too-close": err("I15"),
  "I15/long-run-too-close": err("I15"),
  "I15/hard-before-race": err("I15"),
  "I15/last-days-minutes": err("I15", "min"),
  "I15/race-week-rest-gap": warn("I15"),
  "I15/race-week-rest-streak": warn("I15"),
  "I15/race-week-filler-too-early": warn("I15"),
  // I16 Lauftage
  "I16/unavailable-day": err("I16"),
  "I16/long-run-day": err("I16"),
  "I16/run-days": err("I16"),
  "I16/partial-week-run-days": err("I16"),
  "I16/taper-run-days": err("I16"),
  "I16/race-week-run-days": warn("I16"),
  // I17, I18 Paces
  "I17/pace-order": err("I17"),
  "I18/goal-pace": err("I18"),
  // I21, I22 fertiger Plan (Schritt 7b)
  "I21/week-meta": err("I21"),
  "I22/recovery-focus": err("I22"),
  // Mindestgrößen, Einsteiger
  "QMIN/m": warn("QMIN"),
  "QMIN/t": warn("QMIN"),
  "QMIN/i": warn("QMIN"),
  "QMIN/r": warn("QMIN"),
  "QMIN/race-pace-rep-length": warn("QMIN"),
  "QMIN/lrm-block": warn("QMIN"),
  "BEGINNER/i-r": err("BEGINNER"),
  "BEGINNER/not-by-minutes": warn("BEGINNER"),
  // Volumenplan
  "VOLUME/structure": err("VOLUME"),
  "VOLUME/too-many-weeks": warn("VOLUME"),
  "VOLUME/above-curve": warn("VOLUME"),
  "VOLUME/peak-km": warn("VOLUME"),
  "VOLUME/week-one": warn("VOLUME"),
  "VOLUME/recovery-position": warn("VOLUME"),
  "VOLUME/taper-structure": warn("VOLUME"),
  "VOLUME/off-target": warn("VOLUME"),
  "VOLUME/week-km-reduced": reasoned("VOLUME"),
  "VOLUME/week-km-raised": reasoned("VOLUME"),
  // Wochenformen
  "LAYOUT/structure": err("LAYOUT"),
  "LAYOUT/counts": warn("LAYOUT"),
  "LAYOUT/mlr-near-long-run": warn("LAYOUT"),
  "LAYOUT/unknown-note": warn("LAYOUT"),
  // Fertiger Plan
  "PLAN/duplicate-id": err("PLAN"),
} as const;

export type RuleKey = keyof typeof INVARIANT_RULES;

export type Violation = {
  code: InvariantCode;
  /** Regel innerhalb des Codes, z. B. "share" bei `I9/share`. */
  rule: string;
  severity: Severity;
  reasoned?: true;
  wn?: number;
  ymd?: Ymd;
  actual?: number;
  limit?: number;
  unit?: ToleranceUnit | "count";
};

export type CheckResult = { violations: Violation[]; errors: number; warnings: number };

/** Für Server-Logs (freigegeben 2026-11-05): nur Code, Regel und Woche, kein Tag, keine Zahlen des Nutzers. */
export function toLogEntries(violations: Violation[]): Array<{ code: InvariantCode; rule: string; wn?: number; severity: Severity }> {
  return violations.map((v) => (v.wn === undefined ? { code: v.code, rule: v.rule, severity: v.severity } : { code: v.code, rule: v.rule, wn: v.wn, severity: v.severity }));
}

const EPS = 1e-6;
/** Rundungsrauschen: km sind auf 0,1 gerundet, Grenzen auf- bzw. abgerundet. */
const NOISE_MIN = 0.05;

const r1 = (value: number): number => Math.round(value * 10) / 10;
const r3 = (value: number): number => Math.round(value * 1000) / 1000;

type Where = { wn?: number; ymd?: Ymd };

/** Sammelt Verstöße; `over`/`under` setzen die Schwere nach Toleranz. */
class Collector {
  readonly list: Violation[] = [];

  flag(key: RuleKey, where: Where = {}, numbers: { actual?: number; limit?: number; unit?: Violation["unit"] } = {}, severity?: Severity): void {
    const def: RuleDef = INVARIANT_RULES[key];
    const violation: Violation = { code: def.code, rule: key.slice(key.indexOf("/") + 1), severity: severity ?? def.severity };
    if (def.reasoned) violation.reasoned = true;
    if (where.wn !== undefined) violation.wn = where.wn;
    if (where.ymd !== undefined) violation.ymd = where.ymd;
    if (numbers.actual !== undefined) violation.actual = r3(numbers.actual);
    if (numbers.limit !== undefined) violation.limit = r3(numbers.limit);
    if (numbers.unit !== undefined) violation.unit = numbers.unit;
    this.list.push(violation);
  }

  /** Grenze nach oben. `noise`: Rundungsrauschen, das noch kein Verstoß ist. */
  over(key: RuleKey, actual: number, limit: number, where: Where, unit: ToleranceUnit, noise = unit === "min" ? NOISE_MIN : EPS): void {
    if (!(actual > limit + noise)) return;
    this.flag(key, where, { actual, limit, unit }, this.severityFor(key, actual - limit));
  }

  /** Grenze nach unten. */
  under(key: RuleKey, actual: number, limit: number, where: Where, unit: ToleranceUnit, noise = unit === "min" ? NOISE_MIN : EPS): void {
    if (!(actual < limit - noise)) return;
    this.flag(key, where, { actual, limit, unit }, this.severityFor(key, limit - actual));
  }

  private severityFor(key: RuleKey, excess: number): Severity {
    const def: RuleDef = INVARIANT_RULES[key];
    if (def.severity === "error" && def.tolerance !== undefined && excess <= INVARIANT_TOLERANCE[def.tolerance] + EPS) return "warning";
    return def.severity;
  }
}

function resultOf(list: Violation[]): CheckResult {
  // Layout- und Einheiten-Prüfung können denselben Verstoß melden (gleicher Tag, gleiche Regel): einmal zählen.
  const seen: Record<string, boolean> = {};
  const violations = list.filter((v) => {
    const key = `${v.code}/${v.rule}/${v.wn ?? ""}/${v.ymd ?? ""}/${v.severity}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  return {
    violations,
    errors: violations.filter((v) => v.severity === "error").length,
    warnings: violations.filter((v) => v.severity === "warning").length,
  };
}

// ───────────────────────────── Wochenformen ─────────────────────────────

export type WeekLayoutContext = {
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

const KNOWN_LAYOUT_NOTES: LayoutNoteCode[] = ["q2-dropped", "q1-dropped", "q-dropped-race-gap", "mlr-as-e", "no-long-run-in-window"];

const isQ = (slot: PlacedSlot): boolean => slot === "Q1" || slot === "Q1L" || slot === "Q2";

/** Eine Wochenform für sich (mit Zustand der Vorwoche und dem festen Harttag danach): §6, §8, I6, I7, I13–I16. */
export function checkWeekLayout(layout: WeekLayout, ctx: WeekLayoutContext): Violation[] {
  const c = new Collector();
  weekLayoutInto(c, layout, ctx);
  return c.list;
}

function weekLayoutInto(c: Collector, layout: WeekLayout, ctx: WeekLayoutContext): void {
  const { days, wn } = layout;
  const gap = CONFIG.raceWeek.lastQDaysBefore.value[ctx.distance];
  const noLr = CONFIG.raceWeek.noLongRunDaysBefore.value;
  const maxQ = CONFIG.placement.maxQ.value[ctx.runDays];
  const isRace = ctx.mode === "race";

  days.forEach((day, index) => {
    const at = { wn, ymd: day.ymd };
    if (day.weekday !== WEEKDAYS[(WEEKDAYS.indexOf(days[0].weekday) + index) % 7]) c.flag("LAYOUT/structure", at);
    if (index > 0 && diffDays(day.ymd, days[index - 1].ymd) !== 1) c.flag("LAYOUT/structure", at);
    const runs = day.slot !== "REST";
    if (runs && day.slot !== "RACE" && ctx.availableDays.indexOf(day.weekday) < 0) c.flag("I16/unavailable-day", at);
    if (day.slot === "RACE" && (!isRace || day.ymd !== ctx.raceDate)) c.flag("I14/race", at);
    if (isQ(day.slot) && diffDays(ctx.raceDate, day.ymd) < gap) c.flag("I15/q-too-close", at, { actual: diffDays(ctx.raceDate, day.ymd), limit: gap, unit: "count" });
    if (day.slot === "LR" && diffDays(ctx.raceDate, day.ymd) <= noLr) c.flag("I15/long-run-too-close", at);
    if (day.slot === "LR" && day.weekday !== ctx.longRunDay) c.flag("I16/long-run-day", at);
  });

  const races = days.filter((day) => day.slot === "RACE").length;
  if (isRace && (races !== 1 || days[days.length - 1].slot !== "RACE")) c.flag("I14/race", { wn });
  if (!isRace && races !== 0) c.flag("I14/race", { wn });
  if (days.filter((day) => day.slot === "LR").length > 1) c.flag("I10/more-than-one", { wn });
  if (isRace && days.some((day) => day.slot === "LR")) c.flag("I15/long-run-too-close", { wn });

  // Lauftage (I16)
  const runDayCount = days.filter((day) => day.slot !== "REST").length;
  if (runDayCount !== layout.runDayCount) c.flag("LAYOUT/counts", { wn });
  const full = days.length === 7;
  if (isRace) {
    const usable = days.filter((day) => day.slot !== "RACE" && ctx.availableDays.indexOf(day.weekday) >= 0).length;
    const target =
      ctx.runDays <= CONFIG.raceWeek.fullRunDaysUpToRunDays.value ? ctx.runDays : ctx.runDays - CONFIG.taper.minRunDaysBelowRunDays.value;
    const expected = Math.min(target, 1 + usable);
    // Spec I16: mindestens min(Lauftage − 1, verfügbare Tage im Fenster); die Platzierung legt die genaue Zahl fest.
    const specMin = Math.min(ctx.runDays - CONFIG.taper.minRunDaysBelowRunDays.value, 1 + usable);
    if (runDayCount < specMin) c.flag("I16/taper-run-days", { wn }, { actual: runDayCount, limit: specMin, unit: "count" });
    else if (runDayCount !== expected) c.flag("I16/race-week-run-days", { wn }, { actual: runDayCount, limit: expected, unit: "count" });
    raceWeekRankingInto(c, layout, ctx);
  } else if (full) {
    if (runDayCount !== ctx.runDays) c.flag("I16/run-days", { wn }, { actual: runDayCount, limit: ctx.runDays, unit: "count" });
  } else if (runDayCount > ctx.runDays) {
    c.flag("I16/partial-week-run-days", { wn }, { actual: runDayCount, limit: ctx.runDays, unit: "count" });
  }

  // Q-Zahl (I7, I13)
  const qCount = days.filter((day) => isQ(day.slot)).length;
  if (qCount !== layout.qCount) c.flag("LAYOUT/counts", { wn });
  if (qCount > maxQ) c.flag("I7/q-count", { wn }, { actual: qCount, limit: maxQ, unit: "count" });
  if ((ctx.mode === "taper" || isRace) && qCount > CONFIG.taper.qualitySessionsPerWeek.value) c.flag("I13/taper-q", { wn }, { actual: qCount, limit: 1, unit: "count" });

  // I6 in der Woche und über beide Ränder
  const hardAt = (index: number): boolean => isHardSlot(days[index].slot);
  days.forEach((day, index) => {
    if (!hardAt(index)) return;
    if (index > 0 && hardAt(index - 1)) c.flag("I6/hard-adjacent", { wn, ymd: day.ymd });
    if (index === 0 && day.weekday === "Mo" && (ctx.carry.prevHard || ctx.carry.prevMlrAfterHard)) c.flag("I6/hard-after-carry", { wn, ymd: day.ymd });
    if (index === days.length - 1 && day.weekday === "So" && ctx.nextHard) c.flag("I6/hard-before-next-hard", { wn, ymd: day.ymd });
  });
  findHardSpacingViolations(days.map((day) => ({ ymd: day.ymd, hard: isHardSlot(day.slot) }))).forEach(() => c.flag("I6/hard-spacing", { wn }));

  // MLR: Abstand zum LR, Sandwich
  const lrIndexInWeek = WEEKDAYS.indexOf(ctx.longRunDay);
  days.forEach((day, index) => {
    if (day.slot !== "MLR") return;
    if (days.some((d) => d.slot === "LR") && cyc(WEEKDAYS.indexOf(day.weekday), lrIndexInWeek) < CONFIG.library.mlr.minDaysFromLongRun.value) {
      c.flag("LAYOUT/mlr-near-long-run", { wn, ymd: day.ymd });
    }
    const before = index === 0 ? day.weekday === "Mo" && ctx.carry.prevHard : hardAt(index - 1);
    const after = index === days.length - 1 ? day.weekday === "So" && ctx.nextHard : hardAt(index + 1);
    if (before && after) c.flag("I6/mlr-sandwich", { wn, ymd: day.ymd });
  });

  layout.notes.forEach((note) => {
    if (KNOWN_LAYOUT_NOTES.indexOf(note.code) < 0) c.flag("LAYOUT/unknown-note", { wn });
  });
}

/**
 * Rennwoche, Rangfolge (weiche Regeln, soweit `availableDays` und das Q es zulassen): 1) höchstens `maxRest` Ruhetage
 * direkt vor dem Rennen, 2) höchstens `maxInRow` am Stück, 3) verfügbare Tage an Renntag−1/−2 belegen. Geprüft gegen
 * alle Verteilungen mit gleicher Zahl Läufe, bei denen das Q (falls vorhanden) an einem Tag mit Rennabstand liegt.
 */
function raceWeekRankingInto(c: Collector, layout: WeekLayout, ctx: WeekLayoutContext): void {
  const { days, wn } = layout;
  const raceIndex = days.length - 1;
  const lastDays = CONFIG.raceWeek.lastDaysCount.value;
  const maxRest = CONFIG.raceWeek.maxRestDaysBeforeRace.value;
  const maxInRow = CONFIG.raceWeek.maxRestDaysInRow.value;
  const before = days.slice(0, raceIndex);
  const usableIdx: number[] = [];
  before.forEach((day, index) => {
    if (ctx.availableDays.indexOf(day.weekday) >= 0) usableIdx.push(index);
  });
  const restStats = (isRun: boolean[]): { before: number; longest: number } => {
    let tail = 0;
    for (let index = isRun.length - 1; index >= 0 && !isRun[index]; index -= 1) tail += 1;
    let streak = 0;
    let longest = 0;
    isRun.forEach((runs) => {
      streak = runs ? 0 : streak + 1;
      longest = Math.max(longest, streak);
    });
    return { before: tail, longest };
  };
  const unusedLast = (isRun: boolean[]): number => {
    let unused = 0;
    for (let back = 1; back <= lastDays; back += 1) {
      const index = raceIndex - back;
      if (index >= 0 && usableIdx.indexOf(index) >= 0 && !isRun[index]) unused += 1;
    }
    return unused;
  };
  const ownRuns = before.map((day) => day.slot !== "REST");
  const k = ownRuns.filter((runs) => runs).length;
  const needQ = layout.qCount > 0;
  const gapDays = CONFIG.raceWeek.lastQDaysBefore.value[ctx.distance];
  const qAllowed = (index: number): boolean =>
    diffDays(ctx.raceDate, days[index].ymd) >= gapDays && !(index === 0 && days[0].weekday === "Mo" && (ctx.carry.prevHard || ctx.carry.prevMlrAfterHard));
  const distributions: boolean[][] = [];
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === k) {
      if (!needQ || chosen.some(qAllowed)) distributions.push(before.map((_, index) => chosen.indexOf(index) >= 0));
      return;
    }
    for (let at = start; at < usableIdx.length; at += 1) {
      chosen.push(usableIdx[at]);
      pick(at + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);

  const own = restStats(ownRuns);
  if (own.before > maxRest && distributions.some((d) => restStats(d).before <= maxRest)) {
    c.flag("I15/race-week-rest-gap", { wn }, { actual: own.before, limit: maxRest, unit: "count" });
  }
  const compliant = distributions.filter((d) => restStats(d).before <= maxRest && restStats(d).longest <= maxInRow);
  const ownCompliant = own.before <= maxRest && own.longest <= maxInRow;
  if (!ownCompliant && compliant.length > 0) c.flag("I15/race-week-rest-streak", { wn }, { actual: own.longest, limit: maxInRow, unit: "count" });
  if (ownCompliant) {
    const best = compliant.reduce((min, d) => Math.min(min, unusedLast(d)), unusedLast(ownRuns));
    if (best < unusedLast(ownRuns)) c.flag("I15/race-week-filler-too-early", { wn });
  }
}

export type PlanLayoutContext = {
  distance: Distance;
  runDays: RunDays;
  availableDays: Weekday[];
  longRunDay: Weekday;
  raceDate: Ymd;
};

/**
 * Alle Wochenformen eines Plans: jede Woche für sich (Zustand der Vorwoche weitergereicht), dazu über den ganzen Plan
 * lückenlose Tage, I6 und Sandwich über die Wochengrenzen, I10, I13–I16.
 */
export function checkPlanLayouts(layouts: WeekLayout[], ctx: PlanLayoutContext): Violation[] {
  const c = new Collector();
  planLayoutsInto(c, layouts, ctx);
  return c.list;
}

function planLayoutsInto(c: Collector, layouts: WeekLayout[], ctx: PlanLayoutContext): void {
  let carry: LayoutCarry = NO_CARRY;
  layouts.forEach((layout) => {
    const week = new Collector();
    weekLayoutInto(week, layout, { ...ctx, mode: layout.mode, carry, nextHard: false });
    // Übergänge So → Mo prüft die Plan-Ebene über die ganze Tagesliste (I6); „hart nach MLR mit hartem Tag davor“ am
    // Montag ist eine Platzierungsregel, keine Invariante.
    week.list.filter((v) => v.rule !== "hard-after-carry").forEach((v) => c.list.push(v));
    carry = carryOf(layout);
  });

  const gap = CONFIG.raceWeek.lastQDaysBefore.value[ctx.distance];
  const noLr = CONFIG.raceWeek.noLongRunDaysBefore.value;
  const all = layouts.reduce((list, layout) => list.concat(layout.days), [] as WeekLayout["days"]);
  const wnOf = (ymd: Ymd): number | undefined => {
    const found = layouts.filter((layout) => layout.days.some((day) => day.ymd === ymd))[0];
    return found === undefined ? undefined : found.wn;
  };

  all.forEach((day, index) => {
    if (index > 0 && diffDays(day.ymd, all[index - 1].ymd) !== 1) c.flag("LAYOUT/structure", { wn: wnOf(day.ymd), ymd: day.ymd });
  });
  if (all.length === 0 || all[all.length - 1].ymd !== ctx.raceDate) c.flag("I14/plan-end");
  if (all.filter((day) => day.slot === "RACE").length !== 1) c.flag("I14/race");

  findHardSpacingViolations(all.map((day) => ({ ymd: day.ymd, hard: isHardSlot(day.slot) }))).forEach(() => c.flag("I6/hard-spacing"));
  all.forEach((day, index) => {
    if (day.slot !== "MLR") return;
    const before = index > 0 && isHardSlot(all[index - 1].slot);
    const after = index < all.length - 1 && isHardSlot(all[index + 1].slot);
    if (before && after) c.flag("I6/mlr-sandwich", { wn: wnOf(day.ymd), ymd: day.ymd });
  });
  all.forEach((day) => {
    const before = diffDays(ctx.raceDate, day.ymd);
    if (before >= 1 && before <= CONFIG.raceWeek.lastDaysCount.value && isHardSlot(day.slot)) c.flag("I15/hard-before-race", { wn: wnOf(day.ymd), ymd: day.ymd });
  });

  const marathonLike = CONFIG.longRun.requiredEveryWeek.value.indexOf(ctx.distance) >= 0;
  layouts.forEach((layout, index) => {
    const { wn } = layout;
    const weekStart = addDays(layout.days[0].ymd, -WEEKDAYS.indexOf(layout.days[0].weekday));
    const lrYmd = addDays(weekStart, WEEKDAYS.indexOf(ctx.longRunDay));
    const isRace = index === layouts.length - 1;
    const full = layout.days.length === 7;

    if (isRace) {
      // Kein Q im Fenster, wenn es keinen zulässigen Tag gibt (begründet); sonst genau eines (I13).
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
      if (usableQDays.length > 0 && layout.qCount !== 1) c.flag("I13/taper-q", { wn }, { actual: layout.qCount, limit: 1, unit: "count" });
      if (usableQDays.length === 0 && layout.qCount !== 0) c.flag("I13/taper-q", { wn }, { actual: layout.qCount, limit: 0, unit: "count" });
      if (usableQDays.length === 0) c.flag("I13/taper-q-excused", { wn });
      return;
    }

    // I10 (Layout): Long Run in jeder Nicht-Rennwoche, außer Long-Run-Tag vor dem Start oder im Sperrfenster.
    const lrInWindow = layout.days.some((day) => day.ymd === lrYmd);
    const lrAllowed = lrInWindow && diffDays(ctx.raceDate, lrYmd) > noLr;
    if (lrAllowed && !layout.hasLongRun) c.flag("I10/missing-long-run", { wn });
    if (!lrAllowed && layout.hasLongRun) c.flag("I10/long-run-forbidden", { wn });
    const noted = layout.notes.some((note) => note.code === "no-long-run-in-window");
    if (!lrAllowed && !noted) c.flag("I10/missing-note", { wn });
    if (!lrAllowed && noted && marathonLike) c.flag("I10/no-long-run-in-window", { wn });

    if (layout.mode === "taper") {
      const dropped = layout.notes.some((note) => note.code === "q1-dropped" || note.code === "q-dropped-race-gap");
      if (full && layout.qCount !== 1 && !dropped) c.flag("I13/taper-q", { wn }, { actual: layout.qCount, limit: 1, unit: "count" });
      if (full && layout.qCount === 0 && dropped) c.flag("I13/taper-q-excused", { wn });
      const min = ctx.runDays - CONFIG.taper.minRunDaysBelowRunDays.value;
      if (full && layout.runDayCount < min) c.flag("I16/taper-run-days", { wn }, { actual: layout.runDayCount, limit: min, unit: "count" });
    }
  });
}

// ───────────────────────────── Volumen ─────────────────────────────

export type VolumeCheckOptions = {
  /** An `planVolume` übergebene Mindest-Wochen-km (Standard 0). */
  minWeekKm?: number;
  /** Taper-Mittel am Volumenplan prüfen (Standard ja; `checkPlan` prüft es an den gelieferten Wochen). */
  taperMean?: boolean;
};

/**
 * Volumenplan (§5): I3, I4 (inkl. monotonem Verlauf), I5 (inkl. Entlastungsband), Taper, Struktur der Wochenliste.
 * Gilt für `planVolume` mit und ohne Tragfähigkeit.
 */
export function checkVolume(volume: PlanVolume, inputs: Pick<CoreInputs, "distance" | "runDaysPerWeek" | "currentWeeklyKm" | "raceDate">, options: VolumeCheckOptions = {}): Violation[] {
  const c = new Collector();
  volumeInto(c, volume, inputs, options);
  return c.list;
}

function volumeInto(
  c: Collector,
  volume: PlanVolume,
  inputs: Pick<CoreInputs, "distance" | "runDaysPerWeek" | "currentWeeklyKm" | "raceDate">,
  options: VolumeCheckOptions,
): void {
  const v = CONFIG.volume;
  const minWeekKm = Math.ceil((options.minWeekKm ?? 0) - EPS);
  const { weeks, peakWeek } = volume;
  const pre = weeks.filter((w) => w.wn <= peakWeek);
  const table = v.peakKm.value[inputs.distance][inputs.runDaysPerWeek];
  const startKm = Math.min(Math.max(inputs.currentWeeklyKm, v.minStartKm.value[inputs.distance]), v.startKmMax.value);
  const cap = Math.floor(Math.min(table.max, startKm * v.peakStartFactor.value) + EPS);

  // Struktur der Wochenliste
  weeks.forEach((week, i) => {
    if (week.wn !== i + 1) c.flag("VOLUME/structure", { wn: week.wn });
    if (week.targetKm < 0 || week.fullWeekKm < 0) c.flag("VOLUME/structure", { wn: week.wn });
    if (i > 0 && diffDays(week.firstDayYmd, weeks[i - 1].lastDayYmd) !== 1) c.flag("VOLUME/structure", { wn: week.wn });
    if (week.wn < weeks.length && week.days < 7 && week.wn > 1) c.flag("VOLUME/structure", { wn: week.wn });
  });
  if (weeks.length === 0 || weeks[weeks.length - 1].lastDayYmd !== inputs.raceDate) c.flag("I14/plan-end");
  if (weeks.length > CONFIG.planLength.maxWeeks.value[inputs.distance]) c.flag("VOLUME/too-many-weeks");
  if (pre.length === 0) return;

  // Entlastung nur jede n-te Woche, nie in Woche 1, nie in den letzten zwei Wochen vor dem Taper
  pre.forEach((week) => {
    const expected = week.wn > 1 && week.wn % v.recovery.everyNWeeks.value === 0 && week.wn <= peakWeek - 2;
    if (week.isRecoveryWeek !== expected) c.flag("VOLUME/recovery-position", { wn: week.wn });
  });

  // Woche 1 (geplant, vor Tragfähigkeit): min(Ist, Obergrenze), mindestens weekOneMinKm und minWeekKm
  const weekOne = Math.max(v.weekOneMinKm.value, Math.min(Math.round(inputs.currentWeeklyKm), cap), minWeekKm);
  if (pre[0].curveKm !== weekOne) c.flag("VOLUME/week-one", { wn: 1 }, { actual: pre[0].curveKm, limit: weekOne, unit: "km" });

  let level = pre[0].fullWeekKm;
  pre.forEach((w, i) => {
    const km = w.fullWeekKm;
    const where = { wn: w.wn };
    const prev = i === 0 ? km : pre[i - 1].fullWeekKm;
    // Der Verlauf vor Woche 1 zählt als Woche 1 (§5.3), als geplanter Wert (Angabe des Nutzers).
    const prev2 = i < 2 ? pre[0].curveKm : pre[i - 2].fullWeekKm;
    if (km > w.curveKm + EPS) c.flag("VOLUME/above-curve", where, { actual: km, limit: w.curveKm, unit: "km" });
    if (km > cap + EPS && km <= minWeekKm + EPS) c.flag("I5/min-week-km-raised", where);
    else c.over("I5/cap", km, Math.max(cap, minWeekKm), where, "km");
    c.over("I3/two-week", km, v.growth.twoWeekFactor.value * prev2, where, "km");
    if (w.isRecoveryWeek) {
      if (km > prev + EPS) c.flag("I5/recovery-above-previous", where, { actual: km, limit: prev, unit: "km" });
      if (km < (1 - v.recovery.maxReduction.value) * prev - EPS) c.flag("I5/recovery-too-deep", where, { actual: km, limit: (1 - v.recovery.maxReduction.value) * prev, unit: "km" });
      const shallowLimit = (1 - v.recovery.reduction.value) * prev;
      if (km > Math.max(shallowLimit, minWeekKm) + EPS) c.flag("I5/recovery-too-shallow", where, { actual: km, limit: shallowLimit, unit: "km" });
      else if (km > shallowLimit + EPS) c.flag("I5/min-week-km-raised", where);
    } else {
      if (i > 0 && km < level - EPS) c.flag("I4/drop", where, { actual: km, limit: level, unit: "km" });
      if (i > 0 && pre[i - 1].isRecoveryWeek) {
        if (km > level + EPS) c.flag("I4/after-recovery", where, { actual: km, limit: level, unit: "km" });
      } else if (i > 0) {
        const limit = Math.max(prev * (1 + v.growth.weeklyShare.value), prev + v.growth.weeklyKm.value);
        if (km > limit + EPS) c.flag("I4/weekly", where, { actual: km, limit, unit: "km" });
      }
    }
    if (!w.isRecoveryWeek) level = km;
  });
  const full = pre.map((w) => w.fullWeekKm);
  if (Math.abs(volume.peakKm - Math.max.apply(null, full)) > EPS) c.flag("VOLUME/peak-km");
  if (full.some((km) => km > full[full.length - 1] + EPS) || Math.abs(volume.peakKm - full[full.length - 1]) > EPS) c.flag("I4/peak-not-last");

  // Taper und Rennwoche
  const taper = weeks.filter((w) => w.wn > peakWeek);
  const raceWeek = weeks[weeks.length - 1];
  if (taper.length !== volume.taperWeeks) c.flag("VOLUME/taper-structure");
  taper.forEach((week) => {
    if (week.fullWeekKm > volume.peakKm + EPS || week.isRecoveryWeek) c.flag("VOLUME/taper-structure", { wn: week.wn });
  });
  for (let i = 1; i < taper.length; i += 1) {
    if (taper[i].fullWeekKm > taper[i - 1].fullWeekKm + EPS) c.flag("VOLUME/taper-structure", { wn: taper[i].wn });
  }
  const raceKm = CONFIG.scope.raceKm.value[inputs.distance];
  if (raceWeek.raceWeekExtraKm === undefined) c.flag("VOLUME/structure", { wn: raceWeek.wn });
  else c.over("I1/race-week-sum", Math.abs(raceWeek.targetKm - (raceKm + raceWeek.raceWeekExtraKm)), 0.05, { wn: raceWeek.wn }, "km");
  // I13 (Volumen): −41 bis −60 % über die Taper-Phase, bei voller Rennwoche. Toleranz: ganze km im Volumenplan.
  if (options.taperMean !== false && raceWeek.days === 7 && volume.peakKm > 0) {
    const sum = taper.reduce((acc, week) => acc + week.fullWeekKm, 0);
    const reduction = 1 - sum / (taper.length * volume.peakKm);
    const tolerance = Math.max(0.005, 1.5 / volume.peakKm);
    const { min, max } = CONFIG.taper.totalReduction.value;
    if (reduction < min - tolerance || reduction > max + tolerance) c.flag("I13/taper-mean", {}, { actual: reduction, limit: reduction < min ? min : max, unit: "share" });
  }
}

// ───────────────────────────── Einheiten ─────────────────────────────

const QUALITY_KINDS: CoreKind[] = ["T", "I", "R", "M"];

function kmOf(segments: Segment[]): number {
  let sum = 0;
  segments.forEach((s) => {
    if (s.type === "reps") sum += s.reps * s.repKm + s.restKm;
    else if (s.type !== "strides") sum += s.km;
  });
  return r1(sum);
}

function qualityOf(segments: Segment[]): number {
  let sum = 0;
  segments.forEach((s) => {
    if (s.type === "reps") sum += s.reps * s.repKm;
    else if (s.type === "steady") sum += s.km;
  });
  return r1(sum);
}

const workOf = (session: CoreSession): Segment | undefined => session.segments.filter((s) => s.type === "steady" || s.type === "reps")[0];

/** Hinweise, die ein Q zu E + Strides machen, weil Budget oder Platz fehlen (begründete Abweichung). */
const SOFTENED_DEVIATION = ["q-softened-budget", "q-softened-room"];

function sessionsInto(c: Collector, plan: SessionPlan, inputs: CoreInputs): void {
  const { library, longRun, intensity, raceWeek } = CONFIG;
  const { paces, weeks, layouts } = plan;
  const runDays = inputs.runDaysPerWeek;
  const minutesAt = (km: number, secPerKm: number): number => (km * secPerKm) / 60;
  const all = weeks.reduce((list, week) => list.concat(week.sessions), [] as CoreSession[]);
  const raceKm = CONFIG.scope.raceKm.value[inputs.distance];
  const wnOf: Record<string, number> = {};
  weeks.forEach((week) => week.sessions.forEach((s) => (wnOf[s.ymd] = week.wn)));
  const at = (s: CoreSession): Where => ({ wn: wnOf[s.ymd], ymd: s.ymd });

  // I14
  const races = all.filter((s) => s.kind === "RACE");
  if (races.length !== 1 || all.length === 0 || all[all.length - 1].kind !== "RACE" || all[all.length - 1].ymd !== inputs.raceDate) c.flag("I14/race");
  if (races.length === 1) c.over("I14/race-km", Math.abs(races[0].km - raceKm), 0, at(races[0]), "km");

  // I6 an den fertigen Einheiten: hart nur, wo die Platzierung hart angenommen hat; Abstände über den ganzen Plan.
  const hardOf = (s: CoreSession): boolean => {
    const w = workOf(s);
    const mKm = w !== undefined && (s.kind === "M" || s.kind === "LR+M") ? qualityOf([w]) : 0;
    return isHardSession({ kind: s.kind, durationMinutes: minutesAt(s.km, paces.E), kmAtMPaceOrFaster: mKm });
  };
  all.forEach((s) => {
    if (hardOf(s) && !isHardSlot(s.slot)) c.flag("I6/harder-than-layout", at(s));
  });
  findHardSpacingViolations(all.map((s) => ({ ymd: s.ymd, hard: hardOf(s) }))).forEach(() => c.flag("I6/hard-spacing"));

  let lastLr: number | null = null;
  let level: number | null = null;
  let longest = 0;
  let afterRecovery = false;
  const lrDates = all.filter((s) => s.kind === "LR" || s.kind === "LR+M").map((s) => s.ymd);
  const nearLongRun = (ymd: Ymd): boolean => lrDates.some((d) => diffDays(d, ymd) >= 1 && diffDays(d, ymd) <= library.m.nearLongRunDays.value);
  const hardMinKm = Math.ceil(((library.easyHardMinMinutes.value * 60) / paces.E) * 10 - EPS) / 10;
  const longestRecent =
    inputs.longestRecentRunKm !== undefined
      ? inputs.longestRecentRunKm
      : Math.max(CONFIG.inputs.longestRecentRunFallbackMinKm.value, inputs.currentWeeklyKm * CONFIG.inputs.longestRecentRunFallbackShare.value);
  const marathonLike = CONFIG.longRun.requiredEveryWeek.value.indexOf(inputs.distance) >= 0;

  weeks.forEach((week, index) => {
    const wn = week.wn;
    const layout = layouts[index];
    const isRace = week.mode === "race";
    const race = week.sessions.filter((s) => s.kind === "RACE")[0];
    const weekKm = r1(week.totalKm - (race === undefined ? 0 : race.km));

    // Einheiten ↔ Wochenform (I16 für die Einheiten: dieselben Tage und Rollen wie das Layout)
    if (layout === undefined || week.sessions.length !== layout.days.length || week.sessions.some((s, i) => s.ymd !== layout.days[i].ymd || s.slot !== layout.days[i].slot)) {
      c.flag("LAYOUT/structure", { wn });
    }

    // I1
    const sum = r1(week.sessions.reduce((total, s) => total + s.km, 0));
    c.over("I1/week-sum", Math.abs(sum - week.totalKm), 0, { wn }, "km");
    week.sessions.forEach((s) => {
      if (s.kind !== "RACE" && s.kind !== "REST") c.over("I1/segments-sum", Math.abs(kmOf(s.segments) - s.km), 0, at(s), "km");
      if (s.kind !== "REST" && s.kind !== "RACE" && !(s.km > 0)) c.flag("I1/zero-km", at(s));
    });
    const diff = r1(week.totalKm - week.targetKm);
    if (diff < 0) c.flag(week.notes.indexOf("week-km-reduced") >= 0 ? "VOLUME/week-km-reduced" : "VOLUME/off-target", { wn }, { actual: week.totalKm, limit: week.targetKm, unit: "km" });
    if (diff > 0) c.flag(week.notes.indexOf("week-km-raised") >= 0 ? "VOLUME/week-km-raised" : "VOLUME/off-target", { wn }, { actual: week.totalKm, limit: week.targetKm, unit: "km" });

    // Rollen ↔ Arten (I2)
    week.sessions.forEach((s) => {
      const strides = s.segments.some((x) => x.type === "strides");
      const mlrAsE = s.slot === "MLR" && s.kind === "E" && s.notes.indexOf("mlr-as-e") >= 0;
      const qAsE = (s.slot === "Q1" || s.slot === "Q1L" || s.slot === "Q2") && s.kind === "E" && strides;
      const ok =
        (s.slot === "REST" && s.kind === "REST") ||
        (s.slot === "RACE" && s.kind === "RACE") ||
        (s.slot === "LR" && (s.kind === "LR" || s.kind === "LR+M")) ||
        ((s.slot === "E" || s.slot === "REC") && s.kind === s.slot) ||
        (s.slot === "MLR" && s.kind === "MLR") ||
        mlrAsE ||
        ((s.slot === "Q1" || s.slot === "Q1L" || s.slot === "Q2") && QUALITY_KINDS.indexOf(s.kind) >= 0) ||
        qAsE;
      if (!ok) c.flag("I2/slot-kind", at(s));
      if (mlrAsE) c.flag("I2/mlr-as-e", at(s));
      if (qAsE && s.notes.some((n) => SOFTENED_DEVIATION.indexOf(n) >= 0)) c.flag("I2/q-softened", at(s));
      if (s.kind === "MLR" && CONFIG.weekTemplates.mlrDistances.value.indexOf(inputs.distance) < 0) c.flag("I2/mlr-distance", at(s));
      s.segments.forEach((x) => {
        if ((x.type === "warmup" || x.type === "cooldown") && (x.km < library.warmupCooldownKm.value.min - EPS || x.km > library.warmupCooldownKm.value.max + EPS)) {
          c.flag("I2/warmup-cooldown", at(s), { actual: x.km, unit: "km" });
        }
        if (x.type === "strides" && (x.reps < library.strides.reps.value.min || x.reps > library.strides.reps.value.max)) c.flag("I2/strides", at(s), { actual: x.reps, unit: "count" });
      });
    });

    // Long Run (I9, I10)
    const lr = week.sessions.filter((s) => s.kind === "LR" || s.kind === "LR+M")[0];
    if (layout !== undefined && layout.hasLongRun !== (lr !== undefined)) c.flag("I10/layout-mismatch", { wn });
    if (lr !== undefined) {
      const where = at(lr);
      // Anteil am geplanten Verlauf ohne Tragfähigkeit (erster Durchlauf, Vollwochen-Äquivalent; Review-Punkt 29). Einzige
      // Ausnahme (Review-Punkt 34): liegen die Grenzen unter 15 min, ist der Long Run genau 15 min (begründet).
      const shareBase = plan.uncappedVolume.weeks[index].fullWeekKm;
      const raised = lr.notes.indexOf("long-run-raised-to-minimum") >= 0;
      if (raised && Math.abs(lr.km - hardMinKm) > EPS) c.flag("I9/raised-not-to-minimum", where, { actual: lr.km, limit: hardMinKm, unit: "km" });
      if (raised) c.flag("I9/long-run-raised-to-minimum", where);
      c.under("I9/below-15-min", minutesAt(lr.km, paces.E), library.easyHardMinMinutes.value, where, "min");
      if (!raised && shareBase > 0) c.over("I9/share", lr.km / shareBase, longRun.maxShareOfWeek.value[runDays], where, "share");
      c.over("I9/minutes", minutesAt(lr.km, paces.E), longRun.minutesHard.value, where, "min");
      if (raised) {
        // Grenzen nicht nachgerechnet: die Untergrenze gilt nur, wenn der Kern sie braucht (Test in planSessions.test).
      } else if (week.mode === "taper") {
        c.over("I9/taper", lr.km, CONFIG.taper.longRunShareOfPeak.value * longest, where, "km");
      } else if (week.isRecoveryWeek) {
        if (lastLr !== null) c.over("I9/recovery", lr.km, (1 - longRun.recoveryReduction.value.min) * lastLr, where, "km");
      } else if (lastLr === null) {
        c.over("I9/start", lr.km, r1(longestRecent + longRun.startAboveLongestRecentKm.value), where, "km");
      } else if (afterRecovery && level !== null) {
        c.over("I9/after-recovery", lr.km, level, where, "km");
      } else {
        const step = Math.min(longRun.absoluteMaxStepKm.value, Math.max(longRun.maxStepKm.value, longRun.maxStepShare.value * lastLr));
        c.over("I9/step", lr.km, lastLr + step, where, "km");
      }
      if (lr.kind === "LR+M") {
        const block = qualityOf(lr.segments);
        if (block < library.m.minKm.value - EPS) c.flag("QMIN/lrm-block", where, { actual: block, limit: library.m.minKm.value, unit: "km" });
        c.over("I12/lrm-share", block / lr.km, library.longRunPlusM.maxShareOfLongRun.value, where, "share");
        c.over("I12/lrm-km", block, library.longRunPlusM.maxKm.value, where, "km");
        const w = workOf(lr);
        const minutes = w !== undefined && w.type === "steady" && w.minutes !== undefined ? w.minutes : minutesAt(block, paces.M ?? paces.E);
        c.over("I12/lrm-minutes", minutes, library.longRunPlusM.maxMinutes.value, where, "min");
      }
    }

    // I11 und Limits der lockeren Einheiten (I2)
    const refLr = lr !== undefined ? lr.km : lastLr;
    week.sessions.forEach((s) => {
      if (s.kind !== "E" && s.kind !== "REC" && s.kind !== "MLR") return;
      const where = at(s);
      const pace = s.kind === "REC" ? paces.REC : paces.E;
      const minutes = minutesAt(s.km, pace);
      const lim =
        s.kind === "REC"
          ? library.rec.minutes.value
          : s.kind === "MLR"
            ? library.mlr.minutes.value
            : {
                min: library.e.minutes.value.min,
                max:
                  runDays >= 6
                    ? library.e.minutesMaxSixDays.value
                    : runDays <= library.e.minutesMaxFewDays.value.upToRunDays && library.e.minutesMaxFewDays.value.distances.indexOf(inputs.distance) >= 0
                      ? library.e.minutesMaxFewDays.value.minutes
                      : library.e.minutes.value.max,
              };
      c.under("I2/below-15-min", minutes, library.easyHardMinMinutes.value, where, "min");
      // Ausnahme (freigegeben 2026-11-05): E/REC nie länger als der Long Run, auch unter der Mindestdauer: genau auf seine
      // Länge (auf 0,1 km abgerundet), nicht beliebig kurz.
      const shortNote = s.notes.indexOf("e-shortened-to-long-run") >= 0;
      const shortenedToLr = shortNote && refLr !== null && s.km <= refLr + EPS && s.km >= Math.floor(refLr * 10 + EPS) / 10 - EPS;
      if (shortNote && !shortenedToLr) c.flag("I2/shortened-not-to-long-run", where);
      // Ausnahme (freigegeben 2026-11-05): E/REC bis 15 min, statt die Woche anzuheben; nur bis zur Peak-Woche.
      const fitNote = s.notes.indexOf("e-shortened-to-fit-week") >= 0;
      if (fitNote && (week.mode === "taper" || isRace || wn > plan.volume.peakWeek)) c.flag("I2/fit-note-outside-build", where);
      if (fitNote && !(minutes < lim.min + NOISE_MIN)) c.flag("I2/fit-note-without-shortening", where);
      if (minutes < lim.min - NOISE_MIN) {
        if (shortenedToLr) c.flag("I2/e-shortened-to-long-run", where);
        else if (fitNote) c.flag("I2/e-shortened-to-fit-week", where);
        else c.flag("I2/too-short", where, { actual: minutes, limit: lim.min, unit: "min" });
      }
      if (minutes > lim.max + NOISE_MIN) c.flag("I2/too-long", where, { actual: minutes, limit: lim.max, unit: "min" });
      if (refLr !== null) {
        if (s.km > refLr + EPS) c.flag("I11/longer-than-long-run", where, { actual: s.km, limit: refLr, unit: "km" });
        // MLR ≤ 75 % des Long Runs; E ≤ max(75 % des Long Runs, E-Mindestdauer), nie länger als er (freigegeben 2026-11-05).
        const eMin = Math.ceil(((library.e.minutes.value.min * 60) / paces.E) * 10 - EPS) / 10;
        const allowed =
          s.kind === "MLR"
            ? library.mlr.maxShareOfLongRun.value * refLr
            : s.kind === "E"
              ? Math.max(Math.floor(library.e.maxShareOfLongRun.value * refLr * 10 + EPS) / 10, eMin)
              : refLr;
        if (s.km > allowed + EPS) c.flag("I11/above-share", where, { actual: s.km, limit: allowed, unit: "km" });
        const flagged = s.notes.indexOf("e-above-75-percent-long-run") >= 0;
        const above = s.kind === "E" && s.km > library.e.maxShareOfLongRun.value * refLr + EPS;
        if (s.kind === "E" && above !== flagged) c.flag("I11/note-mismatch", where);
        if (above && flagged) c.flag("I11/e-above-75-percent-long-run", where);
      }
      const before = diffDays(inputs.raceDate, s.ymd);
      if (before >= 1 && before <= raceWeek.lastDaysCount.value) c.over("I15/last-days-minutes", minutes, raceWeek.lastDaysMaxMinutes.value, where, "min");
    });

    // I12 und I8
    const quality = week.sessions.reduce((total, s) => total + qualityOf(s.segments), 0);
    if (weekKm > 0) c.over("I8/quality-share", quality / weekKm, intensity.qualityShareHard.value, { wn }, "share");
    week.sessions.forEach((s) => {
      if (QUALITY_KINDS.indexOf(s.kind) < 0) return;
      const where = at(s);
      const q = qualityOf(s.segments);
      const share = weekKm > 0 ? q / weekKm : 0;
      if (s.kind === "T") c.over("I12/t-share", share, library.t.maxShareOfWeek.value, where, "share");
      else if (s.kind === "I") {
        c.over("I12/i-share", share, library.i.maxShareOfWeek.value, where, "share");
        c.over("I12/i-km", q, library.i.maxKm.value, where, "km");
      } else if (s.kind === "R") {
        c.over("I12/r-share", share, library.r.maxShareOfWeek.value, where, "share");
        c.over("I12/r-km", q, library.r.maxKm.value, where, "km");
      } else {
        const w = workOf(s);
        const minutes = w !== undefined && w.type === "steady" && w.minutes !== undefined ? w.minutes : minutesAt(q, paces.M ?? paces.E);
        c.over("I12/m-minutes", minutes, library.m.maxMinutes.value, where, "min");
        c.over("I12/m-km", q, library.m.maxKm.value, where, "km");
        if (nearLongRun(s.ymd)) c.over("I12/m-near-long-run", q, library.m.nearLongRunMaxKm.value, where, "km");
      }
      // Entlastungswoche (Review-Punkt 36): feste km-Grenzen von Q1 mal Faktor der Woche (gelieferte km ÷ Vorwoche).
      if (week.isRecoveryWeek && s.slot !== "Q2" && index > 0) {
        const factor = Math.min(1, plan.volume.weeks[index].fullWeekKm / plan.volume.weeks[index - 1].fullWeekKm);
        let fixed = Infinity;
        if (s.kind === "I") fixed = library.i.maxKm.value;
        if (s.kind === "R") fixed = library.r.maxKm.value;
        if (s.kind === "M") fixed = nearLongRun(s.ymd) ? library.m.nearLongRunMaxKm.value : Math.min(library.m.maxKm.value, (library.m.maxMinutes.value * 60) / (paces.M ?? paces.E));
        if (fixed !== Infinity) c.over("I12/recovery-q1", q, factor * fixed, where, "km");
      }
      // Mindestgrößen (freigegeben 2026-11-05): M ≥ 3 km, T ≥ 10 min, I ≥ 3 Wdh., R ≥ 4 Wdh.
      const w = workOf(s);
      if (s.kind === "M" && q < library.m.minKm.value - EPS) c.flag("QMIN/m", where, { actual: q, limit: library.m.minKm.value, unit: "km" });
      if (s.kind === "T" && w !== undefined) {
        const tMinutes = w.type === "steady" && w.minutes !== undefined ? w.minutes : minutesAt(q, s.racePace ? paces.RACE ?? paces.E : paces.T ?? paces.E);
        if (tMinutes < library.t.minMinutes.value - NOISE_MIN) c.flag("QMIN/t", where, { actual: tMinutes, limit: library.t.minMinutes.value, unit: "min" });
      }
      if (s.kind === "I" && (w === undefined || w.type !== "reps" || w.reps < library.i.minReps.value)) c.flag("QMIN/i", where);
      if (s.kind === "R" && (w === undefined || w.type !== "reps" || w.reps < library.r.minReps.value)) c.flag("QMIN/r", where);
      if (s.kind === "I" && s.racePace && (w === undefined || w.type !== "reps" || w.repKm !== library.racePaceBlocks.reps.value["5k"].repKm)) c.flag("QMIN/race-pace-rep-length", where);
      if (s.kind === "R" && library.r.distances.value.indexOf(inputs.distance) < 0) c.flag("I12/r-distance", where);
      // I15: Abstand der letzten Q-Einheit zum Rennen
      const gap = raceWeek.lastQDaysBefore.value[inputs.distance];
      if (diffDays(inputs.raceDate, s.ymd) < gap) c.flag("I15/q-too-close", where, { actual: diffDays(inputs.raceDate, s.ymd), limit: gap, unit: "count" });
      // Einsteiger: nur T/M nach Minuten, ohne Pace-Ziel
      if (paces.beginner) {
        if (s.kind === "I" || s.kind === "R") c.flag("BEGINNER/i-r", where);
        if (s.paceBand !== null || w === undefined || w.type !== "steady" || w.minutes === undefined) c.flag("BEGINNER/not-by-minutes", where);
      }
    });

    // I13: genau 1 Q in Taper-Wochen; ohne Q nur begründet (Hinweis)
    if (week.mode === "taper" || isRace) {
      const qs = week.sessions.filter((s) => QUALITY_KINDS.indexOf(s.kind) >= 0).length;
      const softened = week.sessions.some((s) => s.notes.some((n) => n === "q-softened-beginner-race-week" || n === "q-softened-budget" || n === "q-softened-room"));
      const noSlot = layout !== undefined && layout.qCount === 0;
      if (qs > 1) c.flag("I13/taper-q", { wn }, { actual: qs, limit: 1, unit: "count" });
      if (qs === 0 && !softened && !noSlot) c.flag("I13/taper-q", { wn }, { actual: 0, limit: 1, unit: "count" });
      if (qs === 0 && softened) c.flag("I13/taper-q-excused", { wn });
      if (isRace && paces.beginner && qs > 0) c.flag("I13/beginner-race-week-q", { wn });
    }

    // I10 (Einheiten): HM/M ohne Long Run in einer Nicht-Rennwoche nur begründet (Sperrfenster, Tag vor dem Start)
    if (marathonLike && !isRace && lr === undefined && layout !== undefined && !layout.notes.some((n) => n.code === "no-long-run-in-window")) {
      c.flag("I10/missing-long-run", { wn });
    }

    // I15: kein Long Run in den 7 Tagen vor dem Rennen
    if (lr !== undefined && diffDays(inputs.raceDate, lr.ymd) <= raceWeek.noLongRunDaysBefore.value) c.flag("I15/long-run-too-close", at(lr));

    if (lr !== undefined) {
      const normal = !week.isRecoveryWeek && week.mode !== "taper";
      lastLr = lr.km;
      if (normal) level = lr.km;
      longest = Math.max(longest, lr.km);
      afterRecovery = week.isRecoveryWeek;
    }
  });
}

/** Sichtbare Wochen (`totalKm`) bis zur Peak-Woche, auch eine angebrochene Woche 1: monoton, ohne Ausnahme (I4). */
function shownVolumeInto(c: Collector, plan: SessionPlan): void {
  const shown = plan.weeks.filter((w) => w.wn <= plan.volume.peakWeek);
  let shownLevel: number | null = null;
  shown.forEach((w) => {
    if (w.isRecoveryWeek) return;
    if (shownLevel !== null && w.totalKm < shownLevel - EPS) c.flag("I4/shown-drop", { wn: w.wn }, { actual: w.totalKm, limit: shownLevel, unit: "km" });
    shownLevel = w.totalKm;
  });
  const peakShown = shown.length > 0 ? shown[shown.length - 1] : undefined;
  if (peakShown !== undefined && peakShown.wn === plan.volume.peakWeek) {
    shown.forEach((w) => {
      if (w.totalKm > peakShown.totalKm + EPS) c.flag("I4/shown-above-peak-week", { wn: w.wn }, { actual: w.totalKm, limit: peakShown.totalKm, unit: "km" });
    });
  }
}

/**
 * Mittel der Taper-Phase (gelieferte km ohne Rennen ÷ Peak), nur bei voller Rennwoche (Rennen am Sonntag) und
 * Standard-Zahl an Taper-Wochen. `inRange`: Reduktion in `taper.totalReduction` (−41 bis −60 %). `excused`: Limits oder
 * Mindestdauern haben eine Taper-Woche gekürzt bzw. angehoben, oder die Tragfähigkeit hat sie schon begrenzt.
 */
export function taperMeanOf(plan: SessionPlan, inputs: Pick<CoreInputs, "distance">): { mean: number; inRange: boolean; excused: boolean } | null {
  const { weeks } = plan;
  const taperWeeks = weeks.filter((w) => w.phase === "taper");
  if (weeks.length === 0 || weeks[weeks.length - 1].sessions.length !== 7 || taperWeeks.length !== CONFIG.phases.taperWeeks.value[inputs.distance]) return null;
  if (!(plan.volume.peakKm > 0)) return null;
  const shares = taperWeeks.map((w: WeekSessions) => {
    const race = w.sessions.filter((s) => s.kind === "RACE")[0];
    return (w.totalKm - (race === undefined ? 0 : race.km)) / plan.volume.peakKm;
  });
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const { min, max } = CONFIG.taper.totalReduction.value;
  return {
    mean,
    inRange: mean >= 1 - max - 0.005 && mean <= 1 - min + 0.005,
    excused: taperWeeks.some((w) => {
      const volumeWeek = plan.volume.weeks[w.wn - 1];
      return w.notes.indexOf("week-km-reduced") >= 0 || w.notes.indexOf("week-km-raised") >= 0 || volumeWeek.curveKm > volumeWeek.fullWeekKm;
    }),
  };
}

// ───────────────────────────── Paces ─────────────────────────────

function pacesInto(c: Collector, plan: SessionPlan): void {
  const { pace, paces } = plan;
  // I17: Reihenfolge REC > E > M > T > I > R (Sekunden je km, langsam → schnell), an den Paces und an den Bandmitten.
  if (pace.mode === "vdot") {
    const order = ["REC", "E", "M", "T", "I", "R"] as const;
    for (let i = 1; i < order.length; i += 1) {
      if (!(pace.paces[order[i - 1]] > pace.paces[order[i]])) c.flag("I17/pace-order", {}, { actual: pace.paces[order[i]], limit: pace.paces[order[i - 1]], unit: "count" });
      const band = (code: (typeof order)[number]) => paces.bands[code];
      const a = band(order[i - 1]);
      const b = band(order[i]);
      if (a === undefined || b === undefined || !((a.fast + a.slow) / 2 > (b.fast + b.slow) / 2)) c.flag("I17/pace-order");
    }
    // I18: Zielpace nur, wenn die VDOT-Lücke höchstens `goalVdotGapMax` ist.
    const goal = pace.goal;
    if (goal !== null) {
      const allowed = goal.gapVdot <= CONFIG.form.goalVdotGapMax.value + EPS;
      if (goal.used !== allowed) c.flag("I18/goal-pace", {}, { actual: goal.gapVdot, limit: CONFIG.form.goalVdotGapMax.value, unit: "count" });
      if (goal.used !== (pace.racePace.source === "goal")) c.flag("I18/goal-pace");
    } else if (pace.racePace.source === "goal") {
      c.flag("I18/goal-pace");
    }
  } else if (!(pace.paces.REC > pace.paces.E)) {
    c.flag("I17/pace-order");
  }
}

// ───────────────────────────── Plan ─────────────────────────────

/**
 * Prüft einen fertigen `SessionPlan` gegen §12 (I1–I18 ohne I19/I20) und die Schritt-6-Regeln. Wirft nicht: ein
 * ungültiger Long-Run-Tag in den Eingaben ist selbst ein Verstoß (I16).
 */
export function checkPlan(plan: SessionPlan, inputs: CoreInputs): CheckResult {
  const c = new Collector();
  let longRunDay: Weekday | null = null;
  try {
    longRunDay = resolveLongRunDay(inputs);
  } catch (error) {
    c.flag("I16/long-run-day");
  }
  if (longRunDay !== null) {
    planLayoutsInto(c, plan.layouts, {
      distance: inputs.distance,
      runDays: inputs.runDaysPerWeek,
      availableDays: inputs.availableDays,
      longRunDay,
      raceDate: inputs.raceDate,
    });
  }
  volumeInto(c, plan.volume, inputs, { minWeekKm: plan.minWeekKm, taperMean: false });
  shownVolumeInto(c, plan);
  sessionsInto(c, plan, inputs);
  pacesInto(c, plan);
  const taper = taperMeanOf(plan, inputs);
  if (taper !== null && !taper.inRange) {
    const { min, max } = CONFIG.taper.totalReduction.value;
    c.flag(taper.excused ? "I13/taper-mean-excused" : "I13/taper-mean", {}, { actual: 1 - taper.mean, limit: 1 - taper.mean < min ? min : max, unit: "share" });
  }
  return resultOf(c.list);
}
