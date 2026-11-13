/**
 * Geräte-Befund für die Uhr-Signale (Readiness-Plan Baustein B, docs/readiness-data-sources.md §5):
 * zählt für die letzten 7 Tage, was HealthKit tatsächlich liefert (Anzahl, Nächte, Beispielwerte, Quelle) und
 * liest die Anstrengung je Workout. Nur Diagnose – nichts davon wird gespeichert oder im normalen Betrieb gezeigt.
 */
import { getAppNow } from "../core/time/timeSystem";
import { isHealthDataProcessingAllowed } from "../health/healthConsentStore";
import {
  HEALTH_SIGNAL_TYPES,
  HEALTH_SIGNAL_UNITS,
  MyRaceHealthSignals,
  type HealthSignalSample,
  type HealthSignalType,
  type HealthSignalsAvailability,
  type NativeWorkout,
  type TypeAuthorizationStatus,
  type WorkoutEffortResult,
  AUTHORIZATION_STATUS_TYPES,
} from "./healthSignalsPlugin";

export const DIAGNOSTICS_DAYS = 7;
/** Trainings und Anstrengung: längeres Fenster, damit ein Training aus der Vorwoche (z. B. mit VO2max) dabei ist. */
export const DIAGNOSTICS_WORKOUT_DAYS = 14;

export type SignalSummary = {
  /** Anzeigename, z. B. „RMSSD“ oder „SDNN (bestehendes Plugin)“. */
  label: string;
  unit: string;
  count: number;
  /** Kalendertage (lokal) mit mindestens einem Wert → Anzahl Werte. */
  perDay: Record<string, number>;
  examples: Array<{ value: number; startDate: string; sourceName: string; deviceModel?: string; hardwareVersion?: string }>;
  error?: string;
  /** Schlüssel in `typeStatus` (HealthKit-Name), um „0 Werte“ von „nie angefragt“ zu trennen. */
  statusKey?: string;
};

export type WorkoutEffortRow = {
  type: string;
  startDate: string;
  durationMin: number;
  effort: WorkoutEffortResult | null;
  error?: string;
};

export type HealthSignalsDiagnostics = {
  generatedAt: string;
  availability: HealthSignalsAvailability | null;
  authorization: { granted: boolean; requested: string[]; reason?: string } | { error: string };
  signals: SignalSummary[];
  workouts: WorkoutEffortRow[];
  /** Ohne Gesundheits-Zustimmung v2 wird nichts gelesen. */
  consentMissing?: boolean;
  /** Anfrage-/Schreibstatus je HealthKit-Typ (`authorizationStatus`), `null` wenn nicht abrufbar. */
  typeStatus?: Record<string, TypeAuthorizationStatus> | null;
  /** Workouts direkt aus HealthKit (Gegenprobe zum bestehenden Plugin). */
  nativeWorkouts?: NativeWorkout[] | { error: string };
  /** Alle gesehenen Geräte (Modell, Hardware-Version, Name). */
  devices?: string[];
};

