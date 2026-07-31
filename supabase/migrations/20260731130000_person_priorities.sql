-- Priorities are PERSONAL, not shared. Confirmed with user (2026-07-31):
--   "Each person should be able to prioritize their own disciples in their view.
--    Because each person will prioritize different people. This feature cannot be
--    shared."
--
-- Before this, `people.priority` was a single boolean on the shared person row:
-- every coach saw the same star, and any coach with edit access overwrote it for
-- everyone. This moves priority to a per-(coach, person) table so each coach flags
-- their own disciples, invisible to others. RLS enforces it server-side — a coach
-- can only see/insert/delete their OWN rows (no admin see-all; it's personal, like
-- the author-only prayer wall). `people.priority` is left in place but deprecated;
-- older native builds still read it harmlessly, current code ignores it.

create table if not exists public.person_priorities (
  id uuid primary key default gen_random_uuid(),
  coach_person_id uuid not null references public.people(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_person_id, person_id)
);

-- Fast "does this person appear in my priorities" lookups by person too.
create index if not exists ix_person_priorities_person on public.person_priorities(person_id);

alter table public.person_priorities enable row level security;

-- A coach sees and manages ONLY their own priority flags.
drop policy if exists person_priorities_select on public.person_priorities;
create policy person_priorities_select on public.person_priorities
  for select to authenticated using (coach_person_id = public.current_person_id());

drop policy if exists person_priorities_insert on public.person_priorities;
create policy person_priorities_insert on public.person_priorities
  for insert to authenticated with check (coach_person_id = public.current_person_id());

drop policy if exists person_priorities_delete on public.person_priorities;
create policy person_priorities_delete on public.person_priorities
  for delete to authenticated using (coach_person_id = public.current_person_id());

-- Backfill: preserve the 21 existing global stars by handing each to that person's
-- PRIMARY coach (is_primary connection, falling back to the earliest connection).
-- Nobody else inherits them. A person with no coach connection is dropped (their
-- global star had no owner to give it to).
insert into public.person_priorities (coach_person_id, person_id)
select distinct on (dc.disciple_person_id)
       dc.discipler_person_id, dc.disciple_person_id
from public.people p
join public.discipleship_connections dc on dc.disciple_person_id = p.id
where p.priority = true
  and dc.discipler_person_id is not null
order by dc.disciple_person_id, dc.is_primary desc nulls last, dc.created_at asc
on conflict (coach_person_id, person_id) do nothing;
