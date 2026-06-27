-- Pipeline events: log each stage transition so we can measure velocity
-- (time-in-stage, transitions per period) going forward.

create table if not exists pipeline_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  created_at timestamptz not null default now()
);

alter table pipeline_events enable row level security;
drop policy if exists "Allow all operations on pipeline_events" on pipeline_events;
create policy "Allow all operations on pipeline_events" on pipeline_events for all using (true);

create index if not exists idx_pipeline_events_person on pipeline_events(person_id);
create index if not exists idx_pipeline_events_created on pipeline_events(created_at);