function localYmd(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fasst Roh-Samples zu Anzahl, Werten je Tag und drei Beispielen zusammen (rein, testbar). */
export function summarizeSamples(
  label: string,
  unit: string,
  samples: ReadonlyArray<Pick<HealthSignalSample, "value" | "startDate" | "sourceName" | "deviceModel" | "hardwareVersion">>,
  statusKey?: string,
): SignalSummary {
  const perDay: Record<string, number> = {};
  for (const s of samples) {
    const ymd = localYmd(s.startDate);
    perDay[ymd] = (perDay[ymd] ?? 0) + 1;
  }
  return {
    label,
    unit,
    count: samples.length,
    perDay,
    ...(statusKey ? { statusKey } : {}),
    examples: samples.slice(0, 3).map((s) => ({
      value: s.value,
      startDate: s.startDate,
      sourceName: s.sourceName,
      ...(s.deviceModel ? { deviceModel: s.deviceModel } : {}),
      ...(s.hardwareVersion ? { hardwareVersion: s.hardwareVersion } : {}),
    })),
  };
}

const NATIVE_LABELS: Record<HealthSignalType, string> = {
  heartRateVariabilityRMSSD: "HRV RMSSD",
  workoutEffortScore: "Effort (selbst bewertet, alle Trainings)",
  estimatedWorkoutEffortScore: "Effort (geschätzt, alle Trainings)",
  appleSleepingWristTemperature: "Handgelenktemperatur Schlaf",
  heartRateRecoveryOneMinute: "Pulserholung 1 min",
  vo2Max: "VO2max",
};

/** „Watch · Watch6,18 · Apple Watch von …“ – einmal je Gerät. */
export function describeDevice(d: { deviceModel?: string; hardwareVersion?: string; deviceName?: string }): string | null {
  const parts = [d.deviceModel, d.hardwareVersion, d.deviceName].filter((p): p is string => !!p);
  return parts.length ? parts.join(" · ") : null;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function collectHealthSignalsDiagnostics(): Promise<HealthSignalsDiagnostics> {
  const now = getAppNow();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DIAGNOSTICS_DAYS - 1), 0, 0, 0, 0);
  const startIso = start.toISOString();
  const endIso = new Date(now.getTime() + 2000).toISOString();

  let authorization: HealthSignalsDiagnostics["authorization"];
  try {
    authorization = await MyRaceHealthSignals.requestAuthorization();
  } catch (e) {
    authorization = { error: errMsg(e) };
  }

  const workoutStartIso = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (DIAGNOSTICS_WORKOUT_DAYS - 1),
    0,
    0,
    0,
    0,
  ).toISOString();

  let typeStatus: Record<string, TypeAuthorizationStatus> | null = null;
  try {
    typeStatus = (await MyRaceHealthSignals.authorizationStatus({ types: AUTHORIZATION_STATUS_TYPES })).types ?? null;
  } catch {
    typeStatus = null;
  }

  let availability: HealthSignalsAvailability | null = null;
  try {
    availability = await MyRaceHealthSignals.availability();
  } catch {
    availability = null;
  }

  const signals: SignalSummary[] = [];
  const workouts: WorkoutEffortRow[] = [];

  // Ohne Gesundheits-Zustimmung v2 liest auch die Diagnose nichts (Fassade und Recovery-Abruf sind ohnehin gesperrt).
  if (!isHealthDataProcessingAllowed()) {
    return { generatedAt: now.toISOString(), availability, authorization, signals, workouts, consentMissing: true, typeStatus };
  }

  // SDNN über das bestehende Plugin (zum Vergleich mit RMSSD).
  try {
    const { Health } = await import("@capgo/capacitor-health");
    const res = await Health.readSamples({
      dataType: "heartRateVariability",
      startDate: startIso,
      endDate: endIso,
      limit: 5000,
      ascending: false,
    });
    signals.push(
      summarizeSamples(
        "HRV SDNN (bestehendes Plugin)",
        "ms",
        (res.samples || []).map((s) => ({ value: s.value, startDate: s.startDate, sourceName: s.sourceName ?? "?" })),
        "heartRateVariabilitySDNN",
      ),
    );
  } catch (e) {
    signals.push({ ...summarizeSamples("HRV SDNN (bestehendes Plugin)", "ms", [], "heartRateVariabilitySDNN"), error: errMsg(e) });
  }

  // Blutsauerstoff über das bestehende Plugin (angefragt mit dem Uhr-Signale-Flag; Nutzung entscheidet Schritt 4).
  try {
    const { Health } = await import("@capgo/capacitor-health");
    const res = await Health.readSamples({
      dataType: "oxygenSaturation",
      startDate: startIso,
      endDate: endIso,
      limit: 5000,
      ascending: false,
    });
    signals.push(
      summarizeSamples(
        "Blutsauerstoff SpO2 (bestehendes Plugin)",
        "%",
        (res.samples || []).map((s) => ({ value: s.value, startDate: s.startDate, sourceName: s.sourceName ?? "?" })),
        "oxygenSaturation",
      ),
    );
  } catch (e) {
    signals.push({ ...summarizeSamples("Blutsauerstoff SpO2 (bestehendes Plugin)", "%", [], "oxygenSaturation"), error: errMsg(e) });
  }

  const devices = new Set<string | null>();
  for (const type of HEALTH_SIGNAL_TYPES) {
    try {
      const res = await MyRaceHealthSignals.readQuantitySamples({
        type,
        startDate: startIso,
        endDate: endIso,
        limit: 5000,
        ascending: false,
      });
      const samples = res.samples ?? [];
      samples.forEach((x) => devices.add(describeDevice(x)));
      signals.push(summarizeSamples(NATIVE_LABELS[type], HEALTH_SIGNAL_UNITS[type], samples, type));
    } catch (e) {
      signals.push({ ...summarizeSamples(NATIVE_LABELS[type], HEALTH_SIGNAL_UNITS[type], [], type), error: errMsg(e) });
    }
  }

  try {
    const { Health } = await import("@capgo/capacitor-health");
    const res = await Health.queryWorkouts({ startDate: workoutStartIso, endDate: endIso, limit: 50, ascending: false });
    for (const w of res.workouts ?? []) {
      const startDate = w.startDate;
      const durationSec = Number(w.duration) || 0;
      const endDate = w.endDate || new Date(new Date(startDate).getTime() + durationSec * 1000).toISOString();
      const row: WorkoutEffortRow = {
        type: String((w as { workoutActivityType?: string }).workoutActivityType ?? w.workoutType ?? "?"),
        startDate,
        durationMin: Math.round(durationSec / 60),
        effort: null,
      };
      try {
        row.effort = await MyRaceHealthSignals.readWorkoutEffort({ workoutStart: startDate, workoutEnd: endDate });
      } catch (e) {
        row.error = errMsg(e);
      }
      workouts.push(row);
    }
  } catch (e) {
    workouts.push({ type: "(Workout-Abfrage fehlgeschlagen)", startDate: startIso, durationMin: 0, effort: null, error: errMsg(e) });
  }

  let nativeWorkouts: NativeWorkout[] | { error: string };
  try {
    nativeWorkouts = (await MyRaceHealthSignals.readWorkouts({ startDate: workoutStartIso, endDate: endIso, limit: 50 })).workouts ?? [];
    nativeWorkouts.forEach((w) => devices.add(describeDevice(w)));
  } catch (e) {
    nativeWorkouts = { error: errMsg(e) };
  }

  return {
    generatedAt: now.toISOString(),
    availability,
    authorization,
    signals,
    workouts,
    typeStatus,
    nativeWorkouts,
    devices: Array.from(devices).filter((d): d is string => !!d),
  };
}

