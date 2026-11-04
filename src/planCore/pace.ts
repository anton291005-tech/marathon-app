/**
 * Form und Pace (docs/plan-spec.md §3): VDOT nach Daniels-Gilbert, Abschlag für alte Rennen, Trainingspaces,
 * Zielpace und Einsteiger-Modus.
 *
 * Alle Paces sind ganze Sekunden je km. Keine Uhr: "heute" ist eine Eingabe (`todayYmd`).
 * Der Kern wirft nur bei kaputten Eingaben des Aufrufers (Distanz, Datum); eine unplausible Rennangabe führt in den
 * Einsteiger-Modus mit Hinweis `recent-race-invalid`, damit die App nutzbar bleibt.
 */

import { CONFIG } from "./config";
import { diffDays, isYmd } from "./dates";
import { isDistance, planCoreError } from "./phases";
import type { CoreInputs, Distance, RecentRace, Ymd } from "./types";

/** Daniels-Gilbert: VO2 (ml/kg/min) aus Geschwindigkeit v (m/min). */
const VO2_CONST = -4.6;
const VO2_LINEAR = 0.182258;
const VO2_QUADRATIC = 0.000104;

const DAYS_PER_WEEK = 7;

export type PaceCode = "REC" | "E" | "M" | "T" | "I" | "R";

/** Sekunden je km; es gilt REC > E > M > T > I > R (I17). */
export type TrainingPaces = Readonly<Record<PaceCode, number>>;

export type BeginnerPaces = Readonly<Pick<TrainingPaces, "REC" | "E">>;

export type PaceInputs = Pick<CoreInputs, "distance" | "recentRace" | "goalTime">;

export type RecentRaceProblem = "distance" | "time" | "date" | "vdot-range";

export type PaceNote =
  /** Rennangabe unplausibel; Einsteiger-Modus. */
  | { code: "recent-race-invalid"; reason: RecentRaceProblem }
  /** Rennen älter als `form.vdotFreeWeeks`; VDOT um `penalty` gekürzt. */
  | { code: "race-aged"; ageWeeks: number; penalty: number }
  /** Ziel liegt über der Form: "Ziel liegt aktuell `gapSeconds` s über deiner Form". Renntempo kommt aus der Form. */
  | { code: "goal-above-form"; gapVdot: number; gapSeconds: number }
  /** Zielpace lag außerhalb des zulässigen Bereichs und wurde auf `secPerKm` begrenzt. */
  | { code: "goal-pace-clamped"; fromSecPerKm: number; secPerKm: number }
  /** `goalTime` war keine positive Zahl und wurde ignoriert. */
  | { code: "goal-invalid" };

export type GoalInfo = {
  /** VDOT, der zur Zielzeit auf der Plandistanz gehört. */
  vdot: number;
  /** `vdot` minus aktueller VDOT; negativ = Ziel leichter als die Form. */
  gapVdot: number;
  /** Formzeit minus Zielzeit: so viele Sekunden ist das Ziel schneller, als die Form hergibt (positiv = "Ziel liegt X min über deiner Form"). */
  gapSeconds: number;
  /** `true`, wenn die Zielpace für M-/HM-Pace-Einheiten gilt. */
  used: boolean;
};

export type RacePace = {
  distance: Distance;
  km: number;
  /** Pace auf der Plandistanz: Zielpace oder Formpace. */
  secPerKm: number;
  source: "goal" | "form";
};

export type PaceProfile =
  | {
      mode: "vdot";
      /** VDOT aus dem Rennen, vor Abschlag. */
      vdotRaw: number;
      /** VDOT nach Abschlag; Grundlage aller Paces. */
      vdot: number;
      penalty: number;
      /** Beim Marathon ist `M` die Renn-/Zielpace (`racePace`), sonst die Formpace. */
      paces: TrainingPaces;
      racePace: RacePace;
      goal: GoalInfo | null;
      notes: PaceNote[];
    }
  | {
      mode: "beginner";
      /** Nur E und REC; I, R, T und M gibt es nur als RPE/Gefühl. */
      paces: BeginnerPaces;
      notes: PaceNote[];
    };

