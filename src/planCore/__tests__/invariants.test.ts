import { addDays, mondayOf, WEEKDAYS } from "../dates";
import { PROFILES } from "../__fixtures__/profiles";
import type { ProfileName } from "../__fixtures__/profiles";
import { randomInputs } from "../__fixtures__/randomInputs";
import { checkPlan, checkVolume, checkWeekLayout, INVARIANT_RULES, INVARIANT_TOLERANCE, toLogEntries } from "../invariants";
import type { RuleKey, Severity, Violation } from "../invariants";
import { carryOf } from "../placement";
import type { WeekLayout } from "../placement";
import { planSessions } from "../planSessions";
import type { SessionPlan } from "../planSessions";
import type { CoreSession, Segment } from "../sessions";
import type { CoreInputs, Weekday } from "../types";

type Fixture = { plan: SessionPlan; inputs: CoreInputs };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const BASE: Record<string, Fixture> = {};
function base(name: ProfileName): Fixture {
  if (BASE[name] === undefined) {
    const profile = PROFILES.filter((p) => p.name === name)[0];
    BASE[name] = { plan: planSessions(profile.inputs, profile.todayYmd), inputs: profile.inputs };
  }
  return clone(BASE[name]);
}

/** Plan aus geänderten Eingaben eines Profils. */
function custom(name: ProfileName, change: (inputs: CoreInputs) => CoreInputs): Fixture {
  const profile = PROFILES.filter((p) => p.name === name)[0];
  const inputs = change(clone(profile.inputs));
  return { plan: planSessions(inputs, profile.todayYmd), inputs };
}

const keyOf = (v: Violation): string => `${v.code}/${v.rule}`;

const day = (plan: SessionPlan, wn: number, weekday: Weekday): CoreSession => plan.weeks[wn - 1].sessions.filter((_, i) => plan.weeks[wn - 1].sessions.length === 7 && WEEKDAYS[i] === weekday)[0];
const work = (s: CoreSession): Segment => s.segments.filter((x) => x.type === "steady" || x.type === "reps")[0];
const setEasyKm = (s: CoreSession, km: number): void => {
  s.km = km;
  s.segments = s.segments.map((x) => (x.type === "easy" ? { ...x, km } : x));
};
const kmForMinutes = (minutes: number, secPerKm: number): number => Math.round(((minutes * 60) / secPerKm) * 10) / 10;
const layoutDay = (plan: SessionPlan, wn: number, weekday: Weekday) => plan.layouts[wn - 1].days.filter((d) => d.weekday === weekday)[0];

type Case = { key: RuleKey; fixture: () => Fixture; mutate?: (f: Fixture) => void; check?: (f: Fixture) => Violation[]; severity?: Severity };

