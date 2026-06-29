-- Level sign-offs: a coach approves a completed level before the next unlocks.
-- One row per (disciple, stage). status: 'requested' (disciple asked) →
-- 'approved' (coach signed off, with an optional congrats message).
create table if not exists level_signoffs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  stage text not null,
  status text not null default 'requested',
  congrats_message text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references people(id),
  created_at timestamptz not null default now(),
  unique (person_id, stage)
);

create index if not exists idx_level_signoffs_person on level_signoffs(person_id);
create index if not exists idx_level_signoffs_status on level_signoffs(status);

-- Matches the app's current model (anon key + open policies; RLS lockdown is a
-- separate planned migration).
alter table level_signoffs enable row level security;

drop policy if exists "level_signoffs all" on level_signoffs;
create policy "level_signoffs all" on level_signoffs
  for all using (true) with check (true);
