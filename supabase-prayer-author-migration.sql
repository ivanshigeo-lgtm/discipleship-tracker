-- Prayers need an AUTHOR so we can tell apart:
--   · your Prayer Wall  — prayers YOU created for people you pray for, and
--   · Shared with Me    — prayers someone else authored and sent to you.
-- (Until now only person_id existed = who the prayer is ABOUT, not who made it.)
alter table prayer_requests add column if not exists created_by_person_id uuid references people(id);
create index if not exists idx_prayer_created_by on prayer_requests(created_by_person_id);

-- Trigger: stamp the author = the logged-in person on insert (when not provided),
-- so every new prayer records who made it. Same approach as engagements.
create or replace function public.set_prayer_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by_person_id is null then
    new.created_by_person_id := (select id from public.people where auth_user_id = auth.uid() limit 1);
  end if;
  return new;
end; $$;
drop trigger if exists prayers_set_creator on public.prayer_requests;
create trigger prayers_set_creator before insert on public.prayer_requests
  for each row execute function public.set_prayer_creator();

-- Backfill: prayers created during a meeting were made by the coach who ran it.
update prayer_requests p
set created_by_person_id = e.created_by_person_id
from engagements e
where p.engagement_id = e.id and p.created_by_person_id is null;
-- (Standalone existing prayers stay NULL = unknown author, so they won't be
--  mistaken for "sent to me"; new ones are stamped by the trigger.)