/** Je Regel eine Verfälschung, die genau diese Regel auslösen muss. Begründete Regeln: echte Fälle (Hinweis gesetzt). */
const CASES: Case[] = [
  // I1
  { key: "I1/week-sum", fixture: () => base("P3"), mutate: ({ plan }) => (plan.weeks[4].totalKm += 1) },
  { key: "I1/segments-sum", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "Mo").km += 1) },
  { key: "I1/zero-km", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "Mo"), 0) },
  { key: "I1/race-week-sum", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[11].targetKm += 1) },
  // I2
  { key: "I2/slot-kind", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "Mo").kind = "REC") },
  {
    key: "I2/mlr-distance",
    fixture: () => base("P2"),
    mutate: ({ plan }) => {
      day(plan, 5, "Fr").kind = "MLR";
      day(plan, 5, "Fr").slot = "MLR";
    },
  },
  { key: "I2/below-15-min", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "Mo"), 1) },
  { key: "I2/shortened-not-to-long-run", fixture: () => base("P3"), mutate: ({ plan }) => day(plan, 5, "Mo").notes.push("e-shortened-to-long-run") },
  { key: "I2/fit-note-outside-build", fixture: () => base("P3"), mutate: ({ plan }) => day(plan, 11, "Mo").notes.push("e-shortened-to-fit-week") },
  { key: "I2/fit-note-without-shortening", fixture: () => base("P3"), mutate: ({ plan }) => day(plan, 5, "Mo").notes.push("e-shortened-to-fit-week") },
  { key: "I2/too-short", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "Mo"), kmForMinutes(20, plan.paces.E)) },
  { key: "I2/too-long", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "Mo"), kmForMinutes(100, plan.paces.E)) },
  {
    key: "I2/warmup-cooldown",
    fixture: () => base("P3"),
    mutate: ({ plan }) => (day(plan, 5, "Di").segments = day(plan, 5, "Di").segments.map((x) => (x.type === "warmup" ? { ...x, km: 5 } : x))),
  },
  {
    key: "I2/strides",
    fixture: () => base("P3"),
    mutate: ({ plan }) => (day(plan, 1, "Do").segments = day(plan, 1, "Do").segments.map((x) => (x.type === "strides" ? { ...x, reps: 20 } : x))),
  },
  // I3–I5 (Volumenplan)
  { key: "I3/two-week", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[2].fullWeekKm = 70) },
  { key: "I4/weekly", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[5].fullWeekKm = 60) },
  { key: "I4/after-recovery", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[4].fullWeekKm = 55) },
  { key: "I4/drop", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[5].fullWeekKm = 50) },
  { key: "I4/peak-not-last", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[9].fullWeekKm = 58) },
  { key: "I4/shown-drop", fixture: () => base("P3"), mutate: ({ plan }) => (plan.weeks[5].totalKm = 50) },
  { key: "I4/shown-above-peak-week", fixture: () => base("P3"), mutate: ({ plan }) => (plan.weeks[1].totalKm = 70) },
  { key: "I5/cap", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[9].fullWeekKm = 90) },
  { key: "I5/recovery-above-previous", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[3].fullWeekKm = 54) },
  { key: "I5/recovery-too-deep", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[3].fullWeekKm = 30) },
  { key: "I5/recovery-too-shallow", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[3].fullWeekKm = 50) },
  // I6
  { key: "I6/hard-spacing", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "Mo").kind = "T") },
  { key: "I6/harder-than-layout", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "Fr").kind = "I") },
  { key: "I6/hard-adjacent", fixture: () => base("P3"), mutate: ({ plan }) => (layoutDay(plan, 5, "Mi").slot = "Q2") },
  {
    key: "I6/hard-after-carry",
    fixture: () => base("P3"),
    check: ({ plan, inputs }) => {
      const layout = clone(plan.layouts[4]);
      layout.days[0].slot = "Q2";
      return checkWeekLayout(layout, { ...layoutCtx(inputs, layout), carry: { prevHard: true, prevMlrAfterHard: false } });
    },
  },
  {
    key: "I6/hard-before-next-hard",
    fixture: () => base("P3"),
    check: ({ plan, inputs }) => checkWeekLayout(plan.layouts[4], { ...layoutCtx(inputs, plan.layouts[4]), carry: carryOf(plan.layouts[3]), nextHard: true }),
  },
  {
    key: "I6/mlr-sandwich",
    fixture: () => base("P5"),
    mutate: ({ plan }) => {
      layoutDay(plan, 9, "Di").slot = "Q2";
      layoutDay(plan, 9, "Do").slot = "Q1";
    },
  },
  // I7, I8
  {
    key: "I7/q-count",
    fixture: () => base("P3"),
    mutate: ({ plan }) => {
      layoutDay(plan, 5, "Mo").slot = "Q2";
      layoutDay(plan, 5, "Fr").slot = "Q2";
      plan.layouts[4].qCount = 4;
    },
  },
  { key: "I8/quality-share", fixture: () => base("P3"), mutate: ({ plan }) => ((work(day(plan, 4, "Do")) as { km: number }).km = 20) },
  // I9
  { key: "I9/share", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 10, "So"), 25) },
  { key: "I9/minutes", fixture: () => base("P5"), mutate: ({ plan }) => setEasyKm(day(plan, 15, "So"), kmForMinutes(200, plan.paces.E)) },
  { key: "I9/below-15-min", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 2, "So"), 1) },
  { key: "I9/start", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 1, "So"), 19) },
  { key: "I9/step", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 2, "So"), 20) },
  { key: "I9/after-recovery", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "So"), 19) },
  { key: "I9/recovery", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 4, "So"), 17.4) },
  { key: "I9/taper", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 11, "So"), 20) },
  { key: "I9/raised-not-to-minimum", fixture: () => base("P3"), mutate: ({ plan }) => day(plan, 5, "So").notes.push("long-run-raised-to-minimum") },
  // I10
  { key: "I10/missing-long-run", fixture: () => base("P3"), mutate: ({ plan }) => (plan.layouts[4].hasLongRun = false) },
  { key: "I10/long-run-forbidden", fixture: () => mondayLongRunFromTuesday(), mutate: ({ plan }) => (plan.layouts[0].hasLongRun = true) },
  { key: "I10/missing-note", fixture: () => mondayLongRunFromTuesday(), mutate: ({ plan }) => (plan.layouts[0].notes = []) },
  { key: "I10/more-than-one", fixture: () => base("P3"), mutate: ({ plan }) => (layoutDay(plan, 5, "Mi").slot = "LR") },
  { key: "I10/layout-mismatch", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "So").kind = "E") },
  // I11
  { key: "I11/longer-than-long-run", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "Mo"), 18) },
  { key: "I11/above-share", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 5, "Mo"), 15) },
  { key: "I11/note-mismatch", fixture: () => base("P3"), mutate: ({ plan }) => day(plan, 5, "Mo").notes.push("e-above-75-percent-long-run") },
  // I12
  { key: "I12/t-share", fixture: () => base("P3"), mutate: ({ plan }) => ((work(day(plan, 4, "Do")) as { km: number }).km = 6.5) },
  { key: "I12/i-share", fixture: () => base("P3"), mutate: ({ plan }) => ((work(day(plan, 5, "Di")) as { reps: number }).reps = 5) },
  { key: "I12/i-km", fixture: () => base("P3"), mutate: ({ plan }) => ((work(day(plan, 5, "Di")) as { reps: number }).reps = 11) },
  {
    key: "I12/r-share",
    fixture: () => base("P2"),
    mutate: ({ plan }) => {
      day(plan, 8, "Do").kind = "R";
      (work(day(plan, 8, "Do")) as { reps: number }).reps = 5;
    },
  },
  {
    key: "I12/r-km",
    fixture: () => base("P2"),
    mutate: ({ plan }) => {
      day(plan, 8, "Do").kind = "R";
      Object.assign(work(day(plan, 8, "Do")), { reps: 9, repKm: 1 });
    },
  },
  { key: "I12/m-km", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 9, "Di")), { km: 30 }) },
  { key: "I12/m-minutes", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 9, "Di")), { km: 28.5 }) },
  { key: "I12/m-near-long-run", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 12, "Fr")), { km: 11 }) },
  { key: "I12/recovery-q1", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 12, "Fr")), { km: 9.5 }) },
  { key: "I12/lrm-share", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 16, "So")), { km: 20 }) },
  { key: "I12/lrm-km", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 16, "So")), { km: 30 }) },
  { key: "I12/lrm-minutes", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 16, "So")), { km: 15, minutes: 120 }) },
  { key: "I12/r-distance", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "Di").kind = "R") },
  // I13
  { key: "I13/taper-q", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 11, "Di").kind = "T") },
  { key: "I13/beginner-race-week-q", fixture: () => base("P1"), mutate: ({ plan }) => (day(plan, 8, "Mi").kind = "T") },
  {
    key: "I13/taper-mean",
    fixture: () => base("P3"),
    mutate: ({ plan }) => {
      plan.weeks[10].totalKm = 20;
    },
  },
  // I14
  { key: "I14/race", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 12, "So").kind = "E") },
  { key: "I14/race-km", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 12, "So").km = 20) },
  { key: "I14/plan-end", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[11].lastDayYmd = addDays(plan.volume.weeks[11].lastDayYmd, -1)) },
  // I15
  { key: "I15/q-too-close", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 12, "Fr").kind = "T") },
  { key: "I15/long-run-too-close", fixture: () => base("P3"), mutate: ({ plan }) => (layoutDay(plan, 12, "Fr").slot = "LR") },
  { key: "I15/hard-before-race", fixture: () => base("P3"), mutate: ({ plan }) => (layoutDay(plan, 12, "Sa").slot = "Q1") },
  { key: "I15/last-days-minutes", fixture: () => base("P3"), mutate: ({ plan }) => setEasyKm(day(plan, 12, "Sa"), kmForMinutes(45, plan.paces.E)) },
  { key: "I15/race-week-rest-gap", fixture: () => base("P5"), check: (f) => raceWeekWith(f, ["E", "E", "Q1", "REST", "REST", "REST", "RACE"]) },
  { key: "I15/race-week-rest-streak", fixture: () => base("P5"), check: (f) => raceWeekWith(f, ["E", "REST", "REST", "REST", "Q1", "E", "RACE"]) },
  { key: "I15/race-week-filler-too-early", fixture: () => base("P5"), check: (f) => raceWeekWith(f, ["E", "E", "Q1", "REST", "E", "REST", "RACE"]) },
  // I16
  { key: "I16/unavailable-day", fixture: () => base("P3"), mutate: ({ inputs }) => (inputs.availableDays = inputs.availableDays.filter((d) => d !== "Mo")) },
  { key: "I16/long-run-day", fixture: () => base("P3"), mutate: ({ inputs }) => (inputs.longRunDay = "Sa") },
  {
    key: "I16/run-days",
    fixture: () => base("P3"),
    mutate: ({ plan }) => {
      layoutDay(plan, 5, "Mo").slot = "REST";
      plan.layouts[4].runDayCount -= 1;
    },
  },
  {
    key: "I16/partial-week-run-days",
    fixture: () => mondayLongRunFromTuesday(),
    mutate: ({ plan }) => {
      plan.layouts[0].days.forEach((d) => (d.slot = d.slot === "REST" ? "E" : d.slot));
      plan.layouts[0].runDayCount = plan.layouts[0].days.length;
    },
  },
  { key: "I16/taper-run-days", fixture: () => base("P5"), mutate: ({ plan }) => (plan.layouts[16].runDayCount = 2) },
  {
    key: "I16/race-week-run-days",
    fixture: () => base("P5"),
    mutate: ({ plan }) => {
      layoutDay(plan, 18, "Di").slot = "E";
      plan.layouts[17].runDayCount += 1;
    },
  },
  // I17, I18
  { key: "I17/pace-order", fixture: () => base("P3"), mutate: ({ plan }) => plan.pace.mode === "vdot" && ((plan.pace.paces as { T: number }).T = plan.pace.paces.E + 10) },
  {
    key: "I18/goal-pace",
    fixture: () => base("P3"),
    mutate: ({ plan }) => {
      if (plan.pace.mode === "vdot") plan.pace.goal = { vdot: plan.pace.vdot + 5, gapVdot: 5, gapSeconds: 300, used: true };
    },
  },
  // Mindestgrößen, Einsteiger
  { key: "QMIN/m", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 9, "Di")), { km: 2 }) },
  { key: "QMIN/t", fixture: () => base("P3"), mutate: ({ plan }) => Object.assign(work(day(plan, 4, "Do")), { km: 1 }) },
  { key: "QMIN/i", fixture: () => base("P3"), mutate: ({ plan }) => Object.assign(work(day(plan, 5, "Di")), { reps: 2 }) },
  {
    key: "QMIN/r",
    fixture: () => base("P2"),
    mutate: ({ plan }) => {
      day(plan, 8, "Do").kind = "R";
      Object.assign(work(day(plan, 8, "Do")), { reps: 3, repKm: 0.2 });
    },
  },
  { key: "QMIN/race-pace-rep-length", fixture: () => base("P3"), mutate: ({ plan }) => (day(plan, 5, "Di").racePace = true) },
  { key: "QMIN/lrm-block", fixture: () => base("P5"), mutate: ({ plan }) => Object.assign(work(day(plan, 16, "So")), { km: 2 }) },
  { key: "BEGINNER/i-r", fixture: () => base("P1"), mutate: ({ plan }) => (day(plan, 4, "Do").kind = "I") },
  {
    key: "BEGINNER/not-by-minutes",
    fixture: () => base("P1"),
    // Q-Slot mit T, aber ohne Minuten (Pace-Ziel statt Gefühl)
    mutate: ({ plan }) => {
      const s = day(plan, 5, "Do");
      s.kind = "T";
      s.segments = [{ type: "steady", km: s.km, pace: "T" }];
    },
  },
  // Volumen, Wochenformen
  { key: "VOLUME/structure", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[3].wn = 99) },
  {
    key: "VOLUME/too-many-weeks",
    fixture: () => base("P1"),
    check: ({ plan, inputs }) => {
      const volume = clone(plan.volume);
      volume.weeks = volume.weeks.concat(volume.weeks).concat(volume.weeks);
      return checkVolume(volume, inputs, { minWeekKm: plan.minWeekKm });
    },
  },
  { key: "VOLUME/above-curve", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[1].fullWeekKm = plan.volume.weeks[1].curveKm + 1) },
  { key: "VOLUME/peak-km", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.peakKm += 5) },
  { key: "VOLUME/week-one", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[0].curveKm += 3) },
  { key: "VOLUME/recovery-position", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[4].isRecoveryWeek = true) },
  { key: "VOLUME/taper-structure", fixture: () => base("P3"), mutate: ({ plan }) => (plan.volume.weeks[10].isRecoveryWeek = true) },
  { key: "VOLUME/off-target", fixture: () => base("P3"), mutate: ({ plan }) => (plan.weeks[4].targetKm += 2) },
  { key: "LAYOUT/structure", fixture: () => base("P3"), mutate: ({ plan }) => (plan.layouts[4].days[1].weekday = "Sa") },
  { key: "LAYOUT/counts", fixture: () => base("P3"), mutate: ({ plan }) => (plan.layouts[4].runDayCount += 1) },
  { key: "LAYOUT/mlr-near-long-run", fixture: () => base("P5"), mutate: ({ plan }) => (layoutDay(plan, 9, "Sa").slot = "MLR") },
  { key: "LAYOUT/unknown-note", fixture: () => base("P3"), mutate: ({ plan }) => plan.layouts[4].notes.push({ code: "bogus" as never }) },
];

