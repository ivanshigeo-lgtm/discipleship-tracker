-- Audit: record WHO last edited (or created) each Grace Group.
-- Mirrors public.people.last_edited_by (20260725120000). The group card now
-- surfaces the owner and the last editor, so we stamp the acting user on every
-- write. A BEFORE INSERT OR UPDATE trigger does it in the database so it can't be
-- bypassed and covers BOTH the web and native apps (one shared Supabase) with no
-- per-call-site changes. `created_at` carries the "when created"; this adds the
-- "who last touched it". Stamped on INSERT too, so a brand-new group immediately
-- shows its creator until someone edits it.

alter table public.victory_groups
  add column if not exists last_edited_by uuid references public.people(id) on delete set null;

comment on column public.victory_groups.last_edited_by is
  'Person who last inserted/updated this row (auto-set by trg_victory_groups_last_edited_by from auth.uid()). Null for service-role/system writes.';

create or replace function public.set_victory_groups_last_edited_by()
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

drop trigger if exists trg_victory_groups_last_edited_by on public.victory_groups;
create trigger trg_victory_groups_last_edited_by
  before insert or update on public.victory_groups
  for each row execute function public.set_victory_groups_last_edited_by();
