/**
 * Darf ein Ziel, das NICHT aus `meta.goal` des Plans stammt (lokale Preferences bzw. die nutzerweite
 * Profil-Zielzeit `profiles.target_time_seconds`), diesem Plan zugeschrieben werden? — rein, ohne React/Supabase.
 *
 * Eine Plausibilitätsprüfung allein reicht nicht: 2:50:00 an einem Halbmarathon-Plan ist plausibel und trotzdem
 * die Marathon-Zielzeit eines anderen Plans. Deshalb zählt zuerst die Distanz, die mit dem Ziel gespeichert ist
 * (`preferences.raceDistanceKm`; das Supabase-Profil selbst speichert keine Distanz):
 * - Distanz gespeichert: nur, wenn sie zur Plan-Distanz passt (spätestes Rennen des Plans) UND die Zeit plausibel ist.
 * - keine Distanz gespeichert: nur, wenn der Nutzer genau einen Plan hat UND die Zeit plausibel ist.
 * - sonst nicht.
 *
 * Dieselbe Prüfung gilt für den Nachtrag in `meta.goal` (`usePlanGoalSync`), das Eingabefeld „Zielzeit“ und die
 * Anzeige (`resolveActivePlanGoal`).
 */

import { isPlausibleTargetTime } from "../goalTimePlausibility";

/** Toleranz beim Distanzvergleich, wie `preferencesDescribeActivePlan`. */
const DISTANCE_MATCH_TOLERANCE_KM = 0.5;

function positiveKm(km: number | null | undefined): number | null {
  return typeof km === "number" && Number.isFinite(km) && km > 0 ? km : null;
}

export type ProfileGoalFitInput = {
  /** Zielzeit-Text des Ziels; null/"" = Ziel ohne Zeit (z. B. „Nur finishen“). */
  targetTime: string | null | undefined;
  /** Distanz des spätesten Rennens im Plan; null = im Plan unbekannt. */
  planRaceDistanceKm: number | null | undefined;
  /** Distanz, die zusammen mit dem Ziel gespeichert ist; null = keine gespeichert. */
  storedDistanceKm: number | null | undefined;
  /**
   * Zahl aller Pläne des Nutzers (aktive und archivierte); null = noch nicht bekannt.
   * ENTSCHEIDUNG (Anton absegnen): archivierte Pläne zählen mit — die Profil-Zielzeit kann von einer
   * abgeschlossenen Vorbereitung stammen.
   */
  planCount: number | null | undefined;
};

export function profileGoalFitsPlan(input: ProfileGoalFitInput): boolean {
  const planKm = positiveKm(input.planRaceDistanceKm);
  const storedKm = positiveKm(input.storedDistanceKm);
  const plausible = isPlausibleTargetTime(input.targetTime, planKm);
  if (storedKm != null && planKm != null) {
    return Math.abs(storedKm - planKm) < DISTANCE_MATCH_TOLERANCE_KM && plausible;
  }
  // Distanz gespeichert, aber der Plan hat kein Rennen: sie kann nicht „passen“, die Zeit ist nicht prüfbar → nein.
  if (storedKm != null) return false;
  // Keine Distanz zum Ziel gespeichert: Zuordnung nur bei genau einem Plan.
  return input.planCount === 1 && plausible;
}

/**
 * Zahl aller Pläne nur, wenn sie sicher ist: die Zählung selbst ist gelungen (`countedTotal`, null = Fehler oder
 * noch nicht geladen) UND sie deckt sich mit den geladenen Listen. Die Listen-Abfragen liefern bei einem Fehler
 * `[]` — eine fehlgeschlagene Archiv-Abfrage sähe sonst wie „genau ein Plan“ aus. Sonst null (= nichts nachtragen).
 */
export function knownPlanCount(countedTotal: number | null | undefined, activeListLength: number, archivedListLength: number): number | null {
  if (typeof countedTotal !== "number" || !Number.isFinite(countedTotal) || countedTotal < 0) return null;
  return countedTotal === activeListLength + archivedListLength ? countedTotal : null;
}

/** Schlüssel für „Zielzeit in dieser Sitzung eingegeben“, solange die Plan-ID noch nicht bekannt ist (Start, offline). */
export const GOAL_EDIT_WITHOUT_PLAN_ID = "__no-plan-id__";

export function goalEditKey(activePlanId: string | null | undefined): string {
  return activePlanId ?? GOAL_EDIT_WITHOUT_PLAN_ID;
}

/**
 * Eingabe-Markierung an die erste bekannte Plan-ID binden: Wurde ohne Plan-ID getippt und ist die ID jetzt da,
 * gehört die Eingabe diesem Plan — und nur ihm (nach einem Planwechsel gilt sie nicht mehr).
 */
export function rebindGoalEditKey(editedKey: string | null, activePlanId: string | null | undefined): string | null {
  return editedKey === GOAL_EDIT_WITHOUT_PLAN_ID && activePlanId ? activePlanId : editedKey;
}

/** Wurde die Zielzeit des aktiven Plans in dieser Sitzung eingegeben? (Schlüssel vorher mit `rebindGoalEditKey` binden.) */
export function goalEditedThisSession(editedKey: string | null | undefined, activePlanId: string | null | undefined): boolean {
  if (editedKey == null) return false;
  return editedKey === goalEditKey(activePlanId);
}