/** Begründete Regeln: der Hinweis des Kerns erklärt die Abweichung; ohne ihn meldet der Prüfer die unbegründete Regel. */
const REASONED: Array<{ key: RuleKey; note: string; without: RuleKey[]; scope: "session" | "week" | "layout" | "min-week" | "taper-mean" }> = [
  { key: "I2/e-shortened-to-long-run", note: "e-shortened-to-long-run", without: ["I2/too-short"], scope: "session" },
  { key: "I2/e-shortened-to-fit-week", note: "e-shortened-to-fit-week", without: ["I2/too-short"], scope: "session" },
  { key: "I2/mlr-as-e", note: "mlr-as-e", without: ["I2/slot-kind"], scope: "session" },
  { key: "I11/e-above-75-percent-long-run", note: "e-above-75-percent-long-run", without: ["I11/note-mismatch"], scope: "session" },
  {
    key: "I9/long-run-raised-to-minimum",
    note: "long-run-raised-to-minimum",
    without: ["I9/start", "I9/step", "I9/taper", "I9/share", "I9/recovery", "I9/after-recovery"],
    scope: "session",
  },
  { key: "I13/taper-q-excused", note: "q-softened-budget", without: ["I13/taper-q"], scope: "session" },
  // Q als E + Strides ist auch ohne Hinweis eine zulässige Rolle; ohne Hinweis fehlt nur die Meldung.
  { key: "I2/q-softened", note: "q-softened-budget", without: [], scope: "session" },
  { key: "VOLUME/week-km-raised", note: "week-km-raised", without: ["VOLUME/off-target"], scope: "week" },
  { key: "VOLUME/week-km-reduced", note: "week-km-reduced", without: ["VOLUME/off-target"], scope: "week" },
  { key: "I10/no-long-run-in-window", note: "no-long-run-in-window", without: ["I10/missing-note"], scope: "layout" },
  { key: "I13/taper-mean-excused", note: "", without: ["I13/taper-mean"], scope: "taper-mean" },
  { key: "I5/min-week-km-raised", note: "", without: ["I5/cap", "I5/recovery-too-shallow"], scope: "min-week" },
];