function nightsLine(perDay: Record<string, number>): string {
  const days = Object.keys(perDay).sort();
  if (days.length === 0) return "keine";
  return days.map((d) => `${d.slice(5)}:${perDay[d]}`).join(" ");
}

/** Text zum Kopieren und Einfügen (Gerätebefund). */
const REQUEST_LABEL: Record<string, string> = {
  shouldRequest: "NIE ANGEFRAGT",
  unnecessary: "angefragt",
  unknown: "unbekannt",
  error: "Fehler",
};

/** „angefragt“ / „NIE ANGEFRAGT“ zu einem Typ, sonst leer. */
function requestText(d: HealthSignalsDiagnostics, key: string | undefined): string {
  if (!key || !d.typeStatus) return "";
  const st = d.typeStatus[key];
  if (!st) return "";
  if (!st.available) return " {auf diesem OS nicht vorhanden}";
  return ` {${REQUEST_LABEL[st.request ?? "unknown"] ?? st.request}}`;
}

/** Text zum Kopieren und Einfügen (Gerätebefund). */
export function formatHealthSignalsReport(d: HealthSignalsDiagnostics): string {
  const lines: string[] = [];
  lines.push(`Uhr-Signale – Befund ${d.generatedAt} (Werte: letzte ${DIAGNOSTICS_DAYS} Tage, Trainings: ${DIAGNOSTICS_WORKOUT_DAYS} Tage)`);
  lines.push(`iOS ${d.availability?.systemVersion ?? "?"}, HealthKit ${d.availability?.healthDataAvailable ? "ja" : "nein"}`);
  lines.push(`Geräte: ${d.devices && d.devices.length ? d.devices.join(" | ") : "keine gesehen"}`);
  if (d.availability) {
    lines.push(
      "Typen auf diesem OS: " +
        HEALTH_SIGNAL_TYPES.map((t) => `${t}=${d.availability?.types?.[t] ? "ja" : "nein"}`).join(", "),
    );
  }
  lines.push(
    "error" in d.authorization
      ? `Freigabe-Dialog: Fehler ${d.authorization.error}`
      : `Freigabe-Dialog: ${d.authorization.granted ? "durchgelaufen" : "nicht möglich"}${d.authorization.reason ? ` (${d.authorization.reason})` : ""}`,
  );
  if (d.consentMissing) {
    lines.push("Keine Gesundheits-Zustimmung: nichts gelesen. Erst unter Einstellungen → Datenschutz & Daten → Gesundheitsdaten zustimmen.");
  }
  lines.push("");
  lines.push("Freigabe je Typ (angefragt = Dialog gezeigt; ob erlaubt oder verweigert, verrät iOS beim Lesen nicht):");
  if (!d.typeStatus) {
    lines.push("  nicht abrufbar");
  } else {
    for (const key of Object.keys(d.typeStatus)) {
      const st = d.typeStatus[key];
      lines.push(
        `  ${key}: ${st.available ? `${REQUEST_LABEL[st.request ?? "unknown"] ?? st.request}, schreiben=${st.sharing ?? "?"}` : "auf diesem OS nicht vorhanden"}`,
      );
    }
  }
  lines.push("");
  for (const s of d.signals) {
    lines.push(`${s.label} [${s.unit}]: ${s.count} Werte${requestText(d, s.statusKey)}${s.error ? ` – FEHLER ${s.error}` : ""}`);
    lines.push(`  je Tag: ${nightsLine(s.perDay)}`);
    for (const e of s.examples) {
      const dev = [e.deviceModel, e.hardwareVersion].filter(Boolean).join(" ");
      lines.push(`  ${e.startDate}  ${Math.round(e.value * 1000) / 1000}  ${e.sourceName}${dev ? ` / ${dev}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`Trainings laut bestehendem Plugin (${d.workouts.length})${requestText(d, "workout")} mit Anstrengung:`);
  for (const w of d.workouts) {
    const e = w.effort;
    const effort = e
      ? `selbst=${e.userScore ?? "–"}${e.method?.user ? `(${e.method.user})` : ""} geschätzt=${e.estimatedScore ?? "–"}${e.method?.estimated ? `(${e.method.estimated})` : ""}`
      : "kein Wert";
    lines.push(`  ${w.startDate}  ${w.type}  ${w.durationMin} min  ${effort}${w.error ? `  FEHLER ${w.error}` : ""}`);
  }
  if (d.nativeWorkouts !== undefined) {
    if ("error" in d.nativeWorkouts) {
      lines.push(`Trainings direkt aus HealthKit: FEHLER ${d.nativeWorkouts.error}`);
    } else {
      lines.push(`Trainings direkt aus HealthKit (${d.nativeWorkouts.length}):`);
      for (const w of d.nativeWorkouts) {
        const dev = [w.deviceModel, w.hardwareVersion].filter(Boolean).join(" ");
        lines.push(
          `  ${w.startDate}  Typ ${w.activityType}  ${w.durationMin} min${w.distanceKm != null ? `  ${w.distanceKm} km` : ""}  ${w.sourceName}${dev ? ` / ${dev}` : ""}`,
        );
      }
    }
  }
  return lines.join("\n");
}
