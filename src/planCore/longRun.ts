/**
 * Long Run (docs/plan-spec.md §7.1, §5.4): Zielverlauf über den Plan und Grenzen je Woche.
 *
 * Zwei Teile:
 * - `longRunSchedule` rechnet den gewünschten Verlauf vorab (linear vom Startwert zum Ziel des längsten Long Runs,
 *   beim Marathon wird das Ziel `marathonLongRunsAtLeast.min` normale Wochen lang gehalten).
 * - `longRunLimitKm` begrenzt die Woche nach dem tatsächlichen Verlauf davor: Anteil an den Wochen-km, 180 min,
 *   Steigerung (+2 km oder +15 %, höchstens +3 km; erste Woche nach Entlastung höchstens das Niveau davor), Entlastung
 *   −25 %, Taper höchstens 60 % des längsten Long Runs.
 * Die Woche kann den Long Run danach noch kürzen (Platz für E/REC, `distribute.ts`); der Zustand rechnet mit dem
 * tatsächlichen Wert weiter, damit I9 für den fertigen Plan gilt.
 */

import { CONFIG } from "./config";
import type { Range } from "./config";
import type { CoreInputs, Distance, RunDays } from "./types";

const EPS = 1e-9;

/** Auf 0,1 km abrunden (Grenzen dürfen nie überschritten werden). */
export const floorTenth = (km: number): number => Math.floor(km * 10 + EPS) / 10;

export const roundTenth = (km: number): number => Math.round(km * 10) / 10;

/** Peak-Ziel des längsten Long Runs nach Distanz (Marathon nach Lauftagen getrennt). */
export function peakLongRunRange(distance: Distance, runDays: RunDays): Range {
  const { longRun } = CONFIG;
  if (distance === "m") {
    return runDays >= longRun.marathonManyDaysFrom.value
      ? longRun.peakKmMarathonManyDays.value
      : longRun.peakKmMarathonFewDays.value;
  }
  return longRun.peakKm.value[distance];
}

/** Standardwert des Onboardings, wenn der längste Lauf nicht angegeben ist (§2): nach Distanz und Lauftagen, immer > 0. */
export function defaultLongestRecentRunKm(distance: Distance, runDays: RunDays): number {
  return CONFIG.inputs.longestRecentRunDefaultKm.value[distance][runDays];
}

/** Längster Lauf der letzten 4 Wochen; Vorgabe nach §2. */
export function longestRecentRunKm(inputs: Pick<CoreInputs, "longestRecentRunKm" | "currentWeeklyKm">): number {
  if (typeof inputs.longestRecentRunKm === "number" && Number.isFinite(inputs.longestRecentRunKm)) {
    return Math.max(0, inputs.longestRecentRunKm);
  }
  const { longestRecentRunFallbackShare, longestRecentRunFallbackMinKm } = CONFIG.inputs;
  return Math.max(longestRecentRunFallbackMinKm.value, inputs.currentWeeklyKm * longestRecentRunFallbackShare.value);
}

/** Höchstwert des ersten Long Runs (§7.1 Startwert). */
export function longRunStartCapKm(inputs: Pick<CoreInputs, "longestRecentRunKm" | "currentWeeklyKm">): number {
  return floorTenth(longestRecentRunKm(inputs) + CONFIG.longRun.startAboveLongestRecentKm.value);
}

/** Harte Zeitgrenze (180 min) bei E-Pace in km. */
export function longRunMinutesCapKm(ePaceSecPerKm: number): number {
  return floorTenth((CONFIG.longRun.minutesHard.value * 60) / ePaceSecPerKm);
}

/** Anteil an den Wochen-km (ohne Rennen). */
export function longRunShareCapKm(runDays: RunDays, weekKm: number): number {
  return floorTenth(CONFIG.longRun.maxShareOfWeek.value[runDays] * weekKm);
}

/** Erlaubte Steigerung zur letzten LR: das Größere aus km und Anteil, höchstens `absoluteMaxStepKm`. */
export function longRunStepKm(lastKm: number): number {
  const { maxStepKm, maxStepShare, absoluteMaxStepKm } = CONFIG.longRun;
  return Math.min(absoluteMaxStepKm.value, Math.max(maxStepKm.value, maxStepShare.value * lastKm));
}

/**
 * Ziel des längsten Long Runs (freigegeben 2026-11-05): Anteilsgrenze der Lauftage (`maxShareOfWeek`) × Peak-Wochenumfang,
 * auf das Peak-Ziel der Distanz begrenzt, danach 180 min. Liegt das Peak-Ziel über dem Anteil, gewinnt der Anteil (P4, P6).
 */
export function longRunPeakTargetKm(distance: Distance, runDays: RunDays, peakWeekKm: number, ePaceSecPerKm: number): number {
  const range = peakLongRunRange(distance, runDays);
  const share = longRunShareCapKm(runDays, peakWeekKm);
  const wanted = Math.min(range.max, Math.max(range.min, share));
  return floorTenth(Math.min(wanted, share, longRunMinutesCapKm(ePaceSecPerKm)));
}

export type LongRunWeek = {
  hasLongRun: boolean;
  isRecoveryWeek: boolean;
  /** Taper-Woche vor der Rennwoche (die Rennwoche hat keinen Long Run). */
  taper: boolean;
};

/**
 * Gewünschter Verlauf: je Woche mit Long Run (ohne Entlastung und Taper) linear vom Startwert zum Ziel; das Ziel wird in
 * den letzten `plateau` dieser Wochen gehalten. Entlastungs-, Taper- und Wochen ohne Long Run: `null`.
 */
