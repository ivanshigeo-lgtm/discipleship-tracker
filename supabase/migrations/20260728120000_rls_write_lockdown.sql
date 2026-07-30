-- RLS WRITE LOCKDOWN (Phase 1) — Constellations / WikiChurch
-- =============================================================================
-- Problem: many tables carry a permissive `using(true)` policy alongside the
-- real scoped ones. Because permissive policies are OR-combined, the `true`
-- policy grants everyone (anon key holders included) full read/write — letting
-- anyone forge level sign-offs, edit any profile/group/engagement/SOAP, etc.
--
-- This migration DROPS the wide-open write policies and enforces the existing
-- can_edit_person() gate (admin OR self OR downline) for every write. Reads are
-- kept working (SELECT stays permissive but now requires an authenticated
-- session); restricting PII reads is Phase 2 (people_directory view + app
-- repoint) so nothing that reads `people` broadly breaks yet.
--
-- Admin is FULLY preserved everywhere: can_edit_person() and
-- current_person_is_admin() both short-circuit true for is_admin users.
--
-- Service-role API routes (app/api/*) bypass RLS and are unaffected.
-- Every scoped helper already exists in prod (added for prayer_requests).
-- =============================================================================

-- ── Extra helpers ────────────────────────────────────────────────────────────

-- True if the current user owns the given group (or is admin). Group leaders
-- manage their group's membership/attendance.
create or replace function public.can_manage_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_person_is_admin()
      or exists (select 1 from public.victory_groups g
                 where g.id = gid and g.owner_person_id = public.current_person_id());
$$;

-- Conversation ids the current user is a member of.
create or replace function public.my_conversation_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select conversation_id from public.conversation_members
  where person_id = public.current_person_id();
$$;

grant execute on function public.can_manage_group(uuid)   to authenticated;
grant execute on function public.my_conversation_ids()    to authenticated;

-- =============================================================================
-- people — drop wide-open; keep scoped writes; keep reads (auth-only). PII read
-- restriction deferred to Phase 2 (directory view).
-- =============================================================================
drop policy if exists "Enable read access"        on public.people;
drop policy if exists "Anyone can view all people" on public.people;
drop policy if exists "Enable insert access"       on public.people;
drop policy if exists "Enable update access"       on public.people;
drop policy if exists "Enable delete access"       on public.people;
-- kept: "Edit own profile or downline" (UPDATE, can_edit_person(id)),
--       "Delete only downline" (DELETE, can_edit_person(id)),
--       "Authenticated users can add people" (INSERT, auth.uid() is not null)
drop policy if exists people_sel on public.people;
create policy people_sel on public.people
  for select to authenticated using (true);

-- =============================================================================
-- booklet_progress — was ALL true. Writes: self/coach/admin.
-- =============================================================================
drop policy if exists "Allow all operations on booklet_progress" on public.booklet_progress;
drop policy if exists booklet_progress_sel on public.booklet_progress;
create policy booklet_progress_sel on public.booklet_progress
  for select to authenticated using (true);
drop policy if exists booklet_progress_write on public.booklet_progress;
create policy booklet_progress_write on public.booklet_progress
  for all to authenticated
  using (public.can_edit_person(person_id))
  with check (public.can_edit_person(person_id));

-- =============================================================================
-- level_signoffs — was ALL true (forge-approval hole). Writes: self/coach/admin.
-- =============================================================================
drop policy if exists "level_signoffs all" on public.level_signoffs;
drop policy if exists level_signoffs_sel on public.level_signoffs;
create policy level_signoffs_sel on public.level_signoffs
  for select to authenticated using (true);
drop policy if exists level_signoffs_write on public.level_signoffs;
create policy level_signoffs_write on public.level_signoffs
  for all to authenticated
  using (public.can_edit_person(person_id))
  with check (public.can_edit_person(person_id));

-- =============================================================================
-- stage_checklist_items — drop wide-open; keep scoped ALL (can_edit_person);
-- keep reads.
-- =============================================================================
drop policy if exists "Enable read access"          on public.stage_checklist_items;
drop policy if exists "Enable insert access"         on public.stage_checklist_items;
drop policy if exists "Enable update access"         on public.stage_checklist_items;
drop policy if exists "Enable delete access"         on public.stage_checklist_items;
drop policy if exists "View all checklist items"     on public.stage_checklist_items;
-- kept: "Edit checklist for editable people" (ALL, can_edit_person(person_id))
drop policy if exists stage_checklist_items_sel on public.stage_checklist_items;
create policy stage_checklist_items_sel on public.stage_checklist_items
  for select to authenticated using (true);

-- =============================================================================
-- discipleship_connections — drop wide-open; keep scoped ALL (discipler); reads.
-- =============================================================================
drop policy if exists "Enable read access"    on public.discipleship_connections;
drop policy if exists "Enable insert access"  on public.discipleship_connections;
drop policy if exists "Enable update access"  on public.discipleship_connections;
drop policy if exists "Enable delete access"  on public.discipleship_connections;
drop policy if exists "View all connections"  on public.discipleship_connections;
-- kept: "Edit connections as discipler" (ALL, can_edit_person(discipler_person_id))
drop policy if exists discipleship_connections_sel on public.discipleship_connections;
create policy discipleship_connections_sel on public.discipleship_connections
  for select to authenticated using (true);

-- =============================================================================
-- engagements — drop wide-open; keep scoped ALL (can_edit_person); reads.
-- =============================================================================
drop policy if exists "Enable read access"        on public.engagements;
drop policy if exists "Enable insert access"       on public.engagements;
drop policy if exists "Enable update access"       on public.engagements;
drop policy if exists "Enable delete access"       on public.engagements;
drop policy if exists "View all engagements"       on public.engagements;
drop policy if exists "Allow update engagements"   on public.engagements;
-- kept: "Edit engagements for editable people" (ALL, can_edit_person(person_id))
drop policy if exists engagements_sel on public.engagements;
create policy engagements_sel on public.engagements
  for select to authenticated using (true);

-- =============================================================================
-- engagement_action_items — child of engagements. Write if parent editable.
-- =============================================================================
drop policy if exists "Allow all operations on engagement_action_items" on public.engagement_action_items;
drop policy if exists engagement_action_items_sel on public.engagement_action_items;
create policy engagement_action_items_sel on public.engagement_action_items
  for select to authenticated using (true);
drop policy if exists engagement_action_items_write on public.engagement_action_items;
create policy engagement_action_items_write on public.engagement_action_items
  for all to authenticated
  using (exists (select 1 from public.engagements e
                 where e.id = engagement_id and public.can_edit_person(e.person_id)))
  with check (exists (select 1 from public.engagements e
                 where e.id = engagement_id and public.can_edit_person(e.person_id)));

-- =============================================================================
-- engagement_participants — write if the participant or parent is editable.
-- =============================================================================
drop policy if exists ep_all on public.engagement_participants;
drop policy if exists engagement_participants_sel on public.engagement_participants;
create policy engagement_participants_sel on public.engagement_participants
  for select to authenticated using (true);
drop policy if exists engagement_participants_write on public.engagement_participants;
create policy engagement_participants_write on public.engagement_participants
  for all to authenticated
  using (public.can_edit_person(person_id)
         or exists (select 1 from public.engagements e
                    where e.id = engagement_id and public.can_edit_person(e.person_id)))
  with check (public.can_edit_person(person_id)
         or exists (select 1 from public.engagements e
                    where e.id = engagement_id and public.can_edit_person(e.person_id)));

-- =============================================================================
-- person_victory_groups — drop wide-open; keep scoped ALL; add group-owner mgmt.
-- =============================================================================
drop policy if exists "Enable read access"            on public.person_victory_groups;
drop policy if exists "Enable insert access"          on public.person_victory_groups;
drop policy if exists "Enable delete access"          on public.person_victory_groups;
drop policy if exists "View all group memberships"    on public.person_victory_groups;
-- kept: "Edit group membership for editable people" (ALL, can_edit_person(person_id))
drop policy if exists person_victory_groups_sel on public.person_victory_groups;
create policy person_victory_groups_sel on public.person_victory_groups
  for select to authenticated using (true);
drop policy if exists person_victory_groups_owner on public.person_victory_groups;
create policy person_victory_groups_owner on public.person_victory_groups
  for all to authenticated
  using (public.can_manage_group(victory_group_id))
  with check (public.can_manage_group(victory_group_id));

-- =============================================================================
-- victory_groups — drop wide-open ins/upd/select; keep scoped DELETE; add owner
-- scoped update + authenticated-only insert (creator sets owner).
-- =============================================================================
drop policy if exists "Enable insert access"  on public.victory_groups;
drop policy if exists "Enable update access"  on public.victory_groups;
drop policy if exists "Enable read access"    on public.victory_groups;
-- kept: "Enable delete access" (owner OR admin)
drop policy if exists victory_groups_sel on public.victory_groups;
create policy victory_groups_sel on public.victory_groups
  for select to authenticated using (true);
-- INSERT: authenticated only (creation flow may set owner_person_id in a
-- follow-up update, so we don't require owner=self at insert time). UPDATE/DELETE
-- below still restrict to owner/admin, which is where the real control matters.
drop policy if exists victory_groups_ins on public.victory_groups;
create policy victory_groups_ins on public.victory_groups
  for insert to authenticated
  with check (public.current_person_id() is not null);
drop policy if exists victory_groups_upd on public.victory_groups;
create policy victory_groups_upd on public.victory_groups
  for update to authenticated
  using (public.current_person_is_admin()
         or owner_person_id = public.current_person_id())
  with check (public.current_person_is_admin()
         or owner_person_id = public.current_person_id());

-- =============================================================================
-- group_attendance — was all true. Write: person editable OR group owner/admin.
-- =============================================================================
drop policy if exists "Enable read access"   on public.group_attendance;
drop policy if exists "Enable insert access"  on public.group_attendance;
drop policy if exists "Enable update access"  on public.group_attendance;
drop policy if exists "Enable delete access"  on public.group_attendance;
drop policy if exists group_attendance_sel on public.group_attendance;
create policy group_attendance_sel on public.group_attendance
  for select to authenticated using (true);
drop policy if exists group_attendance_write on public.group_attendance;
create policy group_attendance_write on public.group_attendance
  for all to authenticated
  using (public.can_edit_person(person_id) or public.can_manage_group(victory_group_id))
  with check (public.can_edit_person(person_id) or public.can_manage_group(victory_group_id));

-- =============================================================================
-- pipeline_events — was ALL true. Insert on stage change for self/downline/admin.
-- =============================================================================
drop policy if exists "Allow all operations on pipeline_events" on public.pipeline_events;
drop policy if exists pipeline_events_sel on public.pipeline_events;
create policy pipeline_events_sel on public.pipeline_events
  for select to authenticated using (true);
drop policy if exists pipeline_events_ins on public.pipeline_events;
create policy pipeline_events_ins on public.pipeline_events
  for insert to authenticated
  with check (public.can_edit_person(person_id));

-- =============================================================================
-- soap_archives — was ALL true. Personal archive: owner + admin only.
-- =============================================================================
drop policy if exists sa_all on public.soap_archives;
drop policy if exists soap_archives_sel on public.soap_archives;
create policy soap_archives_sel on public.soap_archives
  for select to authenticated
  using (person_id = public.current_person_id() or public.current_person_is_admin());
drop policy if exists soap_archives_write on public.soap_archives;
create policy soap_archives_write on public.soap_archives
  for all to authenticated
  using (person_id = public.current_person_id() or public.current_person_is_admin())
  with check (person_id = public.current_person_id() or public.current_person_is_admin());

-- =============================================================================
-- conversations / members / messages — was ALL true. Scope to members + admin.
-- =============================================================================
-- conversations
drop policy if exists open_conversations on public.conversations;
drop policy if exists conversations_sel on public.conversations;
create policy conversations_sel on public.conversations
  for select to authenticated
  using (id in (select public.my_conversation_ids()) or public.current_person_is_admin());
drop policy if exists conversations_ins on public.conversations;
create policy conversations_ins on public.conversations
  for insert to authenticated
  with check (public.current_person_id() is not null);
drop policy if exists conversations_mod on public.conversations;
create policy conversations_mod on public.conversations
  for update to authenticated
  using (id in (select public.my_conversation_ids()) or public.current_person_is_admin())
  with check (id in (select public.my_conversation_ids()) or public.current_person_is_admin());
drop policy if exists conversations_del on public.conversations;
create policy conversations_del on public.conversations
  for delete to authenticated
  using (id in (select public.my_conversation_ids()) or public.current_person_is_admin());

-- conversation_members
drop policy if exists open_conv_members on public.conversation_members;
drop policy if exists conversation_members_sel on public.conversation_members;
create policy conversation_members_sel on public.conversation_members
  for select to authenticated
  using (conversation_id in (select public.my_conversation_ids())
         or person_id = public.current_person_id()
         or public.current_person_is_admin());
drop policy if exists conversation_members_write on public.conversation_members;
create policy conversation_members_write on public.conversation_members
  for all to authenticated
  using (conversation_id in (select public.my_conversation_ids())
         or person_id = public.current_person_id()
         or public.current_person_is_admin())
  with check (conversation_id in (select public.my_conversation_ids())
         or person_id = public.current_person_id()
         or public.current_person_is_admin());

-- conversation_messages
drop policy if exists open_conv_messages on public.conversation_messages;
drop policy if exists conversation_messages_sel on public.conversation_messages;
create policy conversation_messages_sel on public.conversation_messages
  for select to authenticated
  using (conversation_id in (select public.my_conversation_ids()) or public.current_person_is_admin());
drop policy if exists conversation_messages_ins on public.conversation_messages;
create policy conversation_messages_ins on public.conversation_messages
  for insert to authenticated
  with check ((sender_id = public.current_person_id()
               and conversation_id in (select public.my_conversation_ids()))
              or public.current_person_is_admin());
drop policy if exists conversation_messages_del on public.conversation_messages;
create policy conversation_messages_del on public.conversation_messages
  for delete to authenticated
  using (sender_id = public.current_person_id() or public.current_person_is_admin());
