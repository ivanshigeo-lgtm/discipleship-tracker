-- 4E Stage Checklist Migration
-- Run this once in Supabase SQL Editor.

create table if not exists stage_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references people(id) on delete cascade,
  stage text not null check (stage in ('Engage', 'Establish', 'Equip', 'Empower')),
  category text not null check (category in ('Tool', 'Action Step')),
  label text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (person_id, stage, category, label)
);

alter table stage_checklist_items enable row level security;

drop policy if exists "Enable read access" on stage_checklist_items;
drop policy if exists "Enable insert access" on stage_checklist_items;
drop policy if exists "Enable update access" on stage_checklist_items;
drop policy if exists "Enable delete access" on stage_checklist_items;

create policy "Enable read access"
on stage_checklist_items
for select
using (true);

create policy "Enable insert access"
on stage_checklist_items
for insert
with check (true);

create policy "Enable update access"
on stage_checklist_items
for update
using (true)
with check (true);

create policy "Enable delete access"
on stage_checklist_items
for delete
using (true);

create index if not exists idx_stage_checklist_person on stage_checklist_items(person_id);
create index if not exists idx_stage_checklist_stage on stage_checklist_items(stage);
