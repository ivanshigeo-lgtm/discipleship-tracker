-- Booklet chapter progress — powers the "time to Empowered leader" forecast.
-- One row per person per booklet, holding the chapter they're currently on.
-- Coaches set current_chapter manually as a leader progresses.

create table if not exists booklet_progress (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  booklet text not null,
  current_chapter integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (person_id, booklet)
);

alter table booklet_progress enable row level security;

-- Matches the open-access policy style used across this app's tables.
drop policy if exists "Allow all operations on booklet_progress" on booklet_progress;
create policy "Allow all operations on booklet_progress"
  on booklet_progress for all using (true);

create index if not exists idx_booklet_progress_person on booklet_progress(person_id);
