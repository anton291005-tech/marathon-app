import type { CoachFeedback, IntervalMeta, Level2IntensityAnalysis, Level3TrendAnalysis } from "./types";

function formatPaceMMSS(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function intervalFeedback(meta: IntervalMeta): CoachFeedback {
  const { completedReps, targetReps, paceFadeDetected, extractionStrategy } = meta;

  // Low-confidence extraction: advise lap-based recording
  if (extractionStrategy === "none" || extractionStrategy === "gps_stream") {
    return {
      message:
        "Keine Lap-Struktur erkannt — Bewertung basiert auf Pace-Schätzung. Für genaue Auswertung Lap-Taste am Gerät nutzen.",
      action: "maintain",
    };
  }

  const hasTarget = targetReps != null && targetReps > 0;
  const missingReps = hasTarget ? targetReps! - completedReps : 0;

  // Compute per-rep pace delta vs. target (sec/km, positive = slower)
  const paceDelta =
    meta.targetPace != null
      ? Math.round(meta.avgIntervalPace - meta.targetPace)
      : null;
  const onPace = paceDelta == null || Math.abs(paceDelta) <= 20;
  const wellOnPace = paceDelta == null || Math.abs(paceDelta) <= 10;

  // Case 1: all reps, all within 10s, no fade
  if ((!hasTarget || missingReps === 0) && wellOnPace && !paceFadeDetected) {
    return {
      message: "Intervalle perfekt umgesetzt — Pace und Erholung stimmen.",
      action: "maintain",
    };
  }

  // Case 2: all reps, within 10s, but fade detected
  if ((!hasTarget || missingReps === 0) && wellOnPace && paceFadeDetected) {
    return {
      message:
        "Starke Intervalle, aber Pace-Abfall zum Ende — Erholungszeit zwischen den Reps prüfen.",
      action: "maintain",
    };
  }

  // Case 3: pace good (≤ 20s off), 1–2 reps missing
  if (onPace && hasTarget && missingReps >= 1 && missingReps <= 2) {
    return {
      message: `Pace gut getroffen, aber ${missingReps} Wiederholung${missingReps > 1 ? "en" : ""} weniger als geplant.`,
      action: "maintain",
    };
  }

  // Case 4: more than 2 reps missing, on-pace reps were decent
  if (onPace && hasTarget && missingReps > 2) {
    return {
      message: `Nur ${completedReps}/${targetReps} Wiederholungen — Belastung für diese Session zu hoch?`,
      action: "reduce_load",
    };
  }

  // Case 5: all reps completed, consistently > 20s off target pace
  if ((!hasTarget || missingReps === 0) && paceDelta != null && paceDelta > 20) {
    return {
      message: `Alle ${completedReps} Wiederholungen absolviert, Zielpace aber um ~${paceDelta}s/km verfehlt — Zielzeit realistisch? (${formatPaceMMSS(meta.avgIntervalPace)}/km statt ${formatPaceMMSS(meta.targetPace!)}/km)`,
      action: "maintain",
    };
  }

  // Fallback: general interval result
  const paceNote =
    meta.targetPace != null
      ? ` Durchschnittliche Interval-Pace: ${formatPaceMMSS(meta.avgIntervalPace)}/km.`
      : "";
  return {
    message: `${completedReps} Interval${completedReps !== 1 ? "le" : ""} absolviert.${paceNote}`,
    action: "maintain",
  };
}

export function buildCoachFeedback(
  l2: Level2IntensityAnalysis | null,
  l3: Level3TrendAnalysis | null,
): CoachFeedback | null {
  // ---- Interval-specific feedback (runs before all standard logic) --------
  if (l2?.model === "interval" && l2.intervalMeta) {
    return intervalFeedback(l2.intervalMeta);
  }

  // Trend-level signals (only when trend data is conclusive)
  if (l3 && l3.trend === "overreaching") {
    return { message: "Load trend indicates elevated strain; reduce intensity or volume.", action: "reduce_load" };
  }

  if (l3 && l3.trend === "undertraining") {
    return { message: "Load trend is low relative to recovery; increase structure if appropriate.", action: "increase_load" };
  }

  // When l3 is insufficient_data or absent, fall through to intensity-based messages so a single
  // workout never surfaces "Insufficient data" just because trend history is short.
  if (l2) {
    if (l2.classification === "too_easy") {
      return { message: "Below planned intensity; consider a small increase if recovery is stable.", action: "increase_intensity" };
    }
    if (l2.classification === "too_hard") {
      return { message: "Above planned intensity; keep effort in check on the next session.", action: "reduce_load" };
    }
    if (l2.classification === "overreaching") {
      return { message: "Significantly above planned intensity; prioritize recovery before the next workout.", action: "reduce_load" };
    }
    // on_target
    return { message: "On target; maintain the planned training structure.", action: "maintain" };
  }

  if (l3 && l3.trend === "balanced") {
    return { message: "On target; maintain the planned training structure.", action: "maintain" };
  }

  // Only reach here when both l2 and l3 yield no signal at all.
  return { message: "Insufficient data for reliable AI analysis.", action: "maintain" };
}
