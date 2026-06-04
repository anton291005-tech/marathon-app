-- One row per user + plan session for upsert sync
ALTER TABLE public.session_logs
  ADD CONSTRAINT session_logs_user_id_session_id_key UNIQUE (user_id, session_id);
