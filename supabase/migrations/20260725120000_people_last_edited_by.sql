-- Audit: record WHO last edited each person.
-- Empower-stage members (and admins) can now edit anyone in the church, so we
-- stamp the editing user on every update. A BEFORE UPDATE trigger does it in the
-- database so it can't be bypassed and covers BOTH the web and native apps (one
-- shared Supabase) with no per-call-site changes. `updated_at` already carries
-- the "when"; this adds the "who".

alter table public.people
  add column if not exists last_edited_by uuid references public.people(id) on delete set null;

comment on column public.people.last_edited_by is
  'Person who last updated this row (auto-set by trg_people_last_edited_by from auth.uid()). Null for service-role/system writes.';

create or replace function public.set_people_last_edited_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editor uuid;
begin
  -- Resolve the acting auth user to their people row. SECURITY DEFINER so the
  -- lookup succeeds regardless of RLS on people.
  select id into editor from public.people where auth_user_id = auth.uid() limit 1;
  -- Only overwrite when we can identify a real editor; service-role / system
  -- writes (auth.uid() is null) leave the prior value intact.
  if editor is not null then
    new.last_edited_by := editor;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_people_last_edited_by on public.people;
create trigger trg_people_last_edited_by
  before update on public.people
  for each row execute function public.set_people_last_edited_by();
