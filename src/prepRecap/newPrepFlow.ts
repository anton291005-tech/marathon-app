/**
 * „Neue Vorbereitung starten" — Reihenfolge ist hart abgesichert, weil der Flow echte Pläne
 * archiviert und der Wizard (handleOnboardingComplete) Preferences ersetzt und Logs kürzt:
 *
 * 1. Snapshot des Rückblicks sicherstellen — muss in Supabase gespeichert und mit dem Plan
 *    verknüpft sein. Sonst Abbruch: nichts archiviert, kein Wizard, verständliche Meldung.
 * 2. Merker setzen (welcher Plan beim Abschluss archiviert wird).
 * 3. Wizard öffnen. Abbrechen verwirft nur den Merker — nichts wurde verändert.
 * 4. Erst beim Abschluss des Wizards: alten Plan archivieren, dann den neuen anlegen. Scheitert
 *    das Anlegen, wird die Archivierung rückgängig gemacht (der alte Plan bleibt aktiv).
 */

import type { ArchivedPlanPrevious } from "../lib/supabase/services/trainingPlanService";
import type { PrepRecapRecord } from "./prepRecapRecord";

/** Der Merker: dieser Plan wird beim Abschluss des Wizards archiviert. */
export type PendingNewPrep = { planIdToArchive: string; raceDate: string };

export const NEW_PREP_SNAPSHOT_FAILED_MESSAGE =
  "Dein Rückblick konnte nicht gespeichert werden. Es wurde nichts verändert – prüfe deine Verbindung und versuche es erneut.";
export const NEW_PREP_NO_PLAN_MESSAGE =
  "Dein aktueller Plan wurde nicht gefunden. Es wurde nichts verändert – versuche es gleich noch einmal.";

export type PrepareNewPrepResult = { ok: true; pending: PendingNewPrep } | { ok: false; message: string };

/** Schritt 1: Snapshot gespeichert und mit dem zu archivierenden Plan verknüpft — oder Abbruch. */
export async function prepareNewPrep(args: {
  planIdToArchive: string | null;
  ensureSnapshot: () => Promise<PrepRecapRecord>;
  linkSnapshotToPlan: (raceDate: string, planId: string) => Promise<boolean>;
}): Promise<PrepareNewPrepResult> {
  const { planIdToArchive } = args;
  if (!planIdToArchive) return { ok: false, message: NEW_PREP_NO_PLAN_MESSAGE };

  let record: PrepRecapRecord;
  try {
    record = await args.ensureSnapshot();
  } catch {
    return { ok: false, message: NEW_PREP_SNAPSHOT_FAILED_MESSAGE };
  }
  // Ohne id liegt der Snapshot nur im lokalen Cache (Supabase nicht erreichbar) — zu wenig,
  // um danach Logs zu kürzen und den Plan zu archivieren.
  if (!record.id) return { ok: false, message: NEW_PREP_SNAPSHOT_FAILED_MESSAGE };

  if (record.planId !== planIdToArchive) {
    let linked = false;
    try {
      linked = await args.linkSnapshotToPlan(record.raceDate, planIdToArchive);
    } catch {
      linked = false;
    }
    if (!linked) return { ok: false, message: NEW_PREP_SNAPSHOT_FAILED_MESSAGE };
  }

  return { ok: true, pending: { planIdToArchive, raceDate: record.raceDate } };
}

/** Schritt 4: archivieren, dann den neuen Plan anlegen; bei Fehler Archivierung zurücknehmen. */
export async function completeNewPrep(args: {
  pending: PendingNewPrep;
  archivePlan: (planId: string) => Promise<ArchivedPlanPrevious | null>;
  restorePlan: (planId: string, previous: ArchivedPlanPrevious) => Promise<void>;
  insertNewPlan: () => Promise<void>;
}): Promise<void> {
  const { planIdToArchive } = args.pending;
  const previous = await args.archivePlan(planIdToArchive);
  try {
    await args.insertNewPlan();
  } catch (error) {
    if (previous) {
      try {
        await args.restorePlan(planIdToArchive, previous);
      } catch (restoreError) {
        // eslint-disable-next-line no-console
        console.error("[newPrep] restore after failed insert failed", restoreError);
      }
    }
    throw error;
  }
}

/**
 * Abschluss des Wizards (handleOnboardingComplete). Bei gesetztem Merker ZUERST remote archivieren
 * und den neuen Plan anlegen — erst danach lokal umstellen (Preferences ersetzen, Logs kürzen).
 * Scheitert der Remote-Teil oder ist der neue Plan unbrauchbar, wirft die Funktion, BEVOR
 * `applyLocally` läuft: der Wizard zeigt den Fehler, lokal bleibt alles unverändert.
 */
export async function runOnboardingCompletion<P>(args: {
  newPrepPending: boolean;
  userId: string | null;
  /** Normalisierter neuer Plan oder null. */
  plan: P | null;
  isPlanUsable: (plan: P) => boolean;
  /** `useNewPrepFlow().complete`: archivieren → insertNewPlan (mit Rücknahme bei Fehler). */
  completeNewPrep: (insertNewPlan: () => Promise<void>) => Promise<void>;
  insertNewPlan: (userId: string, plan: P) => Promise<void>;
  applyLocally: (opts: { savedRemotely: boolean }) => Promise<void>;
}): Promise<void> {
  if (!args.newPrepPending) {
    await args.applyLocally({ savedRemotely: false });
    return;
  }
  const { userId, plan } = args;
  if (!userId || plan == null || !args.isPlanUsable(plan)) {
    throw new Error("[newPrep] neuer Plan ungültig oder nicht angemeldet — nichts archiviert");
  }
  await args.completeNewPrep(() => args.insertNewPlan(userId, plan));
  await args.applyLocally({ savedRemotely: true });
}
