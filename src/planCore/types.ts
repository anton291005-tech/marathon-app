/**
 * Typen des deterministischen Plan-Kerns (docs/plan-spec.md §2, §7, §10).
 *
 * Dieses Modul importiert nichts außerhalb von src/planCore: Server (Vercel) und App nutzen denselben Code.
 * Die Ausgabetypen (`CorePlan` …) sind strukturell kompatibel zu `TrainingPlanV2` (src/planV2/types.ts) und
 * werden dort nicht importiert; `src/planV2/planCoreCompat.ts` prüft die Kompatibilität zur Build-Zeit.
 */

/** Wochentag; Reihenfolge Mo … So wie im Wochenraster der App. */
export type Weekday = "Mo" | "Di" | "Mi" | "Do" | "Fr" | "Sa" | "So";

/** Kalendertag als "YYYY-MM-DD" (ohne Uhrzeit, ohne Zeitzone). */
export type Ymd = string;

/** Rennstrecken im MVP (§0). */
export type Distance = "5k" | "10k" | "hm" | "m";

/** Lauftage pro Woche (§0, §2). */
export type RunDays = 3 | 4 | 5 | 6;

/** Letzter Wettkampf oder geschätzte 5-km-/10-km-Zeit (§2, §3). */
export type RecentRace = {
  distanceKm: number;
  timeSeconds: number;
  /** Datum des Rennens; `null` bei einer Schätzung. */
  dateYmd: Ymd | null;
  /** `true` = geschätzte Zeit, kein Wettkampf. */
  estimated: boolean;
};

/** Eingaben des Kerns (§2). Feldnamen wie in der Spec. */
export type CoreInputs = {
  distance: Distance;
  raceDate: Ymd;
  /** Planstart; Onboarding: `planStartChoice`. */
  startYmd: Ymd;
  runDaysPerWeek: RunDays;
  /** Teilmenge von Mo–So, mindestens `runDaysPerWeek` Tage. */
  availableDays: Weekday[];
  longRunDay?: Weekday;
  /** Ø der letzten 4 Wochen in km. */
  currentWeeklyKm: number;
  longestRecentRunKm?: number;
  recentRace?: RecentRace;
  /** Zielzeit in Sekunden. */
  goalTime?: number;
  /** MVP: nur gespeichert, der Kern liest sie nicht (§10). */
  freeText?: string;
};

/**
 * Regeln aus dem Freitext (§10). Sie dürfen Sicherheitsgrenzen nur verschärfen, nie lockern;
 * die Prüfung (`validatePlanRules`) kommt mit dem späteren Schritt "Claude → PlanRules".
 */
export type PlanRules = {
  /** Zusätzlich zu `availableDays`. */
  unavailableDays?: Weekday[];
  longRunDay?: Weekday;
  /** 20–300 Minuten je Wochentag. */
  maxMinutesByDay?: Partial<Record<Weekday, number>>;
  preferQualityDays?: Weekday[];
  avoidTypes?: Array<"I" | "R" | "T" | "M">;
  /** Wirkt nur, wenn ≤ berechneter Peak. */
  maxWeeklyKm?: number;
  /** Ungeparster Rest, nur für Coach-Texte. */
  notes?: string;
};

/** Im MVP läuft die Planerzeugung ohne Freitext-Regeln (docs/plan-core-plan.md, Entscheidung 9). */
export const EMPTY_RULES: Readonly<PlanRules> = Object.freeze({});

/** Interne Einheiten-Art (§7). `REST` = Ruhetag. */
export type CoreKind = "REC" | "E" | "MLR" | "LR" | "LR+M" | "M" | "T" | "I" | "R" | "RACE" | "REST";

/** App-Typen, auf die die Kern-Arten im MVP abgebildet werden (src/lib/ai/mapSessionType.ts). */
export type CoreSessionType = "rest" | "easy" | "interval" | "tempo" | "long" | "race";

export type CoreSport = "run" | "rest";

export type CoreIntensity = "low" | "medium" | "high";

/** App-Phasen. "Spezifisch" aus der Spec heißt in der App "peak" (Anzeige: "Spitze"). */
export type CorePhase = "base" | "build" | "peak" | "taper";

export type CoreWorkout = {
  id: string;
  /** ISO-Zeitstempel, Mittag UTC des Plantags. */
  dateIso: string;
  sport: CoreSport;
  sessionType: CoreSessionType;
  kind: CoreKind;
  intensity: CoreIntensity;
  title: string;
  km: number;
  desc: string | null;
  pace: string | null;
  structured: unknown | null;
};

export type CoreWeekMeta = {
  wn: number;
  phase: CorePhase;
  label: string;
  dates: string;
  focus: string;
  isRecoveryWeek?: boolean;
};

export type CoreWeek = {
  /** Montag der Woche ("YYYY-MM-DD"). */
  startIso: Ymd;
  totalKm: number;
  workouts: CoreWorkout[];
  meta: CoreWeekMeta;
};

/** Hinweis, wenn die Spitze nicht erreicht wird (gleiche Form wie `PlanVolumeNoteV2`). */
export type CoreVolumeNote = {
  code: "peak-not-reached";
  reason: "growth" | "run-days";
  targetPeakKm: number;
  reachedPeakKm: number;
};

export type CorePlanMeta = {
  volumeNote?: CoreVolumeNote;
  /** Wie der Plan entstanden ist; Grundlage für Nachvollziehbarkeit nach Config-Änderungen. */
  core?: {
    configVersion: string;
    inputs: CoreInputs;
    rules: PlanRules;
  };
};

export type CorePlan = {
  version: 2;
  workouts: CoreWorkout[];
  weeks: CoreWeek[];
  meta?: CorePlanMeta;
};
