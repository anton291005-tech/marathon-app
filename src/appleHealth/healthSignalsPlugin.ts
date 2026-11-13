/**
 * TS-Seite des lokalen iOS-Plugins `MyRaceHealthSignals` (ios/App/App/MyRaceHealthSignalsPlugin.swift).
 * Liest Apple-Watch-Signale, die `@capgo/capacitor-health` nicht kennt. Nur Lesen; im Web/Simulator ohne Plugin
 * liefert alles ein leeres Ergebnis. Doku: docs/readiness-data-sources.md.
 */
import { registerPlugin } from "@capacitor/core";
import { isHealthDataProcessingAllowed } from "../health/healthConsentStore";

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
  /** z. B. „Watch6,18“ (Ultra 1) – nur Diagnose. */
  hardwareVersion?: string;
  deviceName?: string;
  deviceManufacturer?: string;
};

/** Typnamen für `authorizationStatus`: eigene Signale plus die Typen des bestehenden Plugins (HealthKit-Namen). */
export const AUTHORIZATION_STATUS_TYPES = [
  "workout",
  "heartRate",
  "activeEnergyBurned",
  "distanceWalkingRunning",
  "distanceCycling",
  "sleepAnalysis",
  "heartRateVariabilitySDNN",
  "restingHeartRate",
  "respiratoryRate",
  "bodyTemperature",
  "basalBodyTemperature",
  "oxygenSaturation",
  ...HEALTH_SIGNAL_TYPES,
] as const;

/**
 * `request`: „shouldRequest“ = nie angefragt (Lesen scheitert mit „not determined“), „unnecessary“ = schon angefragt.
 * Ob ein Lesezugriff erlaubt oder verweigert wurde, verrät iOS absichtlich nicht – 0 Werte bei „unnecessary“ heißt
 * „verweigert oder keine Daten“. `sharing` ist der Schreibstatus (MyRace schreibt nie).
 */
export type TypeAuthorizationStatus = {
  available: boolean;
  request?: "shouldRequest" | "unnecessary" | "unknown" | "error";
  sharing?: "notDetermined" | "sharingDenied" | "sharingAuthorized" | "unknown";
};

export type NativeWorkout = {
  /** HKWorkoutActivityType.rawValue (37 = Laufen, 52 = Gehen, 13 = Radfahren, 24 = Wandern). */
  activityType: number;
  startDate: string;
  endDate: string;
  durationMin: number;
  sourceName: string;
  sourceBundleId?: string;
  distanceKm?: number;
  deviceModel?: string;
  hardwareVersion?: string;
  deviceName?: string;
  deviceManufacturer?: string;
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
  authorizationStatus(options: { types: readonly string[] }): Promise<{ types: Record<string, TypeAuthorizationStatus> }>;
  readWorkouts(options: { startDate: string; endDate: string; limit?: number }): Promise<{ workouts: NativeWorkout[] }>;
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
  async authorizationStatus() {
    return { types: {} };
  },
  async readWorkouts() {
    return { workouts: [] };
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

/**
 * Fassade für alle Aufrufer. Mit Uhr-Signale-Flag gilt ohne Gesundheits-Zustimmung v2: kein Apple-Dialog, kein
 * Lesen – dieselben leeren Ergebnisse wie im Web. `availability` sagt nur, welche Typen das OS kennt, und bleibt offen.
 */
export const MyRaceHealthSignals: MyRaceHealthSignalsPlugin = {
  requestAuthorization: () =>
    isHealthDataProcessingAllowed()
      ? plugin().requestAuthorization()
      : Promise.resolve({ granted: false, requested: [], reason: "health_consent_missing" }),
  readQuantitySamples: (options) =>
    isHealthDataProcessingAllowed() ? plugin().readQuantitySamples(options) : Promise.resolve({ samples: [] }),
  readWorkoutEffort: (options) => (isHealthDataProcessingAllowed() ? plugin().readWorkoutEffort(options) : Promise.resolve({})),
  availability: () => plugin().availability(),
  // Nur Metadaten (angefragt ja/nein) – auch ohne Zustimmung, damit die Diagnose den Stand zeigen kann.
  authorizationStatus: (options) => plugin().authorizationStatus(options),
  // Trainings liest MyRace auch ohne Gesundheits-Zustimmung (Datenschutzerklärung §6); hier nur für die Diagnose.
  readWorkouts: (options) => plugin().readWorkouts(options),
};
