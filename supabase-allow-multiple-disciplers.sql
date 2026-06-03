-- Allow multiple discipler connections per person
-- Run this once in Supabase SQL Editor.
-- It removes the old rule that allowed only one discipler per disciple,
-- then prevents only exact duplicate pairs.

alter table discipleship_connections enable row level security;

-- Old index from the first connection-map migration: one disciple could only have one discipler.
drop index if exists idx_discipleship_connections_unique_disciple_person;

-- If exact duplicate pairs somehow exist, keep the oldest row before adding the pair-level uniqueness rule.
delete from discipleship_connections duplicate_row
using discipleship_connections kept_row
where duplicate_row.ctid > kept_row.ctid
  and duplicate_row.discipler_person_id = kept_row.discipler_person_id
  and duplicate_row.disciple_person_id = kept_row.disciple_person_id
  and duplicate_row.disciple_person_id is not null;

-- New rule: a person can have multiple disciplers, but the same discipler/disciple pair should not be duplicated.
create unique index if not exists idx_discipleship_connections_unique_pair
on discipleship_connections(discipler_person_id, disciple_person_id)
where disciple_person_id is not null;

create index if not exists idx_discipleship_connections_disciple_person_id
on discipleship_connections(disciple_person_id);

create index if not exists idx_discipleship_connections_discipler_person_id
on discipleship_connections(discipler_person_id);
