-- Freundes-Test: Auswertung im Supabase-SQL-Editor (läuft als Service-Role, sieht alle Nutzer).
-- Voraussetzung: Migration 025_feedback_usage.sql ist angewendet. Zeiten in Europe/Berlin.
-- Nur lesen. Ergebnisse nicht an ein Sprachmodell geben (Feedback ist Freitext der Testpersonen).

-- 1) Aktive Nutzer je Tag (mindestens ein Ereignis, meist app_open; höchstens 1 app_open/h je Gerät)
SELECT
  (created_at AT TIME ZONE 'Europe/Berlin')::date AS tag,
  count(DISTINCT user_id) AS aktive_nutzer,
  count(*) FILTER (WHERE name = 'app_open') AS app_opens
FROM public.usage_events
GROUP BY 1
ORDER BY 1 DESC;

-- 2) Onboarding abgeschlossen je Nutzer (erstes Mal)
SELECT user_id, min(created_at AT TIME ZONE 'Europe/Berlin') AS onboarding_done_at
FROM public.usage_events
WHERE name = 'onboarding_done'
GROUP BY user_id
ORDER BY 2;

-- 3) Schicht-Vorschläge: gezeigt / angenommen / abgelehnt (gesamt und je Nutzer)
SELECT
  count(*) FILTER (WHERE name = 'shift_proposal_shown') AS gezeigt,
  count(*) FILTER (WHERE name = 'shift_proposal_accepted') AS angenommen,
  count(*) FILTER (WHERE name = 'shift_proposal_declined') AS abgelehnt,
  round(
    100.0 * count(*) FILTER (WHERE name = 'shift_proposal_accepted')
    / nullif(count(*) FILTER (WHERE name IN ('shift_proposal_accepted', 'shift_proposal_declined')), 0),
    1
  ) AS annahme_quote_prozent
FROM public.usage_events
WHERE name LIKE 'shift_proposal_%';

SELECT
  user_id,
  count(*) FILTER (WHERE name = 'shift_proposal_shown') AS gezeigt,
  count(*) FILTER (WHERE name = 'shift_proposal_accepted') AS angenommen,
  count(*) FILTER (WHERE name = 'shift_proposal_declined') AS abgelehnt,
  coalesce(sum((props ->> 'count')::int) FILTER (WHERE name = 'shift_entries_saved'), 0) AS dienste_eingetragen
FROM public.usage_events
WHERE name LIKE 'shift_%'
GROUP BY user_id
ORDER BY gezeigt DESC;

-- 4) Erledigte Einheiten je Quelle (manual | apple_health | strava), je Tag
SELECT
  (created_at AT TIME ZONE 'Europe/Berlin')::date AS tag,
  props ->> 'source' AS quelle,
  count(*) AS erledigt,
  count(DISTINCT user_id) AS nutzer
FROM public.usage_events
WHERE name = 'session_completed'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 5) Feedback-Liste (neueste zuerst)
SELECT
  f.created_at AT TIME ZONE 'Europe/Berlin' AS zeit,
  u.email,
  coalesce(f.category, '—') AS kategorie,
  f.screen AS bildschirm,
  f.app_version,
  f.device,
  f.message
FROM public.user_feedback f
LEFT JOIN auth.users u ON u.id = f.user_id
ORDER BY f.created_at DESC;

-- 6) Feedback je Kategorie
SELECT coalesce(category, 'ohne') AS kategorie, count(*) AS anzahl
FROM public.user_feedback
GROUP BY 1
ORDER BY 2 DESC;
