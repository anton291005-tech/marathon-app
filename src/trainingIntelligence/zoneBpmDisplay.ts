/** Standard % HFmax zone → BPM display (fixed ranges, not user max-HR). */
export const ZONE_BPM: Record<string, string> = {
  "Zone 1": "100–120 bpm",
  "Zone 2": "120–140 bpm",
  "Zone 3": "140–160 bpm",
  "Zone 4": "160–180 bpm",
  "Zone 5": "180–200 bpm",
  "Zone 4–5": "160–200 bpm",
  "Zone 3–4": "140–180 bpm",
  "Zone 3–5": "140–200 bpm",
  "Zone 2–3": "120–160 bpm",
  "Zone 1–2": "100–140 bpm",
};

/** Planned HR for UI: BPM range, unmapped zone label, or em dash. */
export function formatPlannedHrZoneDisplay(zoneLabel: string | null | undefined): string {
  if (zoneLabel == null || zoneLabel === undefined) return "–";
  return ZONE_BPM[zoneLabel] ?? zoneLabel ?? "–";
}
