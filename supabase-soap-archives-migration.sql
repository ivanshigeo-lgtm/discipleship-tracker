-- Per-viewer archive of shared SOAPs. Archiving hides a SOAP from THIS person's
-- Shared-With-Me feed only — the SOAP is never deleted (so it stays searchable
-- by AI and untouched for its author and everyone else).
create table if not exists soap_archives (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references people(id) on delete cascade,
  soap_journal_id uuid not null references soap_journals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (person_id, soap_journal_id)
);
create index if not exists idx_soap_archives_person on soap_archives(person_id);
alter table soap_archives enable row level security;
drop policy if exists sa_all on soap_archives;
create policy sa_all on soap_archives for all using (true) with check (true);
