-- App Store guideline 1.2 (UGC): users must be able to report objectionable
-- content and block abusive users. Two tables:
--
--   content_reports — a user flags a piece of content (prayer request today;
--     target_type leaves room for messages/SOAP later). Reporters see only
--     their own reports; admins review all (web/service-role for now).
--   blocked_people — personal block list. Blocking hides ALL of the blocked
--     person's content from the blocker (client filters prayer walls and
--     messages by this list). Personal like person_priorities: no admin
--     see-all, each person manages only their own rows.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_person_id uuid not null references public.people(id) on delete cascade,
  target_type text not null check (target_type in ('prayer_request', 'message', 'soap_journal')),
  target_id uuid not null,
  reason text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_person_id, target_type, target_id)
);

alter table public.content_reports enable row level security;

drop policy if exists content_reports_select on public.content_reports;
create policy content_reports_select on public.content_reports
  for select to authenticated using (reporter_person_id = public.current_person_id());

drop policy if exists content_reports_insert on public.content_reports;
create policy content_reports_insert on public.content_reports
  for insert to authenticated with check (reporter_person_id = public.current_person_id());

create table if not exists public.blocked_people (
  id uuid primary key default gen_random_uuid(),
  blocker_person_id uuid not null references public.people(id) on delete cascade,
  blocked_person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_person_id, blocked_person_id),
  check (blocker_person_id <> blocked_person_id)
);

alter table public.blocked_people enable row level security;

drop policy if exists blocked_people_select on public.blocked_people;
create policy blocked_people_select on public.blocked_people
  for select to authenticated using (blocker_person_id = public.current_person_id());

drop policy if exists blocked_people_insert on public.blocked_people;
create policy blocked_people_insert on public.blocked_people
  for insert to authenticated with check (blocker_person_id = public.current_person_id());

drop policy if exists blocked_people_delete on public.blocked_people;
create policy blocked_people_delete on public.blocked_people
  for delete to authenticated using (blocker_person_id = public.current_person_id());
