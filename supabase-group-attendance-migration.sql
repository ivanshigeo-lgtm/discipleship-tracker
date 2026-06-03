-- Grace Group Attendance Migration
-- Run this once in Supabase SQL Editor.

create table if not exists group_attendance (
  id uuid primary key default uuid_generate_v4(),
  victory_group_id uuid not null references victory_groups(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  meeting_date date not null,
  attended boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (victory_group_id, person_id, meeting_date)
);

alter table group_attendance enable row level security;

drop policy if exists "Enable read access" on group_attendance;
drop policy if exists "Enable insert access" on group_attendance;
drop policy if exists "Enable update access" on group_attendance;
drop policy if exists "Enable delete access" on group_attendance;

create policy "Enable read access"
on group_attendance
for select
using (true);

create policy "Enable insert access"
on group_attendance
for insert
with check (true);

create policy "Enable update access"
on group_attendance
for update
using (true)
with check (true);

create policy "Enable delete access"
on group_attendance
for delete
using (true);

create index if not exists idx_group_attendance_group on group_attendance(victory_group_id);
create index if not exists idx_group_attendance_person on group_attendance(person_id);
create index if not exists idx_group_attendance_date on group_attendance(meeting_date);
