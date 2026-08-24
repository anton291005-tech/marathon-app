-- 010: Herkunfts-Spalte für weekly_schedule_blocks (EventKit-Import / Presets / manuelle bzw. SQL-Testdaten).
-- Bestehende Zeilen (SQL-Testdaten) werden per DEFAULT auf 'manual' backfillt — der Replace-All-Sync
-- des Kalenderimports löscht ausschließlich source='eventkit' und kann sie strukturell nie treffen.

ALTER TABLE public.weekly_schedule_blocks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.weekly_schedule_blocks
  DROP CONSTRAINT IF EXISTS weekly_schedule_blocks_source_check;
ALTER TABLE public.weekly_schedule_blocks
  ADD CONSTRAINT weekly_schedule_blocks_source_check
  CHECK (source IN ('manual', 'eventkit', 'preset'));

CREATE INDEX IF NOT EXISTS idx_weekly_schedule_blocks_user_source
  ON public.weekly_schedule_blocks (user_id, source);
