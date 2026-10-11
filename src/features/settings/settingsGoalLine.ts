/**
 * Zeile „aktives Ziel" der Profilkarte, z. B. „Marathon · noch 51 Tage · Ziel 2:50:00" (pure, UI only).
 */

function ymdToUtcDay(ymd: string | null | undefined): number | null {
  const m = typeof ymd === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) : null;
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** Kalendertage von `todayYmd` bis `raceYmd`; `null`, wenn eines der Daten fehlt oder ungültig ist. */
export function daysUntilRace(raceYmd: string | null | undefined, todayYmd: string | null | undefined): number | null {
  const race = ymdToUtcDay(raceYmd);
  const today = ymdToUtcDay(todayYmd);
  if (race == null || today == null) return null;
  return race - today;
}

export function formatRaceCountdown(days: number): string {
  if (days < 0) return "Rennen vorbei";
  if (days === 0) return "heute";
  if (days === 1) return "noch 1 Tag";
  return `noch ${days} Tage`;
}

/**
 * Ohne Renndatum gibt es kein aktives Ziel → `null` (die Karte zeigt dann ihren Leertext).
 * Fehlende Teile entfallen, es wird nie „0" oder ein Platzhalter eingesetzt.
 */
export function buildSettingsGoalLine(args: {
  raceYmd: string | null | undefined;
  todayYmd: string | null | undefined;
  distanceLabel?: string | null;
  raceGoal?: string | null;
  targetTime?: string | null;
}): string | null {
  const days = daysUntilRace(args.raceYmd, args.todayYmd);
  if (days == null) return null;
  const distance = typeof args.distanceLabel === "string" ? args.distanceLabel.trim() : "";
  const target = typeof args.targetTime === "string" ? args.targetTime.trim() : "";
  const goal = args.raceGoal === "finish" ? "Ziel: Finishen" : target ? `Ziel ${target}` : "";
  return [distance || "Rennen", formatRaceCountdown(days), goal].filter(Boolean).join(" · ");
}
