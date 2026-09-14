import { deriveStravaConnected } from "./stravaConnectionService";

describe("deriveStravaConnected", () => {
  it("keine Row (nie verbunden) → false", () => {
    expect(deriveStravaConnected(null)).toBe(false);
  });

  it("Row mit gesetzter strava_athlete_id → true", () => {
    expect(deriveStravaConnected({ strava_athlete_id: 123456 })).toBe(true);
  });

  it("Row mit strava_athlete_id: null → false", () => {
    expect(deriveStravaConnected({ strava_athlete_id: null })).toBe(false);
  });
});
