-- Mirrors production migration people_created_by_insert_rls
-- (yddjlhdptsundeimugba, schema_migrations.version = 20260822073549).
-- Already applied on that project — do not re-apply there.
--
-- PostgREST always RETURNING's the new people row. INSERT WITH CHECK
-- ("Authenticated users can add people": auth.uid() IS NOT NULL) can pass
-- while SELECT still rejects it, which surfaces as:
--   new row violates row-level security policy for table "people"
--
-- people_sel was:
--   auth_user_id = auth.uid()
--   OR id IN (SELECT visible_person_ids())
--
-- visible_person_ids() is STABLE, so it cannot see the row being inserted
-- in the same command. A new person is also not in my_downline_ids() yet.
--
-- This migration adds people.created_by, fills it on INSERT from
-- current_person_id(), and extends people_sel so the creator can see the
-- new row. Existing visibility rules are otherwise unchanged.

alter table public.people
  add column if not exists created_by uuid references public.people(id);

create or replace function public.set_people_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := public.current_person_id();
  end if;
  return new;
end;
$$;

drop trigger if exists people_set_created_by on public.people;
create trigger people_set_created_by
  before insert on public.people
  for each row execute function set_people_created_by();

drop policy if exists people_sel on public.people;
create policy people_sel on public.people
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or id in (select visible_person_ids())
    or (created_by is not null and created_by = current_person_id())
  );
