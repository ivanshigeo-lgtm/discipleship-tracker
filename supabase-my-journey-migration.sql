-- My Journey: sharing scopes, testimony, and SOAP leaderboard
-- Additive only — safe to run on live data.

-- SOAP sharing scope
ALTER TABLE soap_journals ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
DO $$ BEGIN
  ALTER TABLE soap_journals ADD CONSTRAINT soap_journals_visibility_check
    CHECK (visibility IN ('private','coach','group','constellation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Anyone signed in can read journals shared with the whole constellation
DROP POLICY IF EXISTS "Anyone can read constellation-shared journals" ON soap_journals;
CREATE POLICY "Anyone can read constellation-shared journals"
  ON soap_journals FOR SELECT
  USING (visibility = 'constellation');

-- Members of the writer's Grace Group can read group-shared journals
DROP POLICY IF EXISTS "Group members can read group-shared journals" ON soap_journals;
CREATE POLICY "Group members can read group-shared journals"
  ON soap_journals FOR SELECT
  USING (
    visibility = 'group'
    AND person_id IN (
      SELECT pvg.person_id FROM person_victory_groups pvg
      WHERE pvg.victory_group_id IN (
        SELECT victory_group_id FROM person_victory_groups
        WHERE person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
      )
    )
  );

-- Prayer requests: scope + praise flag (read RLS is already open; the UI filters by scope)
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'coach';
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_praise BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE prayer_requests ADD CONSTRAINT prayer_requests_visibility_check
    CHECK (visibility IN ('private','coach','group','constellation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Two-minute testimony (Equip stage)
ALTER TABLE people ADD COLUMN IF NOT EXISTS testimony_text TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS testimony_video_url TEXT;

-- SOAP leaderboard: aggregate streaks/counts without exposing journal contents
CREATE OR REPLACE FUNCTION public.soap_leaderboard()
RETURNS TABLE(person_id uuid, name text, entries_30d bigint, current_streak int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
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
  WHERE COALESCE(c.c30, 0) > 0 OR COALESCE(s.cur, 0) > 0
  ORDER BY COALESCE(s.cur, 0) DESC, COALESCE(c.c30, 0) DESC
  LIMIT 20
$$;
GRANT EXECUTE ON FUNCTION public.soap_leaderboard() TO authenticated;

-- Grace Group attendance leaderboard (last 8 weeks)
CREATE OR REPLACE FUNCTION public.attendance_leaderboard()
RETURNS TABLE(person_id uuid, name text, attended_8w bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, COUNT(*) AS attended_8w
  FROM group_attendance ga
  JOIN people p ON p.id = ga.person_id
  WHERE ga.attended = true AND ga.meeting_date >= CURRENT_DATE - 56
  GROUP BY p.id, p.name
  ORDER BY attended_8w DESC
  LIMIT 20
$$;
GRANT EXECUTE ON FUNCTION public.attendance_leaderboard() TO authenticated;

-- Storage bucket for testimony videos: created via API, not SQL
-- (public 'testimonies' bucket, 100MB, video/* — see deploy notes)
