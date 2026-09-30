import { useCallback, useRef, useState } from "react";
import type { ArchivedPlanPrevious } from "../lib/supabase/services/trainingPlanService";
import { completeNewPrep, prepareNewPrep, type PendingNewPrep } from "./newPrepFlow";
import type { PrepRecapRecord } from "./prepRecapRecord";

export type NewPrepFlowDeps = {
  /** Aktiver Plan, der beim Abschluss archiviert wird. */
  getPlanIdToArchive: () => string | null;
  ensureSnapshot: () => Promise<PrepRecapRecord>;
  linkSnapshotToPlan: (raceDate: string, planId: string) => Promise<boolean>;
  archivePlan: (planId: string) => Promise<ArchivedPlanPrevious | null>;
  restorePlan: (planId: string, previous: ArchivedPlanPrevious) => Promise<void>;
};

/**
 * Zustand des Flows „Neue Vorbereitung starten" (Reihenfolge siehe newPrepFlow.ts).
 * `wizardOpen` ist genau dann true, wenn der Merker gesetzt ist.
 */
export function useNewPrepFlow(deps: NewPrepFlowDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const pendingRef = useRef<PendingNewPrep | null>(null);
  const startingRef = useRef(false);
  const [pending, setPendingState] = useState<PendingNewPrep | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPending = useCallback((next: PendingNewPrep | null) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  /** Schritte 1–3: Snapshot → Merker → Wizard. Bei Fehler bleibt alles unverändert. */
  const start = useCallback(async () => {
    if (startingRef.current || pendingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const d = depsRef.current;
      const result = await prepareNewPrep({
        planIdToArchive: d.getPlanIdToArchive(),
        ensureSnapshot: d.ensureSnapshot,
        linkSnapshotToPlan: d.linkSnapshotToPlan,
      });
      if (result.ok) setPending(result.pending);
      else setError(result.message);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [setPending]);

  /** Abbrechen im Wizard: nur den Merker verwerfen — es wurde noch nichts verändert. */
  const cancel = useCallback(() => setPending(null), [setPending]);

  /**
   * Schritt 4, beim Abschluss des Wizards: alten Plan archivieren, dann `insertNewPlan`.
   * Ohne Merker (normaler „Neuer Trainingsplan") nur `insertNewPlan`. Wirft bei Fehler —
   * der Merker bleibt dann gesetzt, damit ein erneuter Versuch wieder archiviert.
   */
  const complete = useCallback(
    async (insertNewPlan: () => Promise<void>) => {
      const current = pendingRef.current;
      if (!current) {
        await insertNewPlan();
        return;
      }
      const d = depsRef.current;
      await completeNewPrep({
        pending: current,
        archivePlan: d.archivePlan,
        restorePlan: d.restorePlan,
        insertNewPlan,
      });
      setPending(null);
    },
    [setPending],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    wizardOpen: pending != null,
    pending,
    pendingRef,
    starting,
    error,
    start,
    cancel,
    complete,
    clearError,
  };
}
