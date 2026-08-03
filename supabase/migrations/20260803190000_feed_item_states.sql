-- Per-viewer state for items that land on someone's Feed — shared SOAPs and
-- shared prayer requests. Two states:
--   archived — tucked away, recoverable via "Show archived"
--   deleted  — permanently hidden for this viewer (never touches the author's row)
--
-- Replaces soap_archives (rows copied below; old table left in place until the
-- web app is repointed). target_id has NO foreign key on purpose: a shared SOAP
-- id can live in this database (soap_journals) or in the iSOAP database
-- (journal_entries), so no single FK fits. Viewer-personal like blocked_people:
-- RLS scopes every row to its owner.

create table if not exists public.feed_item_states (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  target_type text not null check (target_type in ('soap', 'prayer_request')),
  target_id uuid not null,
  state text not null check (state in ('archived', 'deleted')),
  created_at timestamptz not null default now(),
  unique (person_id, target_type, target_id)
);

alter table public.feed_item_states enable row level security;

drop policy if exists feed_item_states_select on public.feed_item_states;
create policy feed_item_states_select on public.feed_item_states
  for select to authenticated using (person_id = public.current_person_id());

drop policy if exists feed_item_states_insert on public.feed_item_states;
create policy feed_item_states_insert on public.feed_item_states
  for insert to authenticated with check (person_id = public.current_person_id());

drop policy if exists feed_item_states_update on public.feed_item_states;
create policy feed_item_states_update on public.feed_item_states
  for update to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());

drop policy if exists feed_item_states_delete on public.feed_item_states;
create policy feed_item_states_delete on public.feed_item_states
  for delete to authenticated using (person_id = public.current_person_id());

-- Carry existing web archives over so nobody's archived feed reappears.
insert into public.feed_item_states (person_id, target_type, target_id, state, created_at)
select person_id, 'soap', soap_journal_id, 'archived', created_at
from public.soap_archives
on conflict (person_id, target_type, target_id) do nothing;
