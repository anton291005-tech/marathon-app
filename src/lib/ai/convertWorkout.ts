import { inferIntensity } from "../../ai/validation/validateMicroStructure";
import type { Intensity, WorkoutSport, WorkoutV2 } from "../../planV2/types";

/**
 * Sport- und sessionType-übergreifende Konvertierung via registrierte Regeln.
 * Bike → Run: Dauer-basierte Äquivalenz + Intensitäts-Mapping.
 */

export type ConversionTarget =
  | { kind: "sport"; sport: WorkoutSport }
  | { kind: "sessionType"; sessionType: string };

export type ConversionInput = {
  workout: WorkoutV2;
  target: ConversionTarget;
};

export type ConversionResult = {
  proposed: Partial<WorkoutV2>;
  explanation: string;
  originalSummary: string;
  proposedSummary: string;
};

export interface ConversionRule {
  /** Stabiler Schlüssel, z. B. `bike→run`. */
  id: string;
  fromSport: WorkoutSport;
  /** Ziel-Sport oder gleicher Sport bei Intensitäts-Shift. */
  toSport: WorkoutSport;
  /** Optional: nur für bestimmte Quell-sessionTypes (z. B. long→tempo). */
  fromSessionType?: string;
  /** Ob diese Regel für das Workout + Ziel zuständig ist. */
  matches(workout: WorkoutV2, target: ConversionTarget): boolean;
  convert(workout: WorkoutV2): ConversionResult;
}

type RunSessionType = "easy" | "tempo" | "interval";

const BIKE_SPEED_KMH: Record<Intensity, number> = {
  low: 25,
  medium: 30,
  high: 35,
};

const RUN_PACE_MIN_PER_KM: Record<RunSessionType, number> = {
  easy: 6.5,
  tempo: 5.5,
  interval: 5.0,
};

const MIN_RUN_KM = 5;
const MAX_RUN_KM = 30;
const DEFAULT_BIKE_DURATION_MIN = 60;

function isBikeWorkout(workout: WorkoutV2): boolean {
  return workout.sport === "bike" || workout.sessionType === "bike";
}

