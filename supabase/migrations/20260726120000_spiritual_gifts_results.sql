-- Spiritual Gifts assessment results (Wagner-Modified Houts, 25 gifts).
-- One row per person (upsert on person_id). Stores the raw responses, the full
-- ranked scores, and the top gifts so the results screen can render without
-- recomputing. RLS mirrors the rest of the app: a person owns their own result,
-- coaches can read their downline, admins can read/edit church-wide.
-- Reuses the helper functions defined in the prayer_requests RLS migration:
--   current_person_id(), current_person_is_admin(), my_downline_ids().

create table if not exists public.spiritual_gifts_results (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  responses    jsonb not null default '{}'::jsonb,   -- { "1": 0..3, ... "100": n }
  scores       jsonb not null default '[]'::jsonb,   -- ranked GiftScore[]
  top_gifts    jsonb not null default '[]'::jsonb,   -- top 3 GiftScore[]
  completed_at timestamptz,
  last_edited_by uuid references public.people(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One active result per person -> client can upsert on person_id.
create unique index if not exists spiritual_gifts_results_person_id_key
  on public.spiritual_gifts_results (person_id);

comment on table public.spiritual_gifts_results is
  'Latest spiritual-gifts assessment result per person. One row per person (upsert on person_id).';

-- ── updated_at + last_edited_by trigger (mirrors people/victory_groups) ───────
create or replace function public.set_spiritual_gifts_results_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editor uuid;
begin
  new.updated_at := now();
  select id into editor from public.people where auth_user_id = auth.uid() limit 1;
  if editor is not null then
    new.last_edited_by := editor;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spiritual_gifts_results_audit on public.spiritual_gifts_results;
create trigger trg_spiritual_gifts_results_audit
  before insert or update on public.spiritual_gifts_results
  for each row execute function public.set_spiritual_gifts_results_audit();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.spiritual_gifts_results enable row level security;

drop policy if exists spiritual_gifts_results_select on public.spiritual_gifts_results;
create policy spiritual_gifts_results_select on public.spiritual_gifts_results
for select to authenticated using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
  or person_id in (select public.my_downline_ids())
);

drop policy if exists spiritual_gifts_results_insert on public.spiritual_gifts_results;
create policy spiritual_gifts_results_insert on public.spiritual_gifts_results
for insert to authenticated with check (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

drop policy if exists spiritual_gifts_results_update on public.spiritual_gifts_results;
create policy spiritual_gifts_results_update on public.spiritual_gifts_results
for update to authenticated
using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
)
with check (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

drop policy if exists spiritual_gifts_results_delete on public.spiritual_gifts_results;
create policy spiritual_gifts_results_delete on public.spiritual_gifts_results
for delete to authenticated using (
  person_id = public.current_person_id()
  or public.current_person_is_admin()
);

grant select, insert, update, delete on public.spiritual_gifts_results to authenticated;
