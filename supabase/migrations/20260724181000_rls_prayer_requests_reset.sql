-- Migration 1 added correct policies but access is still open, which means a
-- pre-existing permissive policy is OR-ing everything through. Enumerate and
-- drop ALL existing policies on prayer_requests, then reassert only ours.

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'prayer_requests'
  loop
    raise notice 'dropping pre-existing policy: %', pol.policyname;
    execute format('drop policy if exists %I on public.prayer_requests', pol.policyname);
  end loop;
end $$;

alter table public.prayer_requests enable row level security;

create policy prayer_requests_select on public.prayer_requests
for select to authenticated using (
  person_id = public.current_person_id()
  or created_by_person_id = public.current_person_id()
  or visibility = 'constellation'
  or (public.current_person_is_admin() and visibility <> 'private')
  or (visibility = 'coach' and person_id in (select public.my_downline_ids()))
  or (visibility = 'group'  and person_id in (select public.my_group_member_ids()))
);

create policy prayer_requests_insert on public.prayer_requests
for insert to authenticated with check (
  created_by_person_id = public.current_person_id()
  or person_id = public.current_person_id()
  or public.current_person_is_admin()
);

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

create policy prayer_requests_delete on public.prayer_requests
for delete to authenticated using (
  person_id = public.current_person_id()
  or created_by_person_id = public.current_person_id()
  or public.current_person_is_admin()
);
