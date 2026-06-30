-- Multi-person meetings with an invite / confirm flow.
--
-- Model:
--   * A meeting's OWNER is its creator (engagements.created_by_person_id). It is
--     always on the owner's engagement page.
--   * A meeting can include multiple other people — its participants.
--   * Each participant is INVITED and must CONFIRM before the meeting appears on
--     their own engagement page (they may also DECLINE).
--
-- engagement_participants is the source of truth for who is in a meeting and
-- whether they've confirmed.

create table if not exists engagement_participants (
  id uuid primary key default uuid_generate_v4(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  status text not null default 'invited',          -- invited | confirmed | declined
  created_at timestamptz not null default now(),
  unique (engagement_id, person_id)
);

create index if not exists idx_ep_person on engagement_participants(person_id);
create index if not exists idx_ep_engagement on engagement_participants(engagement_id);

-- Match the project's open-RLS pattern (enforcement is UI/route-level).
alter table engagement_participants enable row level security;
drop policy if exists ep_all on engagement_participants;
create policy ep_all on engagement_participants for all using (true) with check (true);

-- Migrate existing meetings: each meeting's current person_id becomes a
-- CONFIRMED participant, so established meetings keep showing without anyone
-- having to re-confirm them.
insert into engagement_participants (engagement_id, person_id, status)
select e.id, e.person_id, 'confirmed'
from engagements e
where e.person_id is not null
on conflict (engagement_id, person_id) do nothing;
