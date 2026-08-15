-- Close the client-write holes on the two server-owned flags.
--
-- cont53 closed is_admin against UPDATE with a BEFORE UPDATE trigger and stopped
-- there. Probing as a real authenticated coach (rolled-back txn, impersonating via
-- set_config('request.jwt.claims', …)) found the UPDATE path shut and FOUR others open:
--
--   1. people INSERT with is_admin = true          -> FULL ADMIN ESCALATION
--   2. people.is_test  UPDATE                      -> hide/expose rows, pollute reporting
--   3. victory_groups.is_test UPDATE               -> same, on a table nobody had checked
--   4. people INSERT with is_test = true           -> create rows hidden from real viewers
--
-- (1) is the serious one and is reachable in two ordinary statements. ux_people_auth_user_id
-- is unique, so a second row cannot be bound to an auth id that is already taken — but a
-- coach may null out their OWN row's auth_user_id, which frees the slot:
--
--     update people set auth_user_id = null where id = <my own row>;      -- allowed by RLS
--     insert into people (…, is_admin, auth_user_id) values (…, true, <my sub>);
--
-- app/api/leader-review/route.ts:47 then resolves the viewer with
-- .eq('auth_user_id', user.id).maybeSingle() and gets back is_admin = true — which hands
-- over the full cross-coach team grid, plus church-wide broadcast, people/merge,
-- visit-stats and set-primary-coach.
--
-- Neither repo ever writes is_admin or is_test from the client (both are omitted from the
-- createPerson signature and no insert sets them), so refusing the write outright costs
-- nothing legitimate. service_role is untouched — it is how these flags are set for real.
--
-- NOT changed here, and deliberately: a coach can still null out their own row's
-- auth_user_id. With is_admin/is_test blocked on insert that is no longer an escalation
-- path, only self-inflicted profile churn, and auth_user_id is written by the
-- claim-profile / signup-complete / merge flows whose service_role paths would need
-- auditing first. Flagged, not silently narrowed.

create or replace function public.guard_people_flags()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin then
      raise exception 'is_admin cannot be set from the client'
        using errcode = '42501';
    end if;
    if new.is_test then
      raise exception 'is_test cannot be set from the client'
        using errcode = '42501';
    end if;
  else
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin cannot be changed from the client'
        using errcode = '42501';
    end if;
    if new.is_test is distinct from old.is_test then
      raise exception 'is_test cannot be changed from the client'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Supersedes cont53's guard_is_admin, which covered UPDATE only.
drop trigger if exists guard_is_admin on public.people;
drop trigger if exists guard_people_flags on public.people;
create trigger guard_people_flags
before insert or update on public.people
for each row execute function public.guard_people_flags();

drop function if exists public.guard_is_admin();

create or replace function public.guard_group_flags()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_test then
      raise exception 'is_test cannot be set from the client'
        using errcode = '42501';
    end if;
  elsif new.is_test is distinct from old.is_test then
    raise exception 'is_test cannot be changed from the client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_group_flags on public.victory_groups;
create trigger guard_group_flags
before insert or update on public.victory_groups
for each row execute function public.guard_group_flags();
