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

export type TrainingPlanV2 = {
  version: 2;
  workouts: WorkoutV2[];
  weeks: WeekV2[];
};

