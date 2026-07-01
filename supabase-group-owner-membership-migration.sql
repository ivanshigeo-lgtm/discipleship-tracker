-- Auto-add a Grace Group's owner (creator) as an approved member of the group.
-- An owner isn't inherently a member, which meant creators didn't show as
-- "leading a group" and weren't in their own group. This backfills existing
-- owners and keeps it true going forward via a trigger.

-- 1) Backfill: every current owner who isn't already a member becomes one.
insert into person_victory_groups (person_id, victory_group_id, status)
select vg.owner_person_id, vg.id, 'approved'
from victory_groups vg
where vg.owner_person_id is not null
  and not exists (
    select 1 from person_victory_groups pvg
    where pvg.victory_group_id = vg.id
      and pvg.person_id = vg.owner_person_id
  );

-- 2) Going forward: when a group is created (or its owner changes), add the
--    owner as an approved member if they aren't one already.
create or replace function add_group_owner_as_member()
returns trigger
language plpgsql
as $$
begin
  if new.owner_person_id is not null and not exists (
    select 1 from person_victory_groups
    where victory_group_id = new.id
      and person_id = new.owner_person_id
  ) then
    insert into person_victory_groups (person_id, victory_group_id, status)
    values (new.owner_person_id, new.id, 'approved');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_add_group_owner_as_member on victory_groups;
create trigger trg_add_group_owner_as_member
after insert or update of owner_person_id on victory_groups
for each row
execute function add_group_owner_as_member();
