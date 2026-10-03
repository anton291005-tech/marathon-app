/**
 * Plan-eigene Preferences: Rennen, Ziel und Umfang gehören zu EINEM Trainingsplan, liegen aber im
 * globalen `marathonPreferences`-Objekt (und `targetTime` im Profil). Ohne Zuordnung zeigte Plan A
 * nach „Wizard → Plan B → zurück zu A" Ziel und Distanz von B.
 *
 * Deshalb: beim Verlassen eines Plans werden seine Felder unter der Plan-ID gemerkt, beim Wechsel
 * die des Zielplans zurückgeschrieben. Alles andere (PR, HFmax, …) ist nutzerweit und bleibt stehen.
 */

import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";
import { PLAN_OWNED_PREFERENCES_KEY } from "../persistence/marathonLocalStorageKeys";

export const PLAN_OWNED_PREFERENCE_KEYS = [
  "raceDistanceLabel",
  "raceDistanceKm",
  "raceGoal",
  "raceTargetTime",
  "raceName",
  "raceDate",
  "planStartDate",
  "weeklyKmRange",
  "userPreferences",
  "targetTime",
] as const;

export type PlanOwnedPreferences = Pick<PersistedMarathonPreferences, (typeof PLAN_OWNED_PREFERENCE_KEYS)[number]>;

export type PlanPreferencesStore = {
  /** Plan, zu dem die aktuellen Preferences gehören; null = unbekannt (Alt-Bestand, Wizard läuft). */
  ownerPlanId: string | null;
  byPlan: Record<string, PlanOwnedPreferences>;
};

export const EMPTY_PLAN_PREFERENCES_STORE: PlanPreferencesStore = { ownerPlanId: null, byPlan: {} };

export function pickPlanOwnedPreferences(preferences: PersistedMarathonPreferences): PlanOwnedPreferences {
  const out: Record<string, unknown> = {};
  for (const key of PLAN_OWNED_PREFERENCE_KEYS) {
    if (key in preferences) out[key] = preferences[key];
  }
  return out as PlanOwnedPreferences;
}

/** Ersetzt NUR die plan-eigenen Felder; ein im Plan fehlendes Feld fehlt danach auch in den Preferences. */
export function replacePlanOwnedPreferences(
  preferences: PersistedMarathonPreferences,
  owned: PlanOwnedPreferences,
): PersistedMarathonPreferences {
  const rest: Record<string, unknown> = { ...preferences };
  for (const key of PLAN_OWNED_PREFERENCE_KEYS) delete rest[key];
  return { ...rest, ...pickPlanOwnedPreferences(owned) };
}

type LeavingPlan = {
  planId: string | null;
  /** Ohne bekannten Besitzer: beschreiben die Preferences diesen Plan (`preferencesBelongToPlan`)? */
  describesPreferences: boolean;
};

function leavingPlanOwnsPreferences(store: PlanPreferencesStore, from: LeavingPlan): boolean {
  if (from.planId == null) return false;
  return store.ownerPlanId === from.planId || (store.ownerPlanId == null && from.describesPreferences);
}

function stashLeavingPlan(
  store: PlanPreferencesStore,
  preferences: PersistedMarathonPreferences,
  from: LeavingPlan,
): Record<string, PlanOwnedPreferences> {
  if (from.planId == null || !leavingPlanOwnsPreferences(store, from)) return { ...store.byPlan };
  return { ...store.byPlan, [from.planId]: pickPlanOwnedPreferences(preferences) };
}

/**
 * Planwechsel: Felder des verlassenen Plans merken, die des Zielplans einsetzen. Ist für den Zielplan
 * nichts gemerkt, werden die plan-eigenen Felder geleert (kein Ziel statt ein fremdes) — außer die
 * aktuellen Preferences gehören nachweislich schon ihm.
 */
export function switchPlanPreferences(args: {
  preferences: PersistedMarathonPreferences;
  store: PlanPreferencesStore;
  from: LeavingPlan;
  to: { planId: string; describesPreferences: boolean };
  /** false, wenn der verlassene Plan gelöscht wurde. */
  stash?: boolean;
}): { preferences: PersistedMarathonPreferences; store: PlanPreferencesStore } {
  const { preferences, store, from, to } = args;
  const fromOwns = leavingPlanOwnsPreferences(store, from);
  const byPlan = args.stash === false ? { ...store.byPlan } : stashLeavingPlan(store, preferences, from);
  if (args.stash === false && from.planId != null) delete byPlan[from.planId];

  const remembered = byPlan[to.planId];
  const alreadyTargets =
    store.ownerPlanId === to.planId || (store.ownerPlanId == null && !fromOwns && to.describesPreferences);
  const next = remembered
    ? replacePlanOwnedPreferences(preferences, remembered)
    : alreadyTargets
      ? preferences
      : replacePlanOwnedPreferences(preferences, {});
  return { preferences: next, store: { ownerPlanId: to.planId, byPlan } };
}

/** Wizard-Abschluss: Felder des bisherigen Plans merken; der Besitzer steht erst nach dem Anlegen fest. */
export function stashPlanPreferencesBeforeWizard(
  store: PlanPreferencesStore,
  preferences: PersistedMarathonPreferences,
  from: LeavingPlan,
): PlanPreferencesStore {
  return { ownerPlanId: null, byPlan: stashLeavingPlan(store, preferences, from) };
}

export function assignPlanPreferencesOwner(
  store: PlanPreferencesStore,
  planId: string,
  preferences: PersistedMarathonPreferences,
): PlanPreferencesStore {
  return { ownerPlanId: planId, byPlan: { ...store.byPlan, [planId]: pickPlanOwnedPreferences(preferences) } };
}

export function forgetPlanPreferences(store: PlanPreferencesStore, planId: string): PlanPreferencesStore {
  const byPlan = { ...store.byPlan };
  delete byPlan[planId];
  return { ownerPlanId: store.ownerPlanId === planId ? null : store.ownerPlanId, byPlan };
}

export function readPlanPreferencesStore(): PlanPreferencesStore {
  if (typeof localStorage === "undefined") return EMPTY_PLAN_PREFERENCES_STORE;
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAN_OWNED_PREFERENCES_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || !parsed.byPlan || typeof parsed.byPlan !== "object") {
      return EMPTY_PLAN_PREFERENCES_STORE;
    }
    return {
      ownerPlanId: typeof parsed.ownerPlanId === "string" ? parsed.ownerPlanId : null,
      byPlan: parsed.byPlan,
    };
  } catch {
    return EMPTY_PLAN_PREFERENCES_STORE;
  }
}

export function writePlanPreferencesStore(store: PlanPreferencesStore): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PLAN_OWNED_PREFERENCES_KEY, JSON.stringify(store));
  } catch {
    /* Speicher voll/gesperrt: der Wechsel wirkt trotzdem für diese Sitzung */
  }
}
