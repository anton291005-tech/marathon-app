/**
 * Labels & Farben aus dem einheitlichen 0–100 Recovery-Score (SSOT).
 */

export type LegacySessionRecovery = {
  label: string;
  tone: string;
  detail: string;
};

/** Domain-Zustand: kein berechenbarer KPI (Extended aus oder keine Serie). */
export const INSUFFICIENT_DATA_SESSION_RECOVERY: LegacySessionRecovery = {
  label: "Keine Daten",
  tone: "#64748b",
  detail: "Extended Recovery ist aus oder es fehlt die Datenbasis — kein numerischer Recovery-Score.",
};

/**
 * Single SSOT buckets for 0–100 score (aligned with session labels).
 * 0 = niedrig … 3 = frisch — thresholds 40 / 60 / 80.
 */
export function recoveryScoreBandOrdinal(score: number): 0 | 1 | 2 | 3 {
  const s = Math.max(0, Math.min(100, score));
  if (s < 40) return 0;
  if (s < 60) return 1;
  if (s < 80) return 2;
  return 3;
}

/** Display row derived from unified 0–100 score (single SSOT for labels + colors). */
export function sessionRecoveryFromScore0To100(score: number): LegacySessionRecovery {
  const s = Math.round(Math.max(0, Math.min(100, score)));
  const o = recoveryScoreBandOrdinal(s);
  if (o === 0) {
    return {
      label: "🔴 Niedrig",
      tone: "#f87171",
      detail: "Reserve ist gering — konservativ steuern, Schlaf und Regeneration priorisieren.",
    };
  }
  if (o === 1) {
    return {
      label: "🟡 Moderat",
      tone: "#fbbf24",
      detail: "Solider, aber begrenzter Puffer — Belastung moderat halten und Signale beobachten.",
    };
  }
  if (o === 2) {
    return {
      label: "🟢 Gut",
      tone: "#38bdf8",
      detail: "Gute Ausgangslage — Qualität und Volumen wie geplant möglich, wenn es sich gut anfühlt.",
    };
  }
  return {
    label: "🟢 Frisch",
    tone: "#34d399",
    detail: "Hohe Reserve — gute Basis für anspruchsvolle Einheiten bei passenden anderen Signalen.",
  };
}
