-- Multiple Grace Groups per person migration
-- Run this once in Supabase SQL Editor.

create table if not exists person_victory_groups (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references people(id) on delete cascade,
  victory_group_id uuid not null references victory_groups(id) on delete cascade,
  created_at timestamptz default now(),
  unique (person_id, victory_group_id)
);

-- Preserve any existing single-group assignments from people.victory_group_id.
insert into person_victory_groups (person_id, victory_group_id)
select id, victory_group_id
from people
where victory_group_id is not null
on conflict (person_id, victory_group_id) do nothing;

alter table person_victory_groups enable row level security;

drop policy if exists "Enable read access" on person_victory_groups;
drop policy if exists "Enable insert access" on person_victory_groups;
drop policy if exists "Enable delete access" on person_victory_groups;

create policy "Enable read access"
on person_victory_groups
for select
using (true);

create policy "Enable insert access"
on person_victory_groups
for insert
with check (true);

create policy "Enable delete access"
on person_victory_groups
for delete
using (true);

create index if not exists idx_person_victory_groups_person on person_victory_groups(person_id);
create index if not exists idx_person_victory_groups_group on person_victory_groups(victory_group_id);