function parseDurationMin(workout: WorkoutV2): number | null {
  const text = `${workout.title} ${workout.desc ?? ""}`;
  const match = /(\d{1,3})\s*min/i.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function inferBikeIntensity(workout: WorkoutV2): Intensity {
  if (workout.intensity) return workout.intensity;
  const inferred = inferIntensity(workout);
  if (inferred !== "low" || workout.sessionType !== "bike") return inferred;

  const text = `${workout.title} ${workout.desc ?? ""}`.toLowerCase();
  if (/(intervall|hard|hoch|intensiv|ftp|widerstand hoch|z5)/.test(text)) return "high";
  if (/(tempo|schwelle|moderat|medium|z3|z4|schwellenbereich)/.test(text)) return "medium";
  return "low";
}

function mapBikeIntensityToRunSession(intensity: Intensity): RunSessionType {
  if (intensity === "high") return "interval";
  if (intensity === "medium") return "tempo";
  return "easy";
}

function mapRunSessionToIntensity(sessionType: RunSessionType): Intensity {
  if (sessionType === "interval") return "high";
  if (sessionType === "tempo") return "medium";
  return "low";
}

function formatMinutesLabel(minutes: number): string {
  return `${Math.round(minutes)} min`;
}

function formatPace(minPerKm: number): string {
  const totalSec = Math.round(minPerKm * 60);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}/km`;
}

function formatPaceRange(centerMinPerKm: number, deltaMin = 0.15): string {
  return `${formatPace(centerMinPerKm - deltaMin)}–${formatPace(centerMinPerKm + deltaMin)}`;
}

function estimateBikeDurationMin(workout: WorkoutV2, intensity: Intensity): number {
  const parsed = parseDurationMin(workout);
  if (parsed) return parsed;
  if (workout.km > 0) {
    return (workout.km / BIKE_SPEED_KMH[intensity]) * 60;
  }
  return DEFAULT_BIKE_DURATION_MIN;
}

function estimateBikeKm(workout: WorkoutV2, durationMin: number, intensity: Intensity): number {
  if (workout.km > 0) return Math.round(workout.km);
  return Math.round((durationMin / 60) * BIKE_SPEED_KMH[intensity]);
}

function runKmFromDuration(durationMin: number, sessionType: RunSessionType): number {
  const km = durationMin / RUN_PACE_MIN_PER_KM[sessionType];
  return Math.round(Math.max(MIN_RUN_KM, Math.min(MAX_RUN_KM, km)) * 10) / 10;
}

function intensityLabel(intensity: Intensity): string {
  if (intensity === "high") return "hard";
  if (intensity === "medium") return "medium";
  return "easy";
}

function runSessionLabel(sessionType: RunSessionType): string {
  if (sessionType === "interval") return "Intervall";
  if (sessionType === "tempo") return "Tempo";
  return "Easy";
}

function buildRunTitle(sessionType: RunSessionType, km: number): string {
  if (sessionType === "interval") return `Intervall ~${km} km`;
  if (sessionType === "tempo") return `Tempo ${km} km`;
  return `Easy Run ${km} km`;
}

function buildRunPace(sessionType: RunSessionType): string {
  if (sessionType === "interval") return formatPace(RUN_PACE_MIN_PER_KM.interval);
  if (sessionType === "tempo") return formatPaceRange(RUN_PACE_MIN_PER_KM.tempo);
  return formatPaceRange(RUN_PACE_MIN_PER_KM.easy);
}

function buildRunDesc(sessionType: RunSessionType, km: number, durationMin: number): string {
  const roundedDuration = Math.round(durationMin);
  if (sessionType === "interval") {
    return `Äquivalent zur Bike-Belastung: ~${roundedDuration} min Qualität (~${km} km inkl. Warm-up/Cool-down). Hart, aber kontrolliert.`;
  }
  if (sessionType === "tempo") {
    return `Äquivalent zur Bike-Belastung: ~${roundedDuration} min im Schwellenbereich (~${km} km). Nur bei guter Erholung.`;
  }
  return `Äquivalent zur Bike-Belastung: ~${roundedDuration} min locker (~${km} km, Zone 2).`;
}

function buildBikeToRunExplanation(
  durationMin: number,
  bikeIntensity: Intensity,
  sessionType: RunSessionType,
  km: number,
): string {
  const bikeSpeed = BIKE_SPEED_KMH[bikeIntensity];
  const runPace = formatPace(RUN_PACE_MIN_PER_KM[sessionType]);
  return [
    `Die Rennrad-Einheit entspricht sportwissenschaftlich etwa ${Math.round(durationMin)} Minuten Belastung`,
    `(geschätzt über Dauer bei ~${bikeSpeed} km/h, Intensität ${intensityLabel(bikeIntensity)}).`,
    `Als Lauf mit gleicher Trainingsdauer und passender Intensität (${runSessionLabel(sessionType)}, ~${runPace})`,
    `ergibt sich ein äquivalentes Volumen von ca. ${km} km — aerobe Grundlage bleibt erhalten,`,
    `Spezifität verschiebt sich Richtung Laufen.`,
  ].join(" ");
}

function convertBikeToRun(workout: WorkoutV2): ConversionResult {
  const bikeIntensity = inferBikeIntensity(workout);
  const durationMin = estimateBikeDurationMin(workout, bikeIntensity);
  const targetSessionType = mapBikeIntensityToRunSession(bikeIntensity);
  const targetKm = runKmFromDuration(durationMin, targetSessionType);
  const targetPace = buildRunPace(targetSessionType);
  const targetTitle = buildRunTitle(targetSessionType, targetKm);
  const targetDesc = buildRunDesc(targetSessionType, targetKm, durationMin);

  const bikeKm = estimateBikeKm(workout, durationMin, bikeIntensity);
  const originalSummary = `Rennrad ${formatMinutesLabel(durationMin)} ~${bikeKm} km ${intensityLabel(bikeIntensity)}`;
  const proposedSummary = `Lauf ~${formatMinutesLabel(durationMin)} ${targetKm} km ${runSessionLabel(targetSessionType)}`;

  return {
    proposed: {
      sport: "run",
      sessionType: targetSessionType,
      intensity: mapRunSessionToIntensity(targetSessionType),
      km: targetKm,
      pace: targetPace,
      title: targetTitle,
      desc: targetDesc,
    },
    explanation: buildBikeToRunExplanation(durationMin, bikeIntensity, targetSessionType, targetKm),
    originalSummary,
    proposedSummary,
  };
}

function notImplementedRule(id: string, fromSport: WorkoutSport, toSport: WorkoutSport): ConversionRule {
  return {
    id,
    fromSport,
    toSport,
    matches: (workout, target) =>
      workout.sport === fromSport &&
      target.kind === "sport" &&
      target.sport === toSport,
    convert: () => {
      throw new Error(`${id} ist noch nicht implementiert.`);
    },
  };
}

const bikeToRunRule: ConversionRule = {
  id: "bike→run",
  fromSport: "bike",
  toSport: "run",
  matches: (workout, target) =>
    isBikeWorkout(workout) && target.kind === "sport" && target.sport === "run",
  convert: convertBikeToRun,
};

const longToTempoRule: ConversionRule = {
  id: "run:long→tempo",
  fromSport: "run",
  toSport: "run",
  fromSessionType: "long",
  matches: (workout, target) =>
    workout.sport === "run" &&
    workout.sessionType === "long" &&
    target.kind === "sessionType" &&
    target.sessionType === "tempo",
  convert: () => {
    throw new Error("long→tempo ist noch nicht implementiert.");
  },
};

const strengthToRunRule: ConversionRule = {
  id: "strength→run",
  fromSport: "run",
  toSport: "run",
  fromSessionType: "strength",
  matches: (workout, target) =>
    workout.sessionType === "strength" && target.kind === "sport" && target.sport === "run",
  convert: () => {
    throw new Error("strength→run ist noch nicht implementiert.");
  },
};

/** Regeln in Prioritäts-Reihenfolge — neue Paare hier registrieren. */
export const CONVERSION_RULES: readonly ConversionRule[] = [
  bikeToRunRule,
  longToTempoRule,
  strengthToRunRule,
  notImplementedRule("run→bike", "run", "bike"),
] as const;

export function findConversionRule(workout: WorkoutV2, target: ConversionTarget): ConversionRule | null {
  for (const rule of CONVERSION_RULES) {
    if (rule.fromSessionType && workout.sessionType !== rule.fromSessionType) continue;
    if (rule.matches(workout, target)) return rule;
  }
  return null;
}

export function convertWorkout(input: ConversionInput): ConversionResult {
  const rule = findConversionRule(input.workout, input.target);
  if (!rule) {
    throw new Error(
      `Keine Konvertierungsregel für ${input.workout.sport}/${input.workout.sessionType} → ${JSON.stringify(input.target)}.`,
    );
  }
  return rule.convert(input.workout);
}

/** @deprecated Nutze `convertWorkout({ workout, target: { kind: "sport", sport: "run" } })`. */
export function convertWorkoutToRun(workout: WorkoutV2): ConversionResult {
  if (!isBikeWorkout(workout)) {
    throw new Error("convertWorkoutToRun erwartet eine Bike-/Rennrad-Einheit.");
  }
  return convertWorkout({ workout, target: { kind: "sport", sport: "run" } });
}

/** Test- und Validierungs-Helfer. */
export function __testingExports() {
  return {
    inferBikeIntensity,
    estimateBikeDurationMin,
    mapBikeIntensityToRunSession,
    runKmFromDuration,
    BIKE_SPEED_KMH,
    RUN_PACE_MIN_PER_KM,
    MIN_RUN_KM,
    MAX_RUN_KM,
    DEFAULT_BIKE_DURATION_MIN,
  };
}
