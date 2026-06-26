-- Grace Group ownership.
-- Each group has an owner (the creator by default). A group shows up in its
-- owner's constellation; ownership can be transferred to anyone. Existing
-- groups start with no owner (null) and are assigned by an admin.

alter table victory_groups
  add column if not exists owner_person_id uuid references people(id) on delete set null;

create index if not exists idx_victory_groups_owner on victory_groups(owner_person_id);
