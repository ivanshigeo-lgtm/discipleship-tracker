-- Share a SOAP to ONE chosen Grace Group instead of broadcasting to every
-- group the author belongs to. NULL keeps the old behavior (all my groups),
-- so existing shares are untouched.
alter table isoap_entry_visibility
  add column if not exists victory_group_id uuid references victory_groups(id) on delete set null;