/** Regeln, die erst am fertigen `CorePlan` geprüft werden (Schritt 7b, buildPlan.test). */
const ASSEMBLED: RuleKey[] = ["I1/workouts-weeks", "I21/week-meta", "I22/recovery-focus", "PLAN/duplicate-id"];

function layoutCtx(inputs: CoreInputs, layout: WeekLayout) {
  return {
    mode: layout.mode,
    distance: inputs.distance,
    runDays: inputs.runDaysPerWeek,
    availableDays: inputs.availableDays,
    longRunDay: inputs.longRunDay ?? ("So" as Weekday),
    raceDate: inputs.raceDate,
    carry: { prevHard: false, prevMlrAfterHard: false },
    nextHard: false,
  };
}

function raceWeekWith({ plan, inputs }: Fixture, slots: string[]): Violation[] {
  const layout = clone(plan.layouts[plan.layouts.length - 1]);
  layout.days.forEach((d, i) => (d.slot = slots[i] as never));
  layout.runDayCount = slots.filter((s) => s !== "REST").length;
  layout.qCount = slots.filter((s) => s === "Q1").length;
  return checkWeekLayout(layout, { ...layoutCtx(inputs, layout), carry: carryOf(plan.layouts[plan.layouts.length - 2]) });
}

/** P3 mit Long-Run-Tag Montag und Start am Dienstag: Woche 1 ist angebrochen und hat keinen Long Run (Hinweis). */
function mondayLongRunFromTuesday(): Fixture {
  return custom("P3", (inputs) => ({ ...inputs, longRunDay: "Mo", startYmd: addDays(mondayOf(inputs.startYmd), 1) }));
}

