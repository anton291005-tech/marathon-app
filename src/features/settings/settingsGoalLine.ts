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

const MARATHON_KM = 42.195;
const HALF_MARATHON_KM = 21.0975;

function positiveKm(km: number | null | undefined): number | null {
  return typeof km === "number" && Number.isFinite(km) && km > 0 ? km : null;
}

/** „Marathon", „Halbmarathon" oder „10 km" / „7,5 km" — aus der Distanz des Rennens im Plan. */
export function formatRaceDistanceLabel(km: number | null | undefined): string | null {
  const value = positiveKm(km);
  if (value == null) return null;
  if (Math.abs(value - MARATHON_KM) < 0.1) return "Marathon";
  if (Math.abs(value - HALF_MARATHON_KM) < 0.1) return "Halbmarathon";
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace(".", ",")} km`;
}

type GoalPreferences = {
  raceDistanceKm?: number | null;
  raceDistanceLabel?: string | null;
  raceGoal?: string | null;
  targetTime?: string | null;
};

/**
 * Beschreiben die (globalen) Preferences den aktiven Plan? Nur dann dürfen Ziel und Zielzeit aus ihnen
 * in die Karte. `preferencesOwned` ist die Plan-Bindung der App (`planOwnedPreferences` /
 * `preferencesBelongToPlan`); zusätzlich darf ihre Distanz der des Rennens im Plan nicht widersprechen —
 * Preferences ohne Renndatum gelten sonst als „gehören dazu", auch wenn sie von einem anderen Plan stammen.
 */
export function preferencesDescribeActivePlan(args: {
  preferencesOwned: boolean;
  planRaceDistanceKm: number | null | undefined;
  preferencesDistanceKm: number | null | undefined;
}): boolean {
  if (!args.preferencesOwned) return false;
  const planKm = positiveKm(args.planRaceDistanceKm);
  const prefsKm = positiveKm(args.preferencesDistanceKm);
  if (planKm == null || prefsKm == null) return true;
  return Math.abs(planKm - prefsKm) < 0.5;
}

/**
 * Ziel-Zeile der Profilkarte aus dem AKTIVEN Plan: Renntag und Distanz kommen aus seiner Race-Session.
 * Ziel/Zielzeit stehen nur in den Preferences und erscheinen nur, wenn diese zum Plan gehören.
 * Ohne Renntag gibt es kein aktives Ziel → `null` (die Karte zeigt dann ihren Leertext).
 * Fehlende Teile entfallen, es wird nie „0" oder ein Platzhalter eingesetzt.
 *
 * Zielzeit vor Finish-Ziel: Die Zeile zeigt, was im Feld „Zielzeit" steht. „Ziel: Finishen" erscheint
 * nur, wenn das Finish-Ziel gewählt und keine Zielzeit eingetragen ist.
 */
export function buildSettingsGoalLine(args: {
  raceYmd: string | null | undefined;
  todayYmd: string | null | undefined;
  /** Plan-km der Race-Session des aktiven Plans. */
  planRaceDistanceKm: number | null | undefined;
  preferences: GoalPreferences | null | undefined;
  preferencesOwned: boolean;
}): string | null {
  const days = daysUntilRace(args.raceYmd, args.todayYmd);
  if (days == null) return null;
  const prefs = args.preferences ?? {};
  const prefsApply = preferencesDescribeActivePlan({
    preferencesOwned: args.preferencesOwned,
    planRaceDistanceKm: args.planRaceDistanceKm,
    preferencesDistanceKm: prefs.raceDistanceKm,
  });
  const prefsLabel = typeof prefs.raceDistanceLabel === "string" ? prefs.raceDistanceLabel.trim() : "";
  const distance = formatRaceDistanceLabel(args.planRaceDistanceKm) ?? (prefsApply && prefsLabel ? prefsLabel : "Rennen");
  const target = typeof prefs.targetTime === "string" ? prefs.targetTime.trim() : "";
  const goal = !prefsApply ? "" : target ? `Ziel ${target}` : prefs.raceGoal === "finish" ? "Ziel: Finishen" : "";
  return [distance, formatRaceCountdown(days), goal].filter(Boolean).join(" · ");
}
