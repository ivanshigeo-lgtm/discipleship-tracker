-- Finite recurring engagement series: group sibling occurrence rows and
-- remember that the owner already saw the "last meeting" prompt.
--
-- engagements.series_id is a shared grouping key (not a parent table). New
-- series stamp it on create/extend. Existing production rows stay null; the
-- web app still detects those as a series via a same-owner / same-person /
-- same-description / same-time cadence heuristic.
--
-- Standing victory_groups are unchanged — they are not a finite series.
--
-- Do not weaken engagements RLS. series_id is just another column on a table
-- that already gates writes with can_edit_person(person_id).
-- Acks are viewer-personal, same pattern as feed_item_states.

alter table public.engagements
  add column if not exists series_id uuid;

-- When a 1:1 is cancelled. Used to hide it from the default list after 24h
-- without deleting the row. Reopening clears this.
alter table public.engagements
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_engagements_series_id
  on public.engagements (series_id)
  where series_id is not null;

create table if not exists public.engagement_series_end_acks (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (person_id, engagement_id)
);

create index if not exists idx_engagement_series_end_acks_person
  on public.engagement_series_end_acks (person_id);

alter table public.engagement_series_end_acks enable row level security;

drop policy if exists engagement_series_end_acks_select on public.engagement_series_end_acks;
create policy engagement_series_end_acks_select on public.engagement_series_end_acks
  for select to authenticated using (person_id = public.current_person_id());

drop policy if exists engagement_series_end_acks_insert on public.engagement_series_end_acks;
create policy engagement_series_end_acks_insert on public.engagement_series_end_acks
  for insert to authenticated with check (person_id = public.current_person_id());

drop policy if exists engagement_series_end_acks_update on public.engagement_series_end_acks;
create policy engagement_series_end_acks_update on public.engagement_series_end_acks
  for update to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());

drop policy if exists engagement_series_end_acks_delete on public.engagement_series_end_acks;
create policy engagement_series_end_acks_delete on public.engagement_series_end_acks
  for delete to authenticated using (person_id = public.current_person_id());
