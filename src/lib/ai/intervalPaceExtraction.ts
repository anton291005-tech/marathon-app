/**
 * Extrahiert Pace nur aus aktiven (schnellen) Laps für Intervall- und strukturierte Läufe.
 * Median-Pace trennt aktive Laps von Trabpausen / Warm-up / Cool-down.
 * Fallback: Gesamtpace wenn Laps fehlen oder kein klarer Split erkennbar ist.
 */

export type NormalizedLap = {
  distanceMeters: number;
  durationSeconds: number;
};

function normalizeLap(raw: unknown): NormalizedLap | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const dist = r.distanceMeters ?? r.distance_meters;
  const dur = r.durationSeconds ?? r.duration_seconds;
  if (typeof dist !== "number" || typeof dur !== "number") return null;
  if (dist < 50 || dur < 5) return null;
  return { distanceMeters: dist, durationSeconds: dur };
}

/** Aktiv wenn Pace schneller als Median × Ratio (Trabpausen typ. 2–3× langsamer). */
const ACTIVE_LAP_THRESHOLD_RATIO = 0.82;
const MIN_ACTIVE_LAPS = 1;
const MIN_TOTAL_ACTIVE_DISTANCE_M = 500;

export function extractActivePaceSecPerKm(
  rawLaps: unknown[] | null | undefined,
  fallback: number | null,
): number | null {
  if (!rawLaps || rawLaps.length < 2) return fallback;

  const laps = rawLaps.map(normalizeLap).filter((l): l is NormalizedLap => l !== null);
  if (laps.length < 2) return fallback;

  const withPace = laps.map((l) => ({
    ...l,
    paceSecPerKm: l.durationSeconds / (l.distanceMeters / 1000),
  }));

  const sorted = [...withPace].sort((a, b) => a.paceSecPerKm - b.paceSecPerKm);
  const medianPace = sorted[Math.floor(sorted.length / 2)].paceSecPerKm;

  const threshold = medianPace * ACTIVE_LAP_THRESHOLD_RATIO;
  const activeLaps = withPace.filter((l) => l.paceSecPerKm <= threshold);

  if (activeLaps.length < MIN_ACTIVE_LAPS) return fallback;

  const totalActiveDist = activeLaps.reduce((s, l) => s + l.distanceMeters, 0);
  const totalActiveTime = activeLaps.reduce((s, l) => s + l.durationSeconds, 0);

  if (totalActiveDist < MIN_TOTAL_ACTIVE_DISTANCE_M) return fallback;

  return totalActiveTime / (totalActiveDist / 1000);
}

/**
 * Strukturierte Dauerläufe (z. B. 2+12+2 km): nach Intervall-Extraktion langsamste 25 % der Laps wegschneiden.
 */
export function extractStructuredRunPaceSecPerKm(
  rawLaps: unknown[] | null | undefined,
  plannedActiveKm: number | null,
  totalKm: number | null,
  fallback: number | null,
): number | null {
  const intervalPace = extractActivePaceSecPerKm(rawLaps, null);
  if (intervalPace !== null) return intervalPace;

  if (!rawLaps || rawLaps.length < 3 || !plannedActiveKm || !totalKm) return fallback;

  const laps = rawLaps.map(normalizeLap).filter((l): l is NormalizedLap => l !== null);
  if (laps.length < 3) return fallback;

  const withPace = laps
    .map((l) => ({
      ...l,
      paceSecPerKm: l.durationSeconds / (l.distanceMeters / 1000),
    }))
    .sort((a, b) => a.paceSecPerKm - b.paceSecPerKm);

  const keepCount = Math.max(1, Math.floor(withPace.length * 0.75));
  const fastest = withPace.slice(0, keepCount);

  const totalDist = fastest.reduce((s, l) => s + l.distanceMeters, 0);
  const totalTime = fastest.reduce((s, l) => s + l.durationSeconds, 0);

  if (totalDist < 500) return fallback;
  return totalTime / (totalDist / 1000);
}

/** Zentrale Pace-Auflösung für Session-Typ + optional Laps (Conclusion Card, Race Prediction). */
export function resolveSessionPaceSecPerKm(args: {
  sessionType: string;
  durationSec: number | null | undefined;
  distanceKm: number | null | undefined;
  laps?: unknown[] | null;
  plannedActiveKm?: number | null;
}): number | null {
  if (args.sessionType === "bike") return null;

  const durationSec = args.durationSec;
  const distanceKm = args.distanceKm;
  if (
    durationSec == null ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    distanceKm == null ||
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0.01
  ) {
    return null;
  }
  const totalPace = durationSec / distanceKm;
  const laps = args.laps;
  const t = args.sessionType;

  if (t === "interval" || t === "tempo") {
    return extractActivePaceSecPerKm(laps, totalPace) ?? totalPace;
  }
  if ((t === "long" || t === "easy") && laps && laps.length >= 4) {
    return (
      extractStructuredRunPaceSecPerKm(laps, args.plannedActiveKm ?? null, distanceKm, totalPace) ??
      totalPace
    );
  }
  return totalPace;
}