function vo2OfVelocity(metersPerMinute: number): number {
  return VO2_CONST + VO2_LINEAR * metersPerMinute + VO2_QUADRATIC * metersPerMinute * metersPerMinute;
}

/** Anteil der VO2max, den man über `minutes` Minuten halten kann. */
function sustainableFraction(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

/** VDOT aus einer Renndistanz (km) und Zeit (s). */
export function vdotFromRace(distanceKm: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  return vo2OfVelocity((distanceKm * 1000) / minutes) / sustainableFraction(minutes);
}

/** Rennzeit (s) auf `distanceKm`, die zu `vdot` gehört (Umkehrung von `vdotFromRace` per Bisektion). */
export function predictRaceSeconds(vdot: number, distanceKm: number): number {
  let fast = distanceKm * 60;
  let slow = distanceKm * 1500;
  for (let i = 0; i < 100; i += 1) {
    const mid = (fast + slow) / 2;
    if (vdotFromRace(distanceKm, mid) > vdot) fast = mid;
    else slow = mid;
  }
  return (fast + slow) / 2;
}

/** Pace (s/km) bei `share` × VDOT als VO2. */
function paceAtShare(vdot: number, share: number): number {
  const c = VO2_CONST - share * vdot;
  const velocity = (-VO2_LINEAR + Math.sqrt(VO2_LINEAR * VO2_LINEAR - 4 * VO2_QUADRATIC * c)) / (2 * VO2_QUADRATIC);
  return 60000 / velocity;
}

/** Trainingspaces aus dem VDOT, nur nach Formel (ohne Ziel). M ist die Marathon-Rennpace dieses VDOT. */
export function trainingPaces(vdot: number): TrainingPaces {
  const { form, scope } = CONFIG;
  const e = paceAtShare(vdot, form.eShare.value);
  const i = paceAtShare(vdot, form.iShare.value);
  const marathonKm = scope.raceKm.value.m;
  const recOffset = (form.recPaceOffsetSecPerKm.value.min + form.recPaceOffsetSecPerKm.value.max) / 2;
  return {
    REC: Math.round(e + recOffset),
    E: Math.round(e),
    M: Math.round(predictRaceSeconds(vdot, marathonKm) / marathonKm),
    T: Math.round(paceAtShare(vdot, form.tShare.value)),
    I: Math.round(i),
    R: Math.round(i - form.rOffsetSecPerKm.value),
  };
}

/** Einsteiger-Modus: nur E (Standardwert) und REC. */
function beginnerPaces(): BeginnerPaces {
  const { form } = CONFIG;
  const e = form.beginnerEPaceSecPerKm.value;
  const recOffset = (form.recPaceOffsetSecPerKm.value.min + form.recPaceOffsetSecPerKm.value.max) / 2;
  return { REC: Math.round(e + recOffset), E: Math.round(e) };
}

/**
 * Abschlag für ein Rennen vom Alter `ageDays`: −1 je angefangene 6 Wochen über 12 Wochen, höchstens −4.
 * Ein Rennen in der Zukunft zählt als aktuell.
 */
export function vdotPenalty(ageDays: number): number {
  const { vdotFreeWeeks, vdotPenaltyStepWeeks, vdotPenaltyPerStep, vdotPenaltyMax } = CONFIG.form;
  const overDays = ageDays - vdotFreeWeeks.value * DAYS_PER_WEEK;
  if (!(overDays > 0)) return 0;
  const steps = Math.ceil(overDays / (vdotPenaltyStepWeeks.value * DAYS_PER_WEEK));
  return Math.min(vdotPenaltyMax.value, steps * vdotPenaltyPerStep.value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function checkRace(race: RecentRace): RecentRaceProblem | null {
  const { min, max } = CONFIG.form.raceDistanceKm.value;
  if (!isPositiveFinite(race.distanceKm) || race.distanceKm < min || race.distanceKm > max) return "distance";
  if (!isPositiveFinite(race.timeSeconds)) return "time";
  if (!race.estimated && !isYmd(race.dateYmd)) return "date";
  return null;
}

function inVdotRange(vdot: number): boolean {
  const { min, max } = CONFIG.form.vdotRange.value;
  return Number.isFinite(vdot) && vdot >= min && vdot <= max;
}

function beginnerProfile(notes: PaceNote[]): PaceProfile {
  return { mode: "beginner", paces: beginnerPaces(), notes };
}

/**
 * Pace-Profil aus Rennangabe und Ziel (§3). `todayYmd` ist der Bezugstag für das Alter des Rennens.
 * Wirft `invalid-input` nur bei ungültiger Plandistanz oder ungültigem `todayYmd`.
 */
export function buildPaceProfile(inputs: PaceInputs, todayYmd: Ymd): PaceProfile {
  const { distance, recentRace: race, goalTime } = inputs;
  if (!isDistance(distance)) throw planCoreError("invalid-input", "distance");
  if (!isYmd(todayYmd)) throw planCoreError("invalid-input", "todayYmd");

  const notes: PaceNote[] = [];
  if (race === undefined || race === null) return beginnerProfile(notes);

  const problem = checkRace(race);
  if (problem !== null) {
    notes.push({ code: "recent-race-invalid", reason: problem });
    return beginnerProfile(notes);
  }

  const vdotRaw = vdotFromRace(race.distanceKm, race.timeSeconds);
  // Eine Schätzzeit hat kein Datum und altert nicht.
  const ageDays = race.estimated ? 0 : diffDays(todayYmd, race.dateYmd as Ymd);
  const penalty = vdotPenalty(ageDays);
  const vdot = vdotRaw - penalty;
  if (!inVdotRange(vdotRaw) || !inVdotRange(vdot)) {
    notes.push({ code: "recent-race-invalid", reason: "vdot-range" });
    return beginnerProfile(notes);
  }
  if (penalty > 0) notes.push({ code: "race-aged", ageWeeks: Math.floor(ageDays / DAYS_PER_WEEK), penalty });

  const paces = trainingPaces(vdot);
  const km = CONFIG.scope.raceKm.value[distance];
  const predictedSeconds = predictRaceSeconds(vdot, km);
  let racePace: RacePace = { distance, km, secPerKm: Math.round(predictedSeconds / km), source: "form" };
  let goal: GoalInfo | null = null;

  if (goalTime !== undefined && goalTime !== null) {
    if (!isPositiveFinite(goalTime)) {
      notes.push({ code: "goal-invalid" });
    } else {
      const gapVdot = vdotFromRace(km, goalTime) - vdot;
      const gapSeconds = predictedSeconds - goalTime;
      const used = gapVdot <= CONFIG.form.goalVdotGapMax.value;
      goal = { vdot: vdot + gapVdot, gapVdot, gapSeconds, used };
      if (used) {
        const margin = CONFIG.form.goalPaceMarginSecPerKm.value;
        const goalPace = Math.round(goalTime / km);
        // Zu leichtes Ziel nie langsamer als E; beim Marathon ersetzt es M und bleibt dann auch langsamer als T (I17).
        const slowest = paces.E - margin;
        const fastest = distance === "m" ? paces.T + margin : goalPace;
        const secPerKm = Math.min(slowest, Math.max(fastest, goalPace));
        if (secPerKm !== goalPace) notes.push({ code: "goal-pace-clamped", fromSecPerKm: goalPace, secPerKm });
        racePace = { distance, km, secPerKm, source: "goal" };
      } else {
        notes.push({ code: "goal-above-form", gapVdot, gapSeconds });
      }
    }
  }

  return {
    mode: "vdot",
    vdotRaw,
    vdot,
    penalty,
    paces: distance === "m" ? { ...paces, M: racePace.secPerKm } : paces,
    racePace,
    goal,
    notes,
  };
}

/** "m:ss" aus Sekunden je km. */
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? "0" : ""}${seconds}`;
}

/** "m:ss–m:ss" (schnell–langsam), das Format von `workout.pace`, das die App liest. */
export function formatPaceRange(fastSecPerKm: number, slowSecPerKm: number): string {
  return `${formatPace(fastSecPerKm)}–${formatPace(slowSecPerKm)}`;
}
