/**
 * Pace/HR Vergleich: gleiche Korridor-Logik für Post-Workout-UI und konsistent s/km bzw. bpm.
 * Pace: niedrigere Sekunden/km = schnelleres Tempo (größerer min/km).
 */

export type ComparePaceStatus = "in_range" | "faster" | "slower" | "unknown";

export type CompareHrStatus = "in_range" | "above" | "below" | "unknown";

export type ComparePaceResult = {
  status: ComparePaceStatus;
  deltaSeconds: number;
  label: string;
};

export type CompareHrResult = {
  status: CompareHrStatus;
  deltaBpm: number;
  label: string;
};

/** Geplantes Tempo als Korridor seconds/km vs. Ist-Pace Sekunden/km */
export function comparePace(
  actualSecPerKm: number | null | undefined,
  plannedMinSecPerKm: number | null | undefined,
  plannedMaxSecPerKm: number | null | undefined,
): ComparePaceResult {
  const aRaw = typeof actualSecPerKm === "number" && Number.isFinite(actualSecPerKm) ? actualSecPerKm : null;
  const minRaw =
    typeof plannedMinSecPerKm === "number" && Number.isFinite(plannedMinSecPerKm) ? plannedMinSecPerKm : null;
  const maxRaw =
    typeof plannedMaxSecPerKm === "number" && Number.isFinite(plannedMaxSecPerKm) ? plannedMaxSecPerKm : null;

  if (aRaw == null || minRaw == null || maxRaw == null || aRaw <= 0 || minRaw <= 0 || maxRaw <= 0) {
    return { status: "unknown", deltaSeconds: 0, label: "Keine Daten" };
  }

  const lo = Math.min(minRaw, maxRaw);
  const hi = Math.max(minRaw, maxRaw);
  const a = aRaw;

  if (a >= lo && a <= hi) {
    return { status: "in_range", deltaSeconds: 0, label: "Tempo im Plan ✓" };
  }

  // Schneller als geplant ⇒ weniger Sek./km
  if (a < lo) {
    const deltaSeconds = Math.max(1, Math.round(lo - a));
    return {
      status: "faster",
      deltaSeconds,
      label: `${deltaSeconds} s/km schneller als geplant`,
    };
  }

  const deltaSeconds = Math.max(1, Math.round(a - hi));
  return {
    status: "slower",
    deltaSeconds,
    label: `${deltaSeconds} s/km langsamer als geplant`,
  };
}

function schlagPlural(n: number): string {
  return n === 1 ? "Schlag" : "Schläge";
}

/** Geplanter Korridor BPM vs. Ist-Puls */
export function compareHR(
  actualBpm: number | null | undefined,
  plannedMinBpm: number | null | undefined,
  plannedMaxBpm: number | null | undefined,
): CompareHrResult {
  const a = typeof actualBpm === "number" && Number.isFinite(actualBpm) && actualBpm > 0 ? actualBpm : null;
  const minRaw = typeof plannedMinBpm === "number" && Number.isFinite(plannedMinBpm) ? plannedMinBpm : null;
  const maxRaw = typeof plannedMaxBpm === "number" && Number.isFinite(plannedMaxBpm) ? plannedMaxBpm : null;

  if (a == null || minRaw == null || maxRaw == null || minRaw <= 0 || maxRaw <= 0) {
    return { status: "unknown", deltaBpm: 0, label: "Keine Daten" };
  }

  const lo = Math.min(minRaw, maxRaw);
  const hi = Math.max(minRaw, maxRaw);

  if (a >= lo && a <= hi) {
    return { status: "in_range", deltaBpm: 0, label: "Puls im Plan ✓" };
  }

  if (a > hi) {
    const deltaBpm = Math.round(a - hi);
    return {
      status: "above",
      deltaBpm,
      label: `+${deltaBpm} ${schlagPlural(deltaBpm)} über Plan`,
    };
  }

  const deltaBpm = Math.round(lo - a);
  return {
    status: "below",
    deltaBpm,
    label: `-${deltaBpm} ${schlagPlural(deltaBpm)} unter Plan`,
  };
}