describe("Invarianten-Prüfer (Schritt 7a)", () => {
  it("P1–P6: 0 errors, 0 warnings außer begründeten Abweichungen; die begründeten sind festgeschrieben", () => {
    const out: Record<string, string[]> = {};
    PROFILES.forEach((profile) => {
      const result = checkPlan(base(profile.name).plan, profile.inputs);
      expect([profile.name, result.violations.filter((v) => !v.reasoned)]).toEqual([profile.name, []]);
      expect(result.errors).toBe(0);
      out[profile.name] = result.violations.map((v) => `${keyOf(v)} W${v.wn}`);
    });
    expect(out).toMatchSnapshot();
  });

  describe("Mutation je Regel", () => {
    it.each(CASES.map((c) => [c.key, c] as [string, Case]))("%s", (_key, c) => {
      const fixture = c.fixture();
      expect(checkPlan(fixture.plan, fixture.inputs).violations.filter((v) => keyOf(v) === c.key)).toEqual([]);
      let found: Violation[];
      if (c.check !== undefined) found = c.check(fixture);
      else {
        c.mutate!(fixture);
        found = checkPlan(fixture.plan, fixture.inputs).violations;
      }
      const hit = found.filter((v) => keyOf(v) === c.key);
      expect([c.key, hit.length > 0]).toEqual([c.key, true]);
      expect([c.key, hit[0].severity]).toEqual([c.key, c.severity ?? INVARIANT_RULES[c.key].severity]);
    });

    it.each(REASONED.map((r) => [r.key, r] as [string, (typeof REASONED)[number]]))("begründet: %s kommt in echten Plänen vor, ohne Hinweis die unbegründete Regel", (_key, r) => {
      let found = 0;
      for (let index = 0; index < 2000; index += 1) {
        const { inputs, todayYmd } = randomInputs(20261107 + index);
        const plan = planSessions(inputs, todayYmd);
        const hit = checkPlan(plan, inputs).violations.filter((v) => keyOf(v) === r.key)[0];
        if (hit === undefined) continue;
        found += 1;
        expect(hit).toMatchObject({ severity: "warning", reasoned: true });
        // Hinweis entfernen bzw. die begründende Bedingung aufheben
        const broken = clone(plan);
        const wn = hit.wn!;
        if (r.scope === "min-week") broken.minWeekKm = 0;
        else if (r.scope === "taper-mean") {
          broken.weeks.forEach((w) => (w.notes = []));
          broken.volume.weeks.forEach((w) => (w.curveKm = w.fullWeekKm));
        } else if (r.scope === "week") broken.weeks[wn - 1].notes = [];
        else if (r.scope === "layout") broken.layouts[wn - 1].notes = broken.layouts[wn - 1].notes.filter((n) => n.code !== r.note);
        else broken.weeks[wn - 1].sessions.forEach((s) => (s.notes = s.notes.filter((n) => n !== r.note && !(r.note === "q-softened-budget" && n === "q-softened-room"))));
        const after = checkPlan(broken, inputs).violations;
        expect(after.filter((v) => keyOf(v) === r.key && v.wn === wn)).toEqual([]);
        if (r.without.length === 0 || after.some((v) => !v.reasoned && r.without.indexOf(keyOf(v) as RuleKey) >= 0)) return;
      }
      throw new Error(`${r.key}: ${found} Fälle, keiner wird ohne Hinweis zu ${r.without.join("/")}`);
    });

    it("jede Regel hat einen Mutationstest, einen echten begründeten Fall oder wird am fertigen Plan geprüft (7b)", () => {
      const covered = CASES.map((c) => c.key as string)
        .concat(REASONED.map((r) => r.key))
        .concat(ASSEMBLED);
      expect(Object.keys(INVARIANT_RULES).filter((key) => covered.indexOf(key) < 0)).toEqual([]);
    });
  });

  describe("Toleranz der error-Grenzen (0,1 km / 0,5 Prozentpunkte / 1 min)", () => {
    const severityAt = (mutate: (f: Fixture) => void, key: RuleKey, wn: number): Severity | null => {
      const f = base(key === "I9/minutes" ? "P5" : "P3");
      mutate(f);
      const hit = checkPlan(f.plan, f.inputs).violations.filter((v) => keyOf(v) === key && v.wn === wn)[0];
      return hit === undefined ? null : hit.severity;
    };

    it("km: Long-Run-Steigerung 0,1 über der Grenze = warning, 0,2 darüber = error (P3 W2, Grenze 15,5 + 15 % = 17,8)", () => {
      expect(INVARIANT_TOLERANCE.km).toBe(0.1);
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 2, "So"), 17.8), "I9/step", 2)).toBeNull();
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 2, "So"), 17.9), "I9/step", 2)).toBe("warning");
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 2, "So"), 18), "I9/step", 2)).toBe("error");
    });

    it("Anteil: Long Run 38,4 % der Woche = warning, 39,0 % = error (P3 W10, Grenze 38 %, Bezug 61 km)", () => {
      expect(INVARIANT_TOLERANCE.share).toBe(0.005);
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 10, "So"), 23.1), "I9/share", 10)).toBeNull();
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 10, "So"), 23.4), "I9/share", 10)).toBe("warning");
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 10, "So"), 23.8), "I9/share", 10)).toBe("error");
    });

    it("Minuten: Long Run 180,5 min = warning, 182 min = error (P5 W15)", () => {
      expect(INVARIANT_TOLERANCE.min).toBe(1);
      const kmAt = (minutes: number): number => Math.floor(((minutes * 60) / base("P5").plan.paces.E) * 10) / 10;
      const minutesOf = (km: number): number => (km * base("P5").plan.paces.E) / 60;
      const warnKm = [kmAt(181), kmAt(181) - 0.1].filter((km) => minutesOf(km) > 180.05 && minutesOf(km) <= 181)[0];
      const errorKm = kmAt(183);
      expect(warnKm).toBeDefined();
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 15, "So"), warnKm), "I9/minutes", 15)).toBe("warning");
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 15, "So"), errorKm), "I9/minutes", 15)).toBe("error");
    });

    it("Untergrenze: Long Run 14,5 min = warning, 13 min = error", () => {
      const pace = base("P3").plan.paces.E;
      const at = (minutes: number): number => Math.round(((minutes * 60) / pace) * 10) / 10;
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 2, "So"), at(14.5)), "I9/below-15-min", 2)).toBe("warning");
      expect(severityAt(({ plan }) => setEasyKm(day(plan, 2, "So"), at(13)), "I9/below-15-min", 2)).toBe("error");
    });

    it("jede error-Regel auf Zahlen hat eine Toleranz; ohne Toleranz nur Struktur, Ja/Nein und ganze Zahlen (Tage, Anzahl)", () => {
      const withoutTolerance = [
        "I1/zero-km",
        "I1/workouts-weeks",
        "I2/slot-kind",
        "I2/mlr-distance",
        "I2/shortened-not-to-long-run",
        "I2/fit-note-outside-build",
        "I2/fit-note-without-shortening",
        "I6/hard-spacing",
        "I6/hard-adjacent",
        "I6/hard-after-carry",
        "I6/hard-before-next-hard",
        "I6/harder-than-layout",
        "I6/mlr-sandwich",
        "I7/q-count",
        "I9/raised-not-to-minimum",
        "I12/r-distance",
        "I14/race",
        "I14/plan-end",
        "I15/q-too-close",
        "I15/long-run-too-close",
        "I15/hard-before-race",
        "I16/unavailable-day",
        "I16/long-run-day",
        "I16/run-days",
        "I16/partial-week-run-days",
        "I16/taper-run-days",
        "I17/pace-order",
        "I18/goal-pace",
        "I21/week-meta",
        "I22/recovery-focus",
        "BEGINNER/i-r",
        "VOLUME/structure",
        "LAYOUT/structure",
        "PLAN/duplicate-id",
      ];
      const rules = INVARIANT_RULES as Record<string, { severity: Severity; tolerance?: string; reasoned?: true }>;
      const keys = Object.keys(rules);
      expect(keys.filter((key) => rules[key].severity === "error" && rules[key].tolerance === undefined)).toEqual(withoutTolerance);
      expect(keys.filter((key) => rules[key].severity === "warning" && rules[key].tolerance !== undefined)).toEqual([]);
      expect(keys.filter((key) => rules[key].reasoned && rules[key].severity !== "warning")).toEqual([]);
    });
  });

  it("Server-Log (toLogEntries): nur Code, Regel, Woche und Schwere, kein Tag, keine Zahlen", () => {
    const f = base("P3");
    setEasyKm(day(f.plan, 2, "So"), 20);
    const entries = toLogEntries(checkPlan(f.plan, f.inputs).violations);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((entry) => expect(Object.keys(entry).sort()).toEqual(expect.arrayContaining(["code", "rule", "severity"])));
    entries.forEach((entry) => expect(Object.keys(entry).filter((k) => ["code", "rule", "severity", "wn"].indexOf(k) < 0)).toEqual([]));
  });
});
