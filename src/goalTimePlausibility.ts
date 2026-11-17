/**
 * Plausibilität einer Zielzeit zur Renndistanz — die eine Prüfung für jede Stelle, an der eine Zielzeit angezeigt oder
 * gerechnet wird (Profilkarte der Einstellungen, Prognosekarte und Leistung-Tab, Rennrechner, Coach-Kontext).
 *
 * Hintergrund: Pläne ohne `meta.goal` bekommen ihre Zielzeit aus der nutzerweiten Profil-Zielzeit
 * (`profiles.target_time_seconds`) — die kann von einem anderen Plan stammen (Marathon 2:50:00 an einem 10-km-Plan).
 * Geprüft wird nur eine eindeutige Uhrzeit `H:MM:SS` (so formatiert das Profil immer); zweiteilige Eingaben („3:30“)
 * und frei getippter Text haben keinen Maßstab und bleiben, wie sie sind.
 */

/** Pace-Band für eine plausible Zielzeit: 2:30–12:00 min/km. */
export const PLAUSIBLE_TARGET_PACE_SEC_PER_KM = { min: 150, max: 720 } as const;

/** „H:MM:SS“ → Sekunden; `null` für alles andere. */
function clockToSeconds(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return seconds > 0 ? seconds : null;
}

function positiveKm(km: number | null | undefined): number | null {
  return typeof km === "number" && Number.isFinite(km) && km > 0 ? km : null;
}

/** Passt die Zielzeit zur Distanz? Ohne Distanz oder ohne eindeutige Uhrzeit → `true` (kein Maßstab). */
export function isPlausibleTargetTime(targetTime: string | null | undefined, distanceKm: number | null | undefined): boolean {
  if (typeof targetTime !== "string") return true;
  const km = positiveKm(distanceKm);
  const seconds = clockToSeconds(targetTime);
  if (km == null || seconds == null) return true;
  const pace = seconds / km;
  return pace >= PLAUSIBLE_TARGET_PACE_SEC_PER_KM.min && pace <= PLAUSIBLE_TARGET_PACE_SEC_PER_KM.max;
}

/** Zielzeit-Text, wenn plausibel; sonst `""` (keine Zielzeit). */
export function plausibleTargetTimeText(targetTime: string | null | undefined, distanceKm: number | null | undefined): string {
  const text = typeof targetTime === "string" ? targetTime.trim() : "";
  return text && isPlausibleTargetTime(text, distanceKm) ? text : "";
}
