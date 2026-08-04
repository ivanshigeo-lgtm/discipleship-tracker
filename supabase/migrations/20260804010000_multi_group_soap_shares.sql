-- Share a SOAP with MULTIPLE Grace Groups. isoap_entry_visibility grows a
-- victory_group_ids array; null/empty = broadcast to all the author's groups
-- (unchanged back-compat semantics). The legacy single victory_group_id column
-- stays and mirrors the first target so older readers keep working.

alter table isoap_entry_visibility
  add column if not exists victory_group_ids uuid[];

update isoap_entry_visibility
  set victory_group_ids = array[victory_group_id]
  where victory_group_id is not null and victory_group_ids is null;
