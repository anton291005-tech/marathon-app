-- Required for PostgREST upsert: onConflict: 'user_id,session_id'
-- Run in Supabase Dashboard → SQL Editor if not yet applied.
ALTER TABLE public.session_logs
  ADD CONSTRAINT session_logs_user_session_unique
  UNIQUE (user_id, session_id);
