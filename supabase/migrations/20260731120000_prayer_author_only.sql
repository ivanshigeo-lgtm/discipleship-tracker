-- Prayer wall = author-only. Confirmed with user (2026-07-31):
--   "My prayers are for others. Only I should be able to see them. No one else
--    — even the people I'm praying for — should see what I'm praying for them.
--    And I shouldn't see what/who others are praying for."
--
-- The residual leak: prayer_requests_select still allowed `person_id =
-- current_person_id()`, so the SUBJECT of a prayer could read a private prayer
-- written ABOUT them by someone else (e.g. a disciple could see the prayer their
-- coach logged for them). Remove that branch. A prayer is now visible only to
-- its AUTHOR (created_by), plus anything the author EXPLICITLY shared
-- (constellation / coach / group) — the opt-in sharing feature is preserved.
--
-- First, backfill: 39 legacy rows had created_by_person_id = NULL (they predate
-- author tracking) and would vanish for everyone once reads are author-keyed.
-- `= person_id` is only a safe FALLBACK so a row stays visible to exactly one
-- person. In prod these were coach-logged, so all 39 were then re-attributed to
-- their real author (Jonavan, confirmed row-by-row with the user 2026-07-31) via
-- `update ... set created_by_person_id = <jonavan> where created_by_person_id =
-- person_id`. A fresh env has no legacy rows, so the fallback below is inert.

update public.prayer_requests
  set created_by_person_id = person_id
  where created_by_person_id is null
    and person_id is not null;

-- Re-key SELECT: drop the `person_id = current_person_id()` (subject-sees)
-- branch. Everything else is unchanged from 20260724181000.
drop policy if exists prayer_requests_select on public.prayer_requests;

create policy prayer_requests_select on public.prayer_requests
for select to authenticated using (
  created_by_person_id = public.current_person_id()
  or visibility = 'constellation'
  or (public.current_person_is_admin() and visibility <> 'private')
  or (visibility = 'coach' and person_id in (select public.my_downline_ids()))
  or (visibility = 'group'  and person_id in (select public.my_group_member_ids()))
);
