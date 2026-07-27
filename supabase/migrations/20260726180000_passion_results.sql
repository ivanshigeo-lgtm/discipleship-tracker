-- GBC Passion Assessment results. Mirrors big_five_results (see 20260726160000):
-- one row per person (upsert on person_id), same audit trigger + RLS shape.
-- Not scored — a single `answers` jsonb blob holds the five free-text
-- reflections plus the ranked top-3 people-groups and top-3 issues.

create table if not exists public.passion_results (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references public.people(id) on delete cascade,
  answers        jsonb not null default '{}'::jsonb,   -- { reflections: {1..5: text}, peopleGroups: [], issues: [] }
  completed_at   timestamptz,
  last_edited_by uuid references public.people(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists passion_results_person_id_key
  on public.passion_results (person_id);

comment on table public.passion_results is
  'Latest GBC Passion Assessment result per person. One row per person (upsert on person_id). Reflective, not scored.';

-- ── updated_at + last_edited_by trigger ───────────────────────────────────────
create or replace function public.set_passion_results_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare editor uuid;
begin
  new.updated_at := now();
  select id into editor from public.people where auth_user_id = auth.uid() limit 1;
  if editor is not null then new.last_edited_by := editor; end if;
  return new;
end; $$;

drop trigger if exists trg_passion_results_audit on public.passion_results;
create trigger trg_passion_results_audit
  before insert or update on public.passion_results
  for each row execute function public.set_passion_results_audit();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.passion_results enable row level security;

drop policy if exists passion_results_select on public.passion_results;
create policy passion_results_select on public.passion_results
for select to authenticated using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
  or person_id in (select public.my_downline_ids())
);

drop policy if exists passion_results_insert on public.passion_results;
create policy passion_results_insert on public.passion_results
for insert to authenticated with check (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

drop policy if exists passion_results_update on public.passion_results;
create policy passion_results_update on public.passion_results
for update to authenticated
using (person_id = public.current_person_id() or public.current_person_is_admin())
with check (person_id = public.current_person_id() or public.current_person_is_admin());

drop policy if exists passion_results_delete on public.passion_results;
create policy passion_results_delete on public.passion_results
for delete to authenticated using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

grant select, insert, update, delete on public.passion_results to authenticated;
