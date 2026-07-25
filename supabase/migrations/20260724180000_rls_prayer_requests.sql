-- RLS for prayer_requests: DB-enforce prayer visibility so no coach can see
-- another person's prayer unless it was shared in a way that includes them.
-- Service-role API routes bypass RLS and are unaffected.

-- ── Helpers (SECURITY DEFINER so they don't recurse through RLS) ──────────────

create or replace function public.current_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.people
  where auth_user_id = auth.uid()
     or lower(email) = lower(auth.jwt() ->> 'email')
  order by (auth_user_id = auth.uid()) desc
  limit 1;
$$;

create or replace function public.current_person_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.people
                   where id = public.current_person_id()), false);
$$;

create or replace function public.my_downline_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive dl as (
    select public.current_person_id() as person_id
    union
    select dc.disciple_person_id
    from public.discipleship_connections dc
    join dl on dc.discipler_person_id = dl.person_id
    where dc.disciple_person_id is not null
  )
  select person_id from dl where person_id is not null;
$$;

create or replace function public.my_group_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct m.person_id
  from public.person_victory_groups mine
  join public.person_victory_groups m on m.victory_group_id = mine.victory_group_id
  where mine.person_id = public.current_person_id()
    and mine.status = 'approved'
    and m.status = 'approved';
$$;

grant execute on function public.current_person_id()       to authenticated;
grant execute on function public.current_person_is_admin() to authenticated;
grant execute on function public.my_downline_ids()         to authenticated;
grant execute on function public.my_group_member_ids()     to authenticated;

-- ── Policies ─────────────────────────────────────────────────────────────────

alter table public.prayer_requests enable row level security;

drop policy if exists prayer_requests_select on public.prayer_requests;
create policy prayer_requests_select on public.prayer_requests
for select to authenticated using (
  person_id = public.current_person_id()
  or created_by_person_id = public.current_person_id()
  or visibility = 'constellation'
  or (public.current_person_is_admin() and visibility <> 'private')
  or (visibility = 'coach' and person_id in (select public.my_downline_ids()))
  or (visibility = 'group'  and person_id in (select public.my_group_member_ids()))
);

drop policy if exists prayer_requests_insert on public.prayer_requests;
create policy prayer_requests_insert on public.prayer_requests
for insert to authenticated with check (
  created_by_person_id = public.current_person_id()
  or person_id = public.current_person_id()
  or public.current_person_is_admin()
);

drop policy if exists prayer_requests_update on public.prayer_requests;
create policy prayer_requests_update on public.prayer_requests
for update to authenticated
using (
  person_id = public.current_person_id()
  or created_by_person_id = public.current_person_id()
  or public.current_person_is_admin()
  or person_id in (select public.my_downline_ids())
)
with check (
  person_id = public.current_person_id()
  or created_by_person_id = public.current_person_id()
  or public.current_person_is_admin()
  or person_id in (select public.my_downline_ids())
);

drop policy if exists prayer_requests_delete on public.prayer_requests;
create policy prayer_requests_delete on public.prayer_requests
for delete to authenticated using (
  person_id = public.current_person_id()
  or created_by_person_id = public.current_person_id()
  or public.current_person_is_admin()
);
