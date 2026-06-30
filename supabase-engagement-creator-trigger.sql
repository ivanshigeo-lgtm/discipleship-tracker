-- Root-cause fix for engagements with a missing/blank creator.
--
-- Background: created_by_person_id was added after many engagements already
-- existed. A one-time manual backfill guessed the creator as the disciple's
-- discipler, which was wrong for meetings an admin/lead coach scheduled, and it
-- left some rows NULL. New meetings are created by the forms (which set the
-- creator), but a `?? null` fallback there means a future code path could still
-- write a blank.
--
-- This trigger makes the database the single source of truth: on INSERT, if no
-- creator was provided, stamp it with the authenticated user's person id
-- (people.auth_user_id = auth.uid()). So a meeting can never be saved without a
-- creator, no matter which code path creates it. It never overwrites an
-- explicitly-provided creator.

create or replace function public.set_engagement_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_person_id is null then
    new.created_by_person_id := (
      select id from public.people where auth_user_id = auth.uid() limit 1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists engagements_set_creator on public.engagements;
create trigger engagements_set_creator
  before insert on public.engagements
  for each row
  execute function public.set_engagement_creator();
