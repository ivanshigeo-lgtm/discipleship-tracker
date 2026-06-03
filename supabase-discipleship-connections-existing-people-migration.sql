-- Discipleship Connections: connect to existing people
-- Run this if discipleship_connections already exists from the first migration.
-- This lets Identification use a dropdown from existing My Circle people instead of free-text names.

alter table discipleship_connections
add column if not exists disciple_person_id uuid references people(id) on delete cascade;

create unique index if not exists idx_discipleship_connections_unique_disciple_person
on discipleship_connections(disciple_person_id)
where disciple_person_id is not null;

create index if not exists idx_discipleship_connections_disciple_person_id
on discipleship_connections(disciple_person_id);
