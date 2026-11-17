import React from "react";
import poweredByStravaLogo from "../../strava/assets/api_logo_pwrdBy_strava_horiz_white.svg";
import { isStravaRunId } from "../../strava/stravaRunSource";

/**
 * Kennzeichnung eines Laufs aus dem Strava-Import in Listen, die sonst Apple-Health-Läufe zeigen
 * (Brand Guidelines: „Powered by Strava“ dort, wo Strava-Daten erscheinen). Für alle anderen Läufe nichts.
 */
export function StravaRunAttribution({ runId }: { runId: string | null | undefined }) {
  if (!isStravaRunId(runId)) return null;
  return (
    <div
      data-testid="strava-run-attribution"
      style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", minWidth: 0 }}
    >
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Quelle: Strava</span>
      <img src={poweredByStravaLogo} alt="Powered by Strava" style={{ height: 11, width: "auto" }} />
    </div>
  );
}