export function longRunSchedule(
  weeks: LongRunWeek[],
  args: { startKm: number; peakKm: number; distance: Distance; runDays: RunDays },
): Array<number | null> {
  const { longRun } = CONFIG;
  const plain: number[] = [];
  weeks.forEach((week, index) => {
    if (week.hasLongRun && !week.isRecoveryWeek && !week.taper) plain.push(index);
  });
  // Marathon: das Ziel in mindestens `marathonLongRunsAtLeast.min` Wochen (§7.1 "2–3 Läufe ≥ 30 km", P4 "≥ 2 LR ≥ 24 km").
  const plateau = args.distance === "m" ? longRun.marathonLongRunsAtLeast.value.min : 1;
  let reachAt = Math.max(0, plain.length - plateau);
  // Folgt eine Plateau-Woche direkt auf eine Entlastung, darf sie nur auf das Niveau davor (I9-Ausnahme): die Woche vor
  // der Entlastung gehört dann mit zum Plateau.
  for (let j = plain.length - 1; j >= reachAt && j > 0; j -= 1) {
    const before = weeks[plain[j] - 1];
    if (before !== undefined && before.isRecoveryWeek && before.hasLongRun) reachAt = Math.min(reachAt, j - 1);
  }
  const start = Math.min(args.startKm, args.peakKm);

  const out: Array<number | null> = weeks.map(() => null);
  plain.forEach((weekIndex, j) => {
    const value = j >= reachAt || reachAt === 0 ? args.peakKm : start + ((args.peakKm - start) * j) / reachAt;
    out[weekIndex] = roundTenth(value);
  });
  return out;
}

/** Zustand nach der letzten Woche mit Long Run. */
export type LongRunState = {
  /** Letzter Long Run (beliebige Woche). */
  last: number | null;
  /** Letzter Long Run einer normalen Woche (nicht Entlastung, nicht Taper): Niveau für die Woche nach der Entlastung. */
  level: number | null;
  /** Längster Long Run bisher (Bezug für den Taper). */
  longest: number;
  /** Die letzte Woche mit Long Run war eine Entlastungswoche. */
  afterRecovery: boolean;
};

export const INITIAL_LONG_RUN_STATE: LongRunState = { last: null, level: null, longest: 0, afterRecovery: false };

export type LongRunLimitArgs = {
  /** Wunschwert aus `longRunSchedule` (nur normale Wochen). */
  desired: number | null;
  isRecoveryWeek: boolean;
  taper: boolean;
  runDays: RunDays;
  /** Wochen-km ohne Rennen. */
  weekKm: number;
  ePaceSecPerKm: number;
  startCapKm: number;
  /** Harte Untergrenze (15 min bei E-Pace, `easyHardMinKm("LR")`); liegt die Grenze darunter, gilt sie (Review-Punkt 34). */
  hardMinKm: number;
};

export type LongRunLimit = {
  km: number;
  /** Taper-Grenze (60 % des längsten) hat gegriffen. */
  taperCut: boolean;
  /** Die Grenzen lagen unter der harten Untergrenze; `km` ist diese Untergrenze (Review-Punkt 34). */
  raisedToMinimum: boolean;
};

/** Long Run dieser Woche aus Wunschwert, Grenzen und dem Verlauf davor, mindestens die harte Untergrenze. */
export function longRunLimitKm(state: LongRunState, args: LongRunLimitArgs): LongRunLimit {
  const limit = longRunLimitWithinCaps(state, args);
  if (limit.km >= args.hardMinKm - EPS) return { ...limit, raisedToMinimum: false };
  // Ausnahme (Hinweis) nur, wenn die Grenzen selbst unter der Untergrenze liegen; liegt nur der Wunschwert des Verlaufs
  // darunter, bleibt der Long Run mit 15 min in seinen Grenzen.
  const bounds = longRunLimitWithinCaps(state, { ...args, desired: null });
  return { km: args.hardMinKm, taperCut: false, raisedToMinimum: bounds.km < args.hardMinKm - EPS };
}

function longRunLimitWithinCaps(state: LongRunState, args: LongRunLimitArgs): { km: number; taperCut: boolean } {
  const caps = Math.min(longRunShareCapKm(args.runDays, args.weekKm), longRunMinutesCapKm(args.ePaceSecPerKm));
  if (args.taper) {
    const taperMax = floorTenth(CONFIG.taper.longRunShareOfPeak.value * state.longest);
    const km = floorTenth(Math.min(caps, taperMax > 0 ? taperMax : caps));
    return { km, taperCut: taperMax > 0 && taperMax < caps };
  }
  if (args.isRecoveryWeek) {
    const base = state.last === null ? (args.desired === null ? caps : args.desired) : state.last;
    return { km: floorTenth(Math.min(caps, base * (1 - CONFIG.longRun.recoveryReductionUsed.value))), taperCut: false };
  }
  let stepCap: number;
  if (state.last === null) stepCap = args.startCapKm;
  else if (state.afterRecovery && state.level !== null) stepCap = state.level;
  else stepCap = state.last + longRunStepKm(state.last);
  const desired = args.desired === null ? stepCap : args.desired;
  return { km: floorTenth(Math.min(desired, stepCap, caps)), taperCut: false };
}

/** Zustand nach einer Woche mit Long Run `km`. */
export function advanceLongRun(state: LongRunState, week: { isRecoveryWeek: boolean; taper: boolean }, km: number): LongRunState {
  const normal = !week.isRecoveryWeek && !week.taper;
  return {
    last: km,
    level: normal ? km : state.level,
    longest: Math.max(state.longest, km),
    afterRecovery: week.isRecoveryWeek,
  };
}
