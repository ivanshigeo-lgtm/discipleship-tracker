-- Cancel / Reschedule meetings — native-first feature, web inherits shared schema.
-- Two changes:
--   1. engagements.status may now be 'Cancelled' (1:1 meeting that didn't happen).
--   2. New group_meeting_status table: per-occurrence cancel/reschedule for a
--      recurring Grace Group meeting (groups have no per-occurrence row otherwise;
--      occurrences are generated from victory_groups.meeting_day/time).
-- A "Cancelled" meeting STAYS visible on its day with a red badge; it is excluded
-- from overdue / needs-attention / attendance prompts. "All repeated events"
-- reschedule for a group edits victory_groups.meeting_day/time directly (shifts
-- every future occurrence), so only the this-occurrence case lands here.

-- 1. Allow 'Cancelled' on engagements.status.
alter table public.engagements
  drop constraint if exists engagements_status_check;
alter table public.engagements
  add constraint engagements_status_check
  check (status in ('Pending', 'Completed', 'Cancelled'));

-- 2. Per-occurrence group meeting status.
create table if not exists public.group_meeting_status (
  id                   uuid primary key default gen_random_uuid(),
  victory_group_id     uuid not null references public.victory_groups(id) on delete cascade,
  meeting_date         date not null,              -- the ORIGINAL occurrence date
  status               text not null check (status in ('cancelled', 'rescheduled')),
  rescheduled_to       date,                       -- new date when status='rescheduled'
  rescheduled_time     time,                       -- new time-of-day (optional)
  note                 text,
  created_by_person_id uuid references public.people(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (victory_group_id, meeting_date)
);

create index if not exists idx_group_meeting_status_group
  on public.group_meeting_status (victory_group_id);

-- RLS mirrors group_attendance: any authenticated user may read; only the group
-- owner (or admin) may write. can_manage_group() short-circuits true for admins.
alter table public.group_meeting_status enable row level security;

drop policy if exists group_meeting_status_sel on public.group_meeting_status;
create policy group_meeting_status_sel on public.group_meeting_status
  for select to authenticated using (true);

drop policy if exists group_meeting_status_write on public.group_meeting_status;
create policy group_meeting_status_write on public.group_meeting_status
  for all to authenticated
  using (public.can_manage_group(victory_group_id))
  with check (public.can_manage_group(victory_group_id));
