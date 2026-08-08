-- Leaderboards must not surface App Review test-rig people (people.is_test) to
-- real users. Both RPCs are SECURITY DEFINER, so the viewer check uses
-- auth.uid(): a viewer whose own people row is is_test (claude.tester) still
-- sees test rows; everyone else — including anon — does not.

CREATE OR REPLACE FUNCTION public.soap_leaderboard()
 RETURNS TABLE(person_id uuid, name text, entries_30d bigint, current_streak integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d AS (
    SELECT DISTINCT s.person_id, s.journal_date FROM soap_journals s
  ),
  j AS (
    SELECT d.person_id, d.journal_date,
           d.journal_date - (ROW_NUMBER() OVER (PARTITION BY d.person_id ORDER BY d.journal_date))::int AS grp
    FROM d
  ),
  islands AS (
    SELECT person_id, grp, MAX(journal_date) AS end_d, COUNT(*) AS len
    FROM j GROUP BY person_id, grp
  ),
  streaks AS (
    SELECT person_id, COALESCE(MAX(len) FILTER (WHERE end_d >= CURRENT_DATE - 1), 0) AS cur
    FROM islands GROUP BY person_id
  ),
  counts AS (
    SELECT person_id, COUNT(*) AS c30 FROM soap_journals
    WHERE journal_date >= CURRENT_DATE - 30 GROUP BY person_id
  )
  SELECT p.id, p.name, COALESCE(c.c30, 0), COALESCE(s.cur, 0)::int
  FROM people p
  LEFT JOIN counts c ON c.person_id = p.id
  LEFT JOIN streaks s ON s.person_id = p.id
  WHERE (COALESCE(c.c30, 0) > 0 OR COALESCE(s.cur, 0) > 0)
    AND (p.is_test = false OR EXISTS (
      SELECT 1 FROM people v WHERE v.auth_user_id = auth.uid() AND v.is_test
    ))
  ORDER BY COALESCE(s.cur, 0) DESC, COALESCE(c.c30, 0) DESC
  LIMIT 20
$function$;

CREATE OR REPLACE FUNCTION public.attendance_leaderboard()
 RETURNS TABLE(person_id uuid, name text, attended_8w bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, COUNT(*) AS attended_8w
  FROM group_attendance ga
  JOIN people p ON p.id = ga.person_id
  WHERE ga.attended = true AND ga.meeting_date >= CURRENT_DATE - 56
    AND (p.is_test = false OR EXISTS (
      SELECT 1 FROM people v WHERE v.auth_user_id = auth.uid() AND v.is_test
    ))
  GROUP BY p.id, p.name
  ORDER BY attended_8w DESC
  LIMIT 20
$function$;
