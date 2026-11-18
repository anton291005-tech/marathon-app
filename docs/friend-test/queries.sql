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

-- 7) Zielzeit am Plan prüfen (nur lesen): Pläne, deren meta.goal nicht zur Plan-Distanz passt oder unplausibel ist.
--    Plan-Distanz = km des spätesten Rennens (sessionType 'race') im Plan, wie src/planGoal.ts.
--    grund = 'unplausibel': Pace der Zielzeit außerhalb 2:30–12:00 min/km (src/goalTimePlausibility.ts).
--    grund = 'gleiche Zeit an anderer Distanz': dieselbe Zielzeit steht bei diesem Nutzer auch an einem Plan mit
--            anderer Distanz – Verdacht auf den alten Nachtrag aus der Profil-Zielzeit (z. B. 2:50:00 am HM-Plan).
--    grund = 'kein Rennen im Plan': Zielzeit ohne Rennen, keine Distanz zum Prüfen.
--    Geprüft werden nur Zielzeiten der Form H:MM:SS. Ändert nichts.
WITH workouts AS (
  SELECT p.id AS plan_id, w.value AS workout
  FROM public.training_plans p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.data -> 'workouts') = 'array' THEN p.data -> 'workouts' ELSE '[]'::jsonb END
  ) AS w(value)
),
race AS (
  SELECT DISTINCT ON (plan_id)
    plan_id,
    left(workout ->> 'dateIso', 10) AS race_date,
    CASE WHEN (workout ->> 'km') ~ '^[0-9]+(\.[0-9]+)?$' THEN (workout ->> 'km')::numeric END AS race_km
  FROM workouts
  WHERE workout ->> 'sessionType' = 'race'
  ORDER BY plan_id, left(workout ->> 'dateIso', 10) DESC
),
goal AS (
  SELECT
    p.id AS plan_id,
    p.user_id,
    p.plan_name,
    p.is_active,
    p.archived_at,
    p.updated_at,
    p.data #>> '{meta,goal,raceGoal}' AS race_goal,
    p.data #>> '{meta,goal,targetTime}' AS target_time,
    CASE
      WHEN (p.data #>> '{meta,goal,targetTime}') ~ '^[0-9]{1,2}:[0-9]{2}:[0-9]{2}$'
      THEN split_part(p.data #>> '{meta,goal,targetTime}', ':', 1)::int * 3600
         + split_part(p.data #>> '{meta,goal,targetTime}', ':', 2)::int * 60
         + split_part(p.data #>> '{meta,goal,targetTime}', ':', 3)::int
    END AS target_seconds
  FROM public.training_plans p
  WHERE p.data #>> '{meta,goal,targetTime}' IS NOT NULL
),
checked AS (
  SELECT
    g.*,
    r.race_date,
    r.race_km,
    CASE WHEN r.race_km > 0 AND g.target_seconds > 0 THEN round(g.target_seconds / r.race_km) END AS pace_sec_per_km,
    EXISTS (
      SELECT 1
      FROM goal g2
      JOIN race r2 ON r2.plan_id = g2.plan_id
      WHERE g2.user_id = g.user_id
        AND g2.plan_id <> g.plan_id
        AND g2.target_time = g.target_time
        AND r.race_km > 0 AND r2.race_km > 0
        AND abs(r2.race_km - r.race_km) >= 0.5
    ) AS gleiche_zeit_andere_distanz
  FROM goal g
  LEFT JOIN race r ON r.plan_id = g.plan_id
)
SELECT
  plan_id,
  user_id,
  plan_name,
  is_active,
  archived_at IS NOT NULL AS archiviert,
  race_date,
  race_km,
  target_time,
  pace_sec_per_km,
  CASE
    WHEN race_km IS NULL THEN 'kein Rennen im Plan'
    WHEN pace_sec_per_km IS NOT NULL AND (pace_sec_per_km < 150 OR pace_sec_per_km > 720) THEN 'unplausibel'
    ELSE 'gleiche Zeit an anderer Distanz'
  END AS grund,
  updated_at
FROM checked
WHERE race_km IS NULL
   OR (pace_sec_per_km IS NOT NULL AND (pace_sec_per_km < 150 OR pace_sec_per_km > 720))
   OR gleiche_zeit_andere_distanz
ORDER BY user_id, race_date;
