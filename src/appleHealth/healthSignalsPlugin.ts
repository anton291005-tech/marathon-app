/**
 * TS-Seite des lokalen iOS-Plugins `MyRaceHealthSignals` (ios/App/App/MyRaceHealthSignalsPlugin.swift).
 * Liest Apple-Watch-Signale, die `@capgo/capacitor-health` nicht kennt. Nur Lesen; im Web/Simulator ohne Plugin
 * liefert alles ein leeres Ergebnis. Doku: docs/readiness-data-sources.md.
 */
import { registerPlugin } from "@capacitor/core";

/** Schlüssel = Name des HealthKit-Typs ohne Präfix (identisch zur Swift-Seite). */
export const HEALTH_SIGNAL_TYPES = [
  "heartRateVariabilityRMSSD",
  "workoutEffortScore",
  "estimatedWorkoutEffortScore",
  "appleSleepingWristTemperature",
  "heartRateRecoveryOneMinute",
  "vo2Max",
] as const;

export type HealthSignalType = (typeof HEALTH_SIGNAL_TYPES)[number];

/**
 * Was ankommt: Einheit je Typ. Der Temperaturwert ist, wie HealthKit ihn liefert, die absolute Schlaf-Handgelenk-
 * temperatur in °C (nicht die Abweichung von der Grundlinie) – ob das auf dem Gerät stimmt, hält der Gerätebefund fest.
 */
export const HEALTH_SIGNAL_UNITS: Record<HealthSignalType, string> = {
  heartRateVariabilityRMSSD: "ms",
  workoutEffortScore: "score",
  estimatedWorkoutEffortScore: "score",
  appleSleepingWristTemperature: "degC",
  heartRateRecoveryOneMinute: "bpm",
  vo2Max: "mL/(kg·min)",
};

export type HealthSignalSample = {
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  sourceName: string;
  /** z. B. „Watch“ / „iPhone“ – nur Diagnose. */
  deviceModel?: string;
};

export type RequestAuthorizationResult = {
  /** `true` = Dialog lief durch. HealthKit verrät nicht, ob Lesen verweigert wurde. */
  granted: boolean;
  requested: HealthSignalType[];
  reason?: string;
};

export type ReadQuantitySamplesOptions = {
  type: HealthSignalType;
  startDate: string;
  endDate: string;
  limit?: number;
  /** Standard `false` = neueste zuerst. */
  ascending?: boolean;
};

export type WorkoutEffortResult = {
  /** Selbst bewertet (1–10). */
  userScore?: number;
  /** Von der Uhr geschätzt (1–10). */
  estimatedScore?: number;
  /** Diagnose: „related“ (HealthKit-Zuordnung) oder „window“ (Zeitfenster-Rückfall). */
  method?: { user?: string; estimated?: string };
};

export type HealthSignalsAvailability = {
  healthDataAvailable: boolean;
  systemVersion: string;
  types: Record<HealthSignalType, boolean>;
};

export interface MyRaceHealthSignalsPlugin {
  requestAuthorization(): Promise<RequestAuthorizationResult>;
  readQuantitySamples(options: ReadQuantitySamplesOptions): Promise<{ samples: HealthSignalSample[] }>;
  readWorkoutEffort(options: { workoutStart: string; workoutEnd: string }): Promise<WorkoutEffortResult>;
  availability(): Promise<HealthSignalsAvailability>;
}

function allTypes(value: boolean): Record<HealthSignalType, boolean> {
  const out = {} as Record<HealthSignalType, boolean>;
  for (const t of HEALTH_SIGNAL_TYPES) out[t] = value;
  return out;
}

/** Web-Fallback: kein HealthKit → leer, nie ein Fehler. */
export const healthSignalsWebFallback: MyRaceHealthSignalsPlugin = {
  async requestAuthorization() {
    return { granted: false, requested: [], reason: "web" };
  },
  async readQuantitySamples() {
    return { samples: [] };
  },
  async readWorkoutEffort() {
    return {};
  },
  async availability() {
    return { healthDataAvailable: false, systemVersion: "web", types: allTypes(false) };
  },
};

let registered: MyRaceHealthSignalsPlugin | null = null;

/** Registrierung erst beim ersten Aufruf: Importe (und Tests mit teilweise gemocktem `@capacitor/core`) bleiben harmlos. */
function plugin(): MyRaceHealthSignalsPlugin {
  if (!registered) {
    registered = registerPlugin<MyRaceHealthSignalsPlugin>("MyRaceHealthSignals", {
      web: () => healthSignalsWebFallback,
    });
  }
  return registered;
}

export const MyRaceHealthSignals: MyRaceHealthSignalsPlugin = {
  requestAuthorization: () => plugin().requestAuthorization(),
  readQuantitySamples: (options) => plugin().readQuantitySamples(options),
  readWorkoutEffort: (options) => plugin().readWorkoutEffort(options),
  availability: () => plugin().availability(),
};
