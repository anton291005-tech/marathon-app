/**
 * Ziel des AKTIVEN Plans: Renndistanz aus seiner Race-Session, Zielzeit / „Nur finishen" nur aus Preferences,
 * die zu ihm gehören. Ohne Zielwert gibt es keinen Ersatz (kein Marathon-Default) — `targetSeconds` ist dann null.
 */

import { parseTargetTimeToSeconds } from "./appSmartFeatures";
import { plausibleTargetTimeText } from "./goalTimePlausibility";
import { preferencesDescribeActivePlan } from "./features/settings/settingsGoalLine";
import { profileGoalFitsPlan } from "./planV2/planGoalBackfill";
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
  /** Eingetragene Zielzeit (Text) des aktiven Plans; "" = kein Ziel. Roh, für den Plan-Sync. */
  targetTime: string;
  /**
   * Gehört das Ziel nachweislich zu diesem Plan? Ja, wenn der Plan selbst ein `meta.goal` trägt, wenn es in dieser
   * Sitzung eingegeben wurde oder wenn `profileGoalFitsPlan` es zuordnet. Ohne `goalSource` (alte Aufrufer): ja.
   */
  goalTrusted: boolean;
  /** Darf das Ziel in `meta.goal` nachgetragen werden? Nur ohne `meta.goal` und nur nach `profileGoalFitsPlan`. */
  backfillAllowed: boolean;
  /**
   * Zielzeit zum Anzeigen und Rechnen (Prognosekarte, Leistung-Tab, Rennrechner): `targetTime`, wenn das Ziel zum
   * Plan gehört (`goalTrusted`) und zur Distanz passt (`isPlausibleTargetTime`), sonst "". Fängt die fremde
   * Profil-Zielzeit an einem Plan ohne `meta.goal` ab — auch die plausible (2:50:00 am Halbmarathon-Plan).
   */
  displayTargetTime: string;
  /**
   * Wert des Eingabefelds „Zielzeit“: während der Eingabe der Rohwert (Tippen wird nie unterbrochen), sonst
   * `displayTargetTime` — ein fremder oder unplausibler gespeicherter Wert wird nicht vorausgefüllt.
   */
  inputTargetTime: string;
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
  /**
   * Woher das Ziel stammt. Fehlt die Angabe, gilt das alte Verhalten (Ziel der Preferences zählt, sobald sie zum
   * Plan gehören).
   */
  goalSource?: {
    /** Trägt der aktive Plan ein eigenes `meta.goal`? */
    planHasGoal: boolean;
    /** Alle Pläne des Nutzers (aktiv + archiviert); null = noch nicht geladen. */
    planCount: number | null;
    /** Wurde die Zielzeit dieses Plans in dieser Sitzung eingegeben? */
    editedThisSession?: boolean;
  };
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
  const source = args.goalSource;
  const fitsPlan =
    preferencesApply &&
    profileGoalFitsPlan({
      targetTime: finishOnly ? null : targetTime,
      planRaceDistanceKm: planRaceKm,
      storedDistanceKm: prefs.raceDistanceKm,
      planCount: source?.planCount ?? null,
    });
  const edited = source?.editedThisSession === true;
  const goalTrusted = preferencesApply && (source == null || source.planHasGoal || edited || fitsPlan);
  const backfillAllowed = source == null ? preferencesApply : !source.planHasGoal && fitsPlan;
  const displayTargetTime = finishOnly || !goalTrusted ? "" : plausibleTargetTimeText(targetTime, raceDistanceKm);
  // Beim Tippen immer der Rohwert der Preferences — auch wenn sie (noch) keinem Plan zugeordnet sind (Plan-ID unbekannt).
  const inputTargetTime = edited ? (typeof prefs.targetTime === "string" ? prefs.targetTime : "") : displayTargetTime;
  const parsed = displayTargetTime ? parseTargetTimeToSeconds(displayTargetTime) : null;
  const targetSeconds = parsed && parsed > 0 ? parsed : null;
  return {
    raceYmd: race?.ymd ?? null,
    raceDistanceKm,
    preferencesApply,
    finishOnly,
    targetTime,
    goalTrusted,
    backfillAllowed,
    displayTargetTime,
    inputTargetTime,
    targetSeconds,
    targetTimeLabel: finishOnly && goalTrusted ? "Ziel: Finishen" : targetSeconds != null ? displayTargetTime : undefined,
  };
}
