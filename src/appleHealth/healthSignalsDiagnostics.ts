/**
 * Geräte-Befund für die Uhr-Signale (Readiness-Plan Baustein B, docs/readiness-data-sources.md §5):
 * zählt für die letzten 7 Tage, was HealthKit tatsächlich liefert (Anzahl, Nächte, Beispielwerte, Quelle) und
 * liest die Anstrengung je Workout. Nur Diagnose – nichts davon wird gespeichert oder im normalen Betrieb gezeigt.
 */
import { getAppNow } from "../core/time/timeSystem";
import {
  HEALTH_SIGNAL_TYPES,
  HEALTH_SIGNAL_UNITS,
  MyRaceHealthSignals,
  type HealthSignalSample,
  type HealthSignalType,
  type HealthSignalsAvailability,
  type WorkoutEffortResult,
} from "./healthSignalsPlugin";

export const DIAGNOSTICS_DAYS = 7;

export type SignalSummary = {
  /** Anzeigename, z. B. „RMSSD“ oder „SDNN (bestehendes Plugin)“. */
  label: string;
  unit: string;
  count: number;
  /** Kalendertage (lokal) mit mindestens einem Wert → Anzahl Werte. */
  perDay: Record<string, number>;
  examples: Array<{ value: number; startDate: string; sourceName: string; deviceModel?: string }>;
  error?: string;
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
  samples: ReadonlyArray<Pick<HealthSignalSample, "value" | "startDate" | "sourceName" | "deviceModel">>,
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
    examples: samples.slice(0, 3).map((s) => ({
      value: s.value,
      startDate: s.startDate,
      sourceName: s.sourceName,
      ...(s.deviceModel ? { deviceModel: s.deviceModel } : {}),
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

  let availability: HealthSignalsAvailability | null = null;
  try {
    availability = await MyRaceHealthSignals.availability();
  } catch {
    availability = null;
  }

  const signals: SignalSummary[] = [];

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
      summarizeSamples("HRV SDNN (bestehendes Plugin)", "ms", (res.samples || []).map((s) => ({
        value: s.value,
        startDate: s.startDate,
        sourceName: s.sourceName ?? "?",
      }))),
    );
  } catch (e) {
    signals.push({ ...summarizeSamples("HRV SDNN (bestehendes Plugin)", "ms", []), error: errMsg(e) });
  }

  for (const type of HEALTH_SIGNAL_TYPES) {
    try {
      const res = await MyRaceHealthSignals.readQuantitySamples({
        type,
        startDate: startIso,
        endDate: endIso,
        limit: 5000,
        ascending: false,
      });
      signals.push(summarizeSamples(NATIVE_LABELS[type], HEALTH_SIGNAL_UNITS[type], res.samples ?? []));
    } catch (e) {
      signals.push({ ...summarizeSamples(NATIVE_LABELS[type], HEALTH_SIGNAL_UNITS[type], []), error: errMsg(e) });
    }
  }

  const workouts: WorkoutEffortRow[] = [];
  try {
    const { Health } = await import("@capgo/capacitor-health");
    const res = await Health.queryWorkouts({ startDate: startIso, endDate: endIso, limit: 50, ascending: false });
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

  return { generatedAt: now.toISOString(), availability, authorization, signals, workouts };
}

function nightsLine(perDay: Record<string, number>): string {
  const days = Object.keys(perDay).sort();
  if (days.length === 0) return "keine";
  return days.map((d) => `${d.slice(5)}:${perDay[d]}`).join(" ");
}

/** Text zum Kopieren und Einfügen (Gerätebefund). */
export function formatHealthSignalsReport(d: HealthSignalsDiagnostics): string {
  const lines: string[] = [];
  lines.push(`Uhr-Signale – Befund ${d.generatedAt} (letzte ${DIAGNOSTICS_DAYS} Tage)`);
  lines.push(`iOS ${d.availability?.systemVersion ?? "?"}, HealthKit ${d.availability?.healthDataAvailable ? "ja" : "nein"}`);
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
  lines.push("");
  for (const s of d.signals) {
    lines.push(`${s.label} [${s.unit}]: ${s.count} Werte${s.error ? ` – FEHLER ${s.error}` : ""}`);
    lines.push(`  je Tag: ${nightsLine(s.perDay)}`);
    for (const e of s.examples) {
      lines.push(`  ${e.startDate}  ${Math.round(e.value * 1000) / 1000}  ${e.sourceName}${e.deviceModel ? ` / ${e.deviceModel}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`Trainings (${d.workouts.length}) mit Anstrengung:`);
  for (const w of d.workouts) {
    const e = w.effort;
    const effort = e
      ? `selbst=${e.userScore ?? "–"}${e.method?.user ? `(${e.method.user})` : ""} geschätzt=${e.estimatedScore ?? "–"}${e.method?.estimated ? `(${e.method.estimated})` : ""}`
      : "kein Wert";
    lines.push(`  ${w.startDate}  ${w.type}  ${w.durationMin} min  ${effort}${w.error ? `  FEHLER ${w.error}` : ""}`);
  }
  return lines.join("\n");
}
