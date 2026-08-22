-- In-app coach notifications for WikiChurch SOAP shares, disciple messages,
-- and journey sign-off requests. Scoped to the existing coach↔disciple
-- graph (discipleship_connections) — not a church-wide firehose.
--
-- Recipients manage their own rows (read / mark read). A disciple may insert
-- a row only for a coach who actually disciples them. Engagements RLS and
-- other write policies are unchanged.
--
-- Do not apply to production from the agent. Native push is out of this
-- repo; the row shape is the payload to send later.

create table if not exists public.coach_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_person_id uuid not null references public.people(id) on delete cascade,
  actor_person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('soap_shared', 'message', 'signoff_requested')),
  target_type text not null check (target_type in ('soap', 'message', 'conversation', 'level_signoff')),
  -- text: local SOAP / message / sign-off ids are uuids; iSOAP entry ids
  -- are stored as-is so a coach notification can deep-link either source.
  target_id text not null,
  preview text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_person_id, kind, target_id)
);

create index if not exists idx_coach_notifications_inbox
  on public.coach_notifications (recipient_person_id, created_at desc);

create index if not exists idx_coach_notifications_unread
  on public.coach_notifications (recipient_person_id)
  where read_at is null;

alter table public.coach_notifications enable row level security;

drop policy if exists coach_notifications_select on public.coach_notifications;
create policy coach_notifications_select on public.coach_notifications
  for select to authenticated
  using (recipient_person_id = public.current_person_id());

drop policy if exists coach_notifications_update on public.coach_notifications;
create policy coach_notifications_update on public.coach_notifications
  for update to authenticated
  using (recipient_person_id = public.current_person_id())
  with check (recipient_person_id = public.current_person_id());

drop policy if exists coach_notifications_delete on public.coach_notifications;
create policy coach_notifications_delete on public.coach_notifications
  for delete to authenticated
  using (recipient_person_id = public.current_person_id());

drop policy if exists coach_notifications_insert on public.coach_notifications;
create policy coach_notifications_insert on public.coach_notifications
  for insert to authenticated
  with check (
    actor_person_id = public.current_person_id()
    and exists (
      select 1
      from public.discipleship_connections c
      where c.discipler_person_id = recipient_person_id
        and c.disciple_person_id = actor_person_id
        and coalesce(c.pending, false) = false
    )
  );
