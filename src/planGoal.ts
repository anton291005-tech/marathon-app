/**
 * Ziel des AKTIVEN Plans: Renndistanz aus seiner Race-Session, Zielzeit / „Nur finishen" nur aus Preferences,
 * die zu ihm gehören. Ohne Zielwert gibt es keinen Ersatz (kein Marathon-Default) — `targetSeconds` ist dann null.
 */

import { parseTargetTimeToSeconds } from "./appSmartFeatures";
import { plausibleTargetTimeText } from "./goalTimePlausibility";
import { preferencesDescribeActivePlan } from "./features/settings/settingsGoalLine";
import { findGoalRaceSession, preferencesBelongToPlan } from "./prepRecap/prepCompletionState";
import { resolveRaceDistanceKm } from "./prepRecap/raceResultPresentation";
import { canonicalRaceDistanceKm } from "./raceDistance";
import type { PlanWeek } from "./marathonPrediction";

export type ActivePlanGoal = {
  raceYmd: string | null;
  /** Kanonische Distanz (5 / 10 / 21,0975 / 42,195 / sonstige); null = im Plan unbekannt. */
  raceDistanceKm: number | null;
  /** Gehören die Preferences (Ziel, Zielzeit) zum aktiven Plan? */
  preferencesApply: boolean;
  finishOnly: boolean;
  /** Eingetragene Zielzeit (Text) des aktiven Plans; "" = kein Ziel. Roh, für das Eingabefeld und den Plan-Sync. */
  targetTime: string;
  /**
   * Zielzeit zum Anzeigen und Rechnen (Prognosekarte, Leistung-Tab, Rennrechner): `targetTime`, wenn sie zur Distanz
   * passt (`isPlausibleTargetTime`), sonst "". Fängt die fremde Profil-Zielzeit an einem Plan ohne `meta.goal` ab.
   */
  displayTargetTime: string;
  /** Sekunden von `displayTargetTime`; null ohne (plausible) Zielzeit. */
  targetSeconds: number | null;
  /** Text für die Prognosekarte; undefined = keine Zielzeile. */
  targetTimeLabel: string | undefined;
};

type GoalPreferences = {
  raceGoal?: string | null;
  targetTime?: string | null;
  raceDistanceKm?: number | null;
  raceName?: string | null;
  raceDate?: string | null;
};

export function resolveActivePlanGoal(args: {
  plan: readonly PlanWeek[];
  planName: string | null;
  planId: string | null;
  preferences: GoalPreferences | null | undefined;
  /** Plan, dem die Preferences gehören (`planOwnedPreferences`); null = unbekannt. */
  ownerPlanId: string | null;
}): ActivePlanGoal {
  const prefs = args.preferences ?? {};
  const race = findGoalRaceSession(args.plan);
  const planRaceKm = race ? resolveRaceDistanceKm(race.session, null) : null;
  const preferencesOwned =
    args.ownerPlanId != null
      ? args.ownerPlanId === args.planId
      : preferencesBelongToPlan(prefs, { raceYmd: race?.ymd ?? null, planName: args.planName });
  const preferencesApply = preferencesDescribeActivePlan({
    preferencesOwned,
    planRaceDistanceKm: planRaceKm,
    preferencesDistanceKm: prefs.raceDistanceKm,
  });
  const finishOnly = preferencesApply && prefs.raceGoal === "finish";
  const targetTime = preferencesApply && typeof prefs.targetTime === "string" ? prefs.targetTime : "";
  const raceDistanceKm = canonicalRaceDistanceKm(planRaceKm ?? (preferencesApply ? prefs.raceDistanceKm : null));
  const displayTargetTime = finishOnly ? "" : plausibleTargetTimeText(targetTime, raceDistanceKm);
  const parsed = displayTargetTime ? parseTargetTimeToSeconds(displayTargetTime) : null;
  const targetSeconds = parsed && parsed > 0 ? parsed : null;
  return {
    raceYmd: race?.ymd ?? null,
    raceDistanceKm,
    preferencesApply,
    finishOnly,
    targetTime,
    displayTargetTime,
    targetSeconds,
    targetTimeLabel: finishOnly ? "Ziel: Finishen" : targetSeconds != null ? displayTargetTime : undefined,
  };
}
