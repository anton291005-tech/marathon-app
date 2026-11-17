import type { CoreInputs, CoreKind, PlanRules } from "../planCore";

export type WorkoutSport = "run" | "bike" | "rest" | "strength" | "swim";
export type Intensity = "low" | "medium" | "high";

export type WorkoutV2 = {
  id: string;
  /** ISO date-time string (local noon recommended) */
  dateIso: string;
  sport: WorkoutSport;

  /** Original session type (easy/interval/tempo/long/strength/bike/rest/race/...) */
  sessionType: string;
  intensity?: Intensity;
  title: string;
  km: number;
  desc?: string | null;
  pace?: string | null;
  structured?: any | null;
  /** Interne Einheiten-Art des Plan-Kerns (REC, E, M, T …); fehlt bei Plänen, die nicht aus dem Kern stammen. */
  kind?: CoreKind;
};

export type WeekV2 = {
  /** ISO YYYY-MM-DD for week start (Monday) */
  startIso: string;
  totalKm: number;
  workouts: WorkoutV2[];
  meta?: {
    wn?: number;
    phase?: string;
    label?: string;
    dates?: string;
    focus?: string;
    isRecoveryWeek?: boolean;
  };
};

/** Hinweis der Planerzeugung: die Spitze wurde nicht erreicht (10-%-Grenze oder zu wenige Lauftage). */
export type PlanVolumeNoteV2 = {
  code: "peak-not-reached";
  reason: "growth" | "run-days";
  targetPeakKm: number;
  reachedPeakKm: number;
};

/** Wie der Plan entstanden ist (Plan-Kern): Config-Version, Eingaben und Regeln. */
export type PlanCoreMetaV2 = {
  configVersion: string;
  inputs: CoreInputs;
  rules: PlanRules;
};

/**
 * Ziel des Plans (Freundes-Test W3): Zielzeit bzw. „Nur finishen" gehören zu EINEM Plan. Bisher lagen sie nur
 * in den Preferences und nutzerweit im Profil (`target_time_seconds`) — auf einem frischen Gerät griff dann die
 * Profil-Zielzeit, auch wenn sie von einem anderen Plan stammte. `targetTime: null` = bewusst keine Zielzeit.
 */
export type PlanGoalMetaV2 = {
  raceGoal: "time" | "finish";
  /** „3:45:00"; null = keine Zielzeit eingetragen. */
  targetTime: string | null;
};

export type TrainingPlanMetaV2 = {
  volumeNote?: PlanVolumeNoteV2;
  core?: PlanCoreMetaV2;
  goal?: PlanGoalMetaV2;
};

export type TrainingPlanV2 = {
  version: 2;
  workouts: WorkoutV2[];
  weeks: WeekV2[];
  /** Optional, nur von der Planerzeugung gesetzt (für spätere Anzeige). */
  meta?: TrainingPlanMetaV2;
};

