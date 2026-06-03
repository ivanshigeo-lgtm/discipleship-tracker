-- Grace Groups update policy
-- Run this once in Supabase SQL Editor if editing a Grace Group shows:
-- "Cannot coerce the result to a single JSON object" or the group does not save.

alter table victory_groups enable row level security;

drop policy if exists "Enable update access" on victory_groups;
create policy "Enable update access"
on victory_groups
for update
using (true)
with check (true);
