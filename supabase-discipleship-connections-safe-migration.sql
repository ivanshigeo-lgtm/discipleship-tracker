-- SAFE Discipleship Connections Migration
-- Run this whole script in Supabase SQL Editor.
-- It works whether the discipleship_connections table already exists or not.

create table if not exists discipleship_connections (
  id uuid primary key default gen_random_uuid(),
  discipler_person_id uuid not null references people(id) on delete cascade,
  disciple_person_id uuid references people(id) on delete cascade,
  disciple_name text not null,
  relationship_notes text,
  status text not null default 'Identified' check (status in ('Identified', 'One2One Started', 'Actively Discipling')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table discipleship_connections
add column if not exists disciple_person_id uuid references people(id) on delete cascade;

alter table discipleship_connections enable row level security;

drop policy if exists "Enable read access" on discipleship_connections;
create policy "Enable read access"
on discipleship_connections
for select
using (true);

drop policy if exists "Enable insert access" on discipleship_connections;
create policy "Enable insert access"
on discipleship_connections
for insert
with check (true);

drop policy if exists "Enable update access" on discipleship_connections;
create policy "Enable update access"
on discipleship_connections
for update
using (true)
with check (true);

drop policy if exists "Enable delete access" on discipleship_connections;
create policy "Enable delete access"
on discipleship_connections
for delete
using (true);

create index if not exists idx_discipleship_connections_discipler_person_id
on discipleship_connections(discipler_person_id);

create index if not exists idx_discipleship_connections_disciple_person_id
on discipleship_connections(disciple_person_id);

create index if not exists idx_discipleship_connections_status
on discipleship_connections(status);

create unique index if not exists idx_discipleship_connections_unique_disciple_person
on discipleship_connections(disciple_person_id)
where disciple_person_id is not null;
