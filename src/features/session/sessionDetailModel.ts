/**
 * Anzeige-Modell der Einheit-Detailansicht (UI only — keine Persistenz, keine Planlogik).
 * Grundsatz: Was Plan, Log oder Health nicht liefern, bleibt `null` und wird ausgeblendet.
 */
import {
  computeStructuredWorkoutDistance,
  resolveStructuredWorkoutSpecForSession,
  type SessionShapeForDistance,
} from "../../sessionDistance";
import { formatDayDateDe, formatKmDe } from "../../ui/formatDe";

/** Gefühl 1–5. Gleiche Zahlenwerte wie die früheren Sterne (1 = am schwersten, 5 = am leichtesten). */
const FEELING_LABELS = ["", "sehr schwer", "schwer", "mittel", "leicht", "sehr leicht"] as const;

export function normalizeFeeling(value: unknown): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export function feelingLabel(value: unknown): string | null {
  const n = normalizeFeeling(value);
  return n == null ? null : FEELING_LABELS[n];
}

export type SessionFlowRow = {
  key: "warmup" | "main" | "cooldown";
  name: string;
  /** Nur Angaben aus dem Rezept („6 × 1000 m"), sonst `null`. */
  sub: string | null;
  km: number;
};

export type SessionFlow = {
  rows: SessionFlowRow[];
  /** „2 + 7 + 1 km" */
  summary: string;
};

function positiveKm(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Aufteilung Einlaufen / Hauptteil / Auslaufen mit km — nur wenn der Plan sie nennt
 * (strukturierte Einheit oder Rezept in `desc`, z. B. „2 km WU · 6×1000m · 2 km CD").
 * Ohne mindestens zwei belegte Abschnitte gibt es keinen Ablauf.
 */
export function buildSessionFlow(session: SessionShapeForDistance): SessionFlow | null {
  const spec = resolveStructuredWorkoutSpecForSession(session);
  if (!spec) return null;
  const warmupKm = positiveKm(spec.warmupKm);
  const cooldownKm = positiveKm(spec.cooldownKm);
  const totalKm = computeStructuredWorkoutDistance(spec);
  const mainKm = positiveKm(Math.round((totalKm - (warmupKm ?? 0) - (cooldownKm ?? 0)) * 10) / 10);

  const reps = (spec.intervals ?? [])
    .filter((iv) => iv.reps > 0 && iv.distanceKm > 0)
    .map((iv) => `${iv.reps} × ${iv.distanceKm < 1 ? `${Math.round(iv.distanceKm * 1000)} m` : `${formatKmDe(iv.distanceKm, { trimZero: true })} km`}`);

  const rows: SessionFlowRow[] = [];
  if (warmupKm != null) rows.push({ key: "warmup", name: "Einlaufen", sub: null, km: warmupKm });
  if (mainKm != null) rows.push({ key: "main", name: "Hauptteil", sub: reps.length > 0 ? reps.join(" + ") : null, km: mainKm });
  if (cooldownKm != null) rows.push({ key: "cooldown", name: "Auslaufen", sub: null, km: cooldownKm });
  if (rows.length < 2) return null;

  return {
    rows,
    summary: `${rows.map((row) => formatKmDe(row.km, { trimZero: true })).join(" + ")} km`,
  };
}

const NO_DURATION_ESTIMATE_TYPES = new Set(["interval", "tempo", "race", "strength", "bike", "rest"]);

/**
 * „ca. 55 min" aus Distanz × geplantem Tempo. Nur für gleichmäßige Läufe: bei Intervall/Tempo gilt
 * das Plan-Tempo nur für den Hauptteil, eine Hochrechnung wäre falsch.
 */
export function estimateDurationMin(
  sessionType: string,
  distanceKm: number | null,
  paceMinPerKm: { min: number; max: number } | null,
): number | null {
  if (NO_DURATION_ESTIMATE_TYPES.has(sessionType)) return null;
  if (distanceKm == null || !(distanceKm > 0) || !paceMinPerKm) return null;
  const mid = (paceMinPerKm.min + paceMinPerKm.max) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return null;
  return Math.round(distanceKm * mid);
}

/** 3130 → „52:10", 4500 → „1:15:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Eingabe „10,4" / „10.4" → 10.4; leer oder ungültig → `null`. */
export function parseKmInput(text: string): number | null {
  const n = Number.parseFloat(String(text ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
}

export const KM_STEP = 0.5;

/** −/+ am Distanzfeld: halbe Kilometer, nie unter 0. */
export function stepKmInput(text: string, direction: 1 | -1): string {
  const current = parseKmInput(text) ?? 0;
  return formatKmDe(Math.max(0, Math.round((current + direction * KM_STEP) * 10) / 10));
}

/** Wert fürs Log: Punkt als Dezimaltrenner wie bisher (`"10.4"`); leer bleibt leer. */
export function kmInputToLogValue(text: string): string {
  const km = parseKmInput(text);
  return km == null ? "" : String(km);
}

export type HealthRunSuggestion = {
  /** „Heute 07:12 · 10,4 km · 52:10" */
  line: string;
  km: number | null;
};

/** Vorschlagszeile für einen erkannten, noch nicht zugeordneten Health-Lauf. */
export function buildHealthRunSuggestion(
  run: { startDate: string; duration: number; distanceMeters: number | null },
  today: Date,
): HealthRunSuggestion {
  const start = new Date(run.startDate);
  const parts: string[] = [];
  if (Number.isFinite(start.getTime())) {
    const sameDay =
      start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth() && start.getDate() === today.getDate();
    const time = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    parts.push(`${sameDay ? "Heute" : formatDayDateDe(start)} ${time}`);
  }
  const km = run.distanceMeters != null && run.distanceMeters > 0 ? Math.round(run.distanceMeters / 100) / 10 : null;
  if (km != null) parts.push(`${formatKmDe(km)} km`);
  if (run.duration > 0) parts.push(formatClock(run.duration));
  return { line: parts.join(" · "), km };
}
