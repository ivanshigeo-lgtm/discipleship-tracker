-- Paper assessment photo-scan (feature step 3, Aug 2 2026). A coach photographs
-- the printed packet (sheets G1/G2/B1/P1 from /print/assessments);
-- /api/assessments/scan parses + scores the photos, the leader reviews and
-- confirms, and /api/assessments/commit writes the three result tables plus one
-- row here recording the scan itself (photo refs + the exec summary shown at
-- commit time).

create table if not exists public.assessment_scans (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  scanned_by uuid references public.people(id) on delete set null,
  pages jsonb not null default '[]'::jsonb,   -- [{code:'G1', path:'<assessment-scans storage path>'}]
  responses jsonb,                            -- confirmed answers snapshot {gifts, bigFive, passion}
  summary text,                               -- ministry-fit exec summary at commit time
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ix_assessment_scans_person on public.assessment_scans(person_id);

alter table public.assessment_scans enable row level security;

-- Reads follow the app's current Phase-1 posture (open to signed-in users;
-- Phase 2 will tighten PII reads app-wide). Writes are service-role only — no
-- insert/update/delete policies on purpose.
drop policy if exists assessment_scans_select on public.assessment_scans;
create policy assessment_scans_select on public.assessment_scans
  for select to authenticated using (true);

-- Private bucket for the page photos. No storage.objects policies on purpose —
-- only the service-role API routes read/write it.
insert into storage.buckets (id, name, public)
values ('assessment-scans', 'assessment-scans', false)
on conflict (id) do nothing;
