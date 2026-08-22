-- people INSERT ... RETURNING was aborting under RLS.
--
-- PostgREST always RETURNING's the new row. INSERT WITH CHECK
-- ("Authenticated users can add people": auth.uid() IS NOT NULL) can pass
-- while SELECT still rejects the row, which surfaces as:
--   new row violates row-level security policy for table "people"
--
-- people_sel is:
--   auth_user_id = auth.uid()
--   OR id IN (SELECT visible_person_ids())
--
-- visible_person_ids() is STABLE SECURITY DEFINER. STABLE functions cannot
-- see the row being inserted in the same command, so the new id is never in
-- that set — even for Empower/admin, whose church-wide branch is
-- `SELECT id FROM people WHERE ...`. A brand-new person is also not in
-- my_downline_ids() yet (the auto coach-connection is written AFTER insert).
--
-- Fix: stamp people.created_by from the acting session on INSERT, and let
-- SELECT see rows the current person created. That is a column on the NEW
-- tuple, so RETURNING does not need the STABLE snapshot to include the new
-- id. Non-Empower leaders keep seeing people they added; everyone else stays
-- on the existing visibility rules. RLS stays on. No service_role in the
-- client. Email stays optional.

-- Church-wide / constellation helpers used by people_sel. CREATE OR REPLACE
-- so a database that only has the repo migrations (people_sel using true,
-- no visible_person_ids) still has a valid policy after this file.
create or replace function public.is_current_person_empower()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select current_stage = 'Empower' from public.people
                   where id = public.current_person_id()), false);
$$;

create or replace function public.my_upline_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive ul as (
    select public.current_person_id() as person_id
    union
    select dc.discipler_person_id
    from public.discipleship_connections dc
    join ul on dc.disciple_person_id = ul.person_id
    where dc.discipler_person_id is not null
  )
  select person_id from ul where person_id is not null;
$$;

create or replace function public.visible_person_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- admins and Empower keep church-wide reach
  select p.id from public.people p
    where (select public.current_person_is_admin() or public.is_current_person_empower())
  union
  select public.current_person_id()
  union
  select public.my_downline_ids()
  union
  select public.my_group_member_ids()
  union
  select public.my_upline_ids();
$$;

grant execute on function public.is_current_person_empower() to authenticated;
grant execute on function public.my_upline_ids()             to authenticated;
grant execute on function public.visible_person_ids()        to authenticated;

alter table public.people
  add column if not exists created_by uuid references public.people(id) on delete set null;

comment on column public.people.created_by is
  'Person who created this row (auto-set by people_set_created_by from the acting session). Null for service-role/system writes with no JWT.';

create index if not exists people_created_by_idx on public.people (created_by);

create or replace function public.set_people_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  if tg_op = 'UPDATE' then
    -- Creator is immutable. Clients must not reassign visibility by editing it.
    new.created_by := old.created_by;
    return new;
  end if;

  actor := public.current_person_id();
  if actor is not null then
    -- Always stamp from the session so a client cannot spoof another creator.
    new.created_by := actor;
  end if;
  return new;
end;
$$;

drop trigger if exists people_set_created_by on public.people;
create trigger people_set_created_by
  before insert or update on public.people
  for each row execute function public.set_people_created_by();

drop policy if exists people_sel on public.people;
create policy people_sel on public.people
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or id in (select public.visible_person_ids())
    or (created_by is not null and created_by = public.current_person_id())
  );

-- merge_people leftover-FK scan would otherwise refuse to delete a person who
-- created other people rows. Patch the live function (prod and repo copies
-- differ) rather than replacing the whole body.
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'merge_people' and p.pronargs = 2;

  if def is null then
    return;
  end if;

  if def not like '%set created_by = p_keep%' then
    def := replace(
      def,
      'update people set last_edited_by = p_keep where last_edited_by = p_dup and id <> p_dup;',
      'update people set last_edited_by = p_keep where last_edited_by = p_dup and id <> p_dup;'
      || E'\n  update people set created_by = p_keep where created_by = p_dup and id <> p_dup;'
    );
  end if;

  if def like '%kcu.column_name = ''last_edited_by''%'
     and def not like '%''last_edited_by'', ''created_by''%' then
    def := replace(
      def,
      'and not (tc.table_name = ''people'' and kcu.column_name = ''last_edited_by'')',
      'and not (tc.table_name = ''people'' and kcu.column_name in (''last_edited_by'', ''created_by''))'
    );
  end if;

  execute def;
end;
$$;
