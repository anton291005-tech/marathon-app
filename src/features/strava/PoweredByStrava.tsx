import React from "react";
import poweredByStravaLogo from "../../strava/assets/api_logo_pwrdBy_strava_horiz_white.svg";

/**
 * Offizielles „Powered by Strava“-Logo (Brand Guidelines, unverändert, kleiner als der App-Name).
 * Überall dort, wo ein Wert aus dem Strava-Import erscheint.
 */
export function PoweredByStrava({ height = 12, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <img
      src={poweredByStravaLogo}
      alt="Powered by Strava"
      data-testid="powered-by-strava-logo"
      style={{ height, width: "auto", flex: "none", ...style }}
    />
  );
}
