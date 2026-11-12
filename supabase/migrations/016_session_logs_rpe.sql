-- Readiness Schritt 2 (docs/readiness-plan.md, Spec §5, §6.2): Anstrengung nach der Einheit (Session-RPE 0–10, Foster 2001)
-- und Dauer in Minuten. Last je Einheit = RPE × Dauer (AU). Beide Felder optional; Altzeilen bleiben NULL.
-- Der Client speichert auch ohne diese Spalten weiter (Rückfall in sessionLogsService.ts).
-- Idempotent: mehrfach ausführbar.

ALTER TABLE public.session_logs
  ADD COLUMN IF NOT EXISTS rpe smallint,
  ADD COLUMN IF NOT EXISTS duration_min integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_logs_rpe_range') THEN
    ALTER TABLE public.session_logs
      ADD CONSTRAINT session_logs_rpe_range CHECK (rpe IS NULL OR rpe BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_logs_duration_min_range') THEN
    ALTER TABLE public.session_logs
      ADD CONSTRAINT session_logs_duration_min_range CHECK (duration_min IS NULL OR duration_min BETWEEN 5 AND 600);
  END IF;
END $$;
