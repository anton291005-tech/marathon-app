-- Archiv für Trainingspläne: eine abgeschlossene Vorbereitung wird beim Start einer neuen
-- archiviert statt gelöscht (Plan-Daten bleiben erhalten, der Rückblick in prep_recaps verweist
-- weiter per plan_id darauf).
--
-- Archivierter Plan: archived_at gesetzt, plan_slot NULL (der Slot wird frei, der Plan zählt nicht
-- gegen MAX_ACTIVE_PLANS = 5), is_active = false. Ein nicht archivierter Plan hat immer einen Slot.
-- UNIQUE (user_id, plan_slot) aus 005 bleibt unverändert: NULLs kollidieren in Postgres nicht.
--
-- Rein additiv: bestehende Zeilen (archived_at NULL, plan_slot gesetzt) erfüllen den CHECK sofort.
-- Idempotent: mehrfach ausführbar.

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.training_plans
  ALTER COLUMN plan_slot DROP NOT NULL;

ALTER TABLE public.training_plans
  DROP CONSTRAINT IF EXISTS training_plans_archive_shape;

ALTER TABLE public.training_plans
  ADD CONSTRAINT training_plans_archive_shape CHECK (
    (archived_at IS NULL AND plan_slot IS NOT NULL)
    OR
    (archived_at IS NOT NULL AND plan_slot IS NULL AND is_active = false)
  );

-- Archivliste in „Meine Trainingspläne" (neueste zuerst).
CREATE INDEX IF NOT EXISTS training_plans_user_archived_idx
  ON public.training_plans (user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;
