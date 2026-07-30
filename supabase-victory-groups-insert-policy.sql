-- Grace Group INSERT policy — signed-in coaches can create groups they own.
-- Run this ONCE in the Supabase SQL Editor ONLY IF creating a group in the app
-- fails with an RLS error. The web app already inserts groups client-side, so a
-- permissive insert policy is expected to exist in prod; this is a safety net.
--
-- Mirrors the auth_user_id = auth.uid() ownership pattern used by the delete
-- policy (supabase-group-delete-policy.sql): the new group's owner_person_id
-- must map to the signed-in user's person row, OR the user is an admin. The
-- anon key alone (no signed-in user) cannot insert.

alter table victory_groups enable row level security;

drop policy if exists "Enable insert access" on victory_groups;
create policy "Enable insert access"
on victory_groups
for insert
with check (
  owner_person_id in (select id from people where auth_user_id = auth.uid())
  or exists (select 1 from people where auth_user_id = auth.uid() and is_admin = true)
);
