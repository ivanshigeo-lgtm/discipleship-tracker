-- Big Five (OCEAN) personality assessment results. Mirrors spiritual_gifts_results
-- (see 20260726120000): one row per person (upsert on person_id), same audit
-- trigger + RLS shape. No top_gifts column — the Big Five is five dimensional
-- traits, all carried in `scores`.

create table if not exists public.big_five_results (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references public.people(id) on delete cascade,
  responses      jsonb not null default '{}'::jsonb,   -- { "1": 1..5, ... "50": n }
  scores         jsonb not null default '[]'::jsonb,   -- TraitScore[] (five traits, OCEAN order)
  completed_at   timestamptz,
  last_edited_by uuid references public.people(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists big_five_results_person_id_key
  on public.big_five_results (person_id);

comment on table public.big_five_results is
  'Latest Big Five (OCEAN) personality assessment result per person. One row per person (upsert on person_id).';

-- ── updated_at + last_edited_by trigger ───────────────────────────────────────
create or replace function public.set_big_five_results_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare editor uuid;
begin
  new.updated_at := now();
  select id into editor from public.people where auth_user_id = auth.uid() limit 1;
  if editor is not null then new.last_edited_by := editor; end if;
  return new;
end; $$;

drop trigger if exists trg_big_five_results_audit on public.big_five_results;
create trigger trg_big_five_results_audit
  before insert or update on public.big_five_results
  for each row execute function public.set_big_five_results_audit();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.big_five_results enable row level security;

drop policy if exists big_five_results_select on public.big_five_results;
create policy big_five_results_select on public.big_five_results
for select to authenticated using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
  or person_id in (select public.my_downline_ids())
);

drop policy if exists big_five_results_insert on public.big_five_results;
create policy big_five_results_insert on public.big_five_results
for insert to authenticated with check (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

drop policy if exists big_five_results_update on public.big_five_results;
create policy big_five_results_update on public.big_five_results
for update to authenticated
using (person_id = public.current_person_id() or public.current_person_is_admin())
with check (person_id = public.current_person_id() or public.current_person_is_admin());

drop policy if exists big_five_results_delete on public.big_five_results;
create policy big_five_results_delete on public.big_five_results
for delete to authenticated using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

grant select, insert, update, delete on public.big_five_results to authenticated;
