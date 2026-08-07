-- Weekly verse sets generated from the most recent Sunday message
-- (gracebiblemaui.org series page). One row per sermon; verses is a 7-element
-- jsonb array [{ref, text, whyLine}] indexed by day-of-week (0=Sun).
-- Written only by the service-role /api/verse-week route.
create table if not exists sermon_verse_weeks (
  id uuid primary key default gen_random_uuid(),
  sermon_date date not null unique,
  sermon_title text not null,
  speaker text,
  series text,
  verses jsonb not null,
  model text,
  generated_at timestamptz not null default now()
);

alter table sermon_verse_weeks enable row level security;

create policy "sermon_verse_weeks_select" on sermon_verse_weeks
  for select to authenticated using (true);
