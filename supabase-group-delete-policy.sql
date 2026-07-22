-- Grace Group DELETE policy — owner or admin only, enforced at the database.
-- Run this once in Supabase SQL Editor.
--
-- victory_groups has RLS enabled (see supabase-victory-groups-update-policy.sql)
-- with read/insert/update policies, but NO delete policy — so a client DELETE
-- silently affects 0 rows (returns 200, row stays). This adds a delete policy
-- that only permits the group's OWNER (their auth account maps to the owner
-- person row) or an ADMIN to delete it — real server-side enforcement, the same
-- auth_user_id = auth.uid() pattern used by messages / soap_journals / engagements.
-- The anon key alone (no signed-in user) cannot delete anything.
--
-- Cleanup on delete is automatic: person_victory_groups and group_attendance both
-- FK-reference victory_groups(id) ON DELETE CASCADE. FK cascades run as the table
-- owner and bypass RLS, so memberships and attendance are removed with the group
-- even though those tables' own policies are permissive. The app also nulls
-- people.victory_group_id (legacy single-group pointer) defensively before deleting.

alter table victory_groups enable row level security;

drop policy if exists "Enable delete access" on victory_groups;
create policy "Enable delete access"
on victory_groups
for delete
using (
  owner_person_id in (select id from people where auth_user_id = auth.uid())
  or exists (select 1 from people where auth_user_id = auth.uid() and is_admin = true)
);

-- One-off cleanup: remove the ownerless probe row left by the RLS diagnostic.
delete from victory_groups
where name = '__rls_delete_probe__' and owner_person_id is null;
