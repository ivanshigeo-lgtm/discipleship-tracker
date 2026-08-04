-- merge_people(keep, dup): fold a duplicate person into the keeper in ONE
-- transaction, then delete the duplicate. Encodes the proven Aug 3 2026
-- mass-merge recipe (6 pairs, prod). Called only via the service role from
-- POST /api/people/merge — execute is revoked from client roles below.
--
-- Merge rules (confirmed by Jonavan, Aug 3):
--   - oldest primary discipler stays primary; ux_conn_one_primary means the
--     incoming primary MUST be demoted before repointing or the tx rolls back
--   - HIGHER stage wins (Engage < Establish < Equip < Empower)
--   - fullest (longest) name wins
--   - keeper's missing email/phone back-filled from the duplicate; a second
--     differing phone is preserved as an "Alt phone:" note
--   - a one-line audit note is appended to the keeper
--   - refuses to merge two CLAIMED profiles (both auth_user_id set); if only
--     the duplicate is claimed, the login moves to the keeper

create or replace function public.merge_people(p_keep uuid, p_dup uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_row people%rowtype;
  dup_row people%rowtype;
  stage_rank constant text[] := array['Engage','Establish','Equip','Empower'];
  moved_auth uuid;
  leftover text;
begin
  if p_keep = p_dup then
    raise exception 'cannot merge a person into themselves';
  end if;
  select * into keep_row from people where id = p_keep;
  if not found then raise exception 'keeper not found'; end if;
  select * into dup_row from people where id = p_dup;
  if not found then raise exception 'duplicate not found'; end if;
  if keep_row.auth_user_id is not null and dup_row.auth_user_id is not null then
    raise exception 'both profiles have sign-in accounts — merging two claimed profiles is not supported';
  end if;

  -- If the duplicate holds the login, release it now (ux_people_auth_user_id
  -- is unique) and hand it to the keeper after the duplicate row is gone.
  if dup_row.auth_user_id is not null then
    moved_auth := dup_row.auth_user_id;
    update people set auth_user_id = null where id = p_dup;
  end if;

  -- connections: drop dup conns whose discipler already has one to the keeper
  delete from discipleship_connections c
    where c.disciple_person_id = p_dup
      and exists (select 1 from discipleship_connections x
                  where x.disciple_person_id = p_keep and x.discipler_person_id = c.discipler_person_id);
  -- self-pair conns (dup coached keep or vice versa) would become self-loops
  delete from discipleship_connections
    where (disciple_person_id = p_dup and discipler_person_id = p_keep)
       or (disciple_person_id = p_keep and discipler_person_id = p_dup);
  -- demote the incoming primary BEFORE repointing (ux_conn_one_primary: one per disciple)
  update discipleship_connections c set is_primary = false
    where c.disciple_person_id = p_dup and c.is_primary
      and exists (select 1 from discipleship_connections x
                  where x.disciple_person_id = p_keep and x.is_primary);
  update discipleship_connections set disciple_person_id = p_keep where disciple_person_id = p_dup;
  update discipleship_connections set discipler_person_id = p_keep where discipler_person_id = p_dup;
  -- keep only the oldest primary discipler
  update discipleship_connections c set is_primary = false
    where c.disciple_person_id = p_keep and c.is_primary
      and c.created_at > (select min(x.created_at) from discipleship_connections x
                          where x.disciple_person_id = p_keep and x.is_primary);

  -- group memberships: dedupe then repoint
  delete from person_victory_groups g
    where g.person_id = p_dup
      and exists (select 1 from person_victory_groups x
                  where x.person_id = p_keep and x.victory_group_id = g.victory_group_id);
  update person_victory_groups set person_id = p_keep where person_id = p_dup;

  -- checklist: dedupe on stage+label then repoint
  delete from stage_checklist_items s
    where s.person_id = p_dup
      and exists (select 1 from stage_checklist_items x
                  where x.person_id = p_keep and x.stage = s.stage and x.label = s.label);
  update stage_checklist_items set person_id = p_keep where person_id = p_dup;

  -- sign-offs: dedupe per stage then repoint
  delete from level_signoffs s
    where s.person_id = p_dup
      and exists (select 1 from level_signoffs x
                  where x.person_id = p_keep and x.stage = s.stage);
  update level_signoffs set person_id = p_keep where person_id = p_dup;
  update level_signoffs set approved_by = p_keep where approved_by = p_dup;

  -- viewer-personal / uniquely-keyed tables: dedupe against the keeper first
  delete from feed_item_states f
    where f.person_id = p_dup
      and exists (select 1 from feed_item_states x
                  where x.person_id = p_keep and x.target_type = f.target_type and x.target_id = f.target_id);
  update feed_item_states set person_id = p_keep where person_id = p_dup;
  delete from blocked_people
    where (blocker_person_id = p_keep and blocked_person_id = p_dup)
       or (blocker_person_id = p_dup and blocked_person_id = p_keep);
  delete from blocked_people b
    where b.blocker_person_id = p_dup
      and exists (select 1 from blocked_people x
                  where x.blocker_person_id = p_keep and x.blocked_person_id = b.blocked_person_id);
  update blocked_people set blocker_person_id = p_keep where blocker_person_id = p_dup;
  delete from blocked_people b
    where b.blocked_person_id = p_dup
      and exists (select 1 from blocked_people x
                  where x.blocked_person_id = p_keep and x.blocker_person_id = b.blocker_person_id);
  update blocked_people set blocked_person_id = p_keep where blocked_person_id = p_dup;
  delete from conversation_members m
    where m.person_id = p_dup
      and exists (select 1 from conversation_members x
                  where x.person_id = p_keep and x.conversation_id = m.conversation_id);
  update conversation_members set person_id = p_keep where person_id = p_dup;
  delete from isoap_links l
    where l.wc_person_id = p_dup
      and exists (select 1 from isoap_links x where x.wc_person_id = p_keep);
  update isoap_links set wc_person_id = p_keep where wc_person_id = p_dup;
  update isoap_entry_visibility set wc_person_id = p_keep where wc_person_id = p_dup;
  delete from google_calendar_tokens t
    where t.person_id = p_dup
      and exists (select 1 from google_calendar_tokens x where x.person_id = p_keep);
  update google_calendar_tokens set person_id = p_keep where person_id = p_dup;
  delete from group_attendance a
    where a.person_id = p_dup
      and exists (select 1 from group_attendance x
                  where x.person_id = p_keep and x.victory_group_id = a.victory_group_id and x.meeting_date = a.meeting_date);
  update group_attendance set person_id = p_keep where person_id = p_dup;
  delete from engagement_participants e
    where e.person_id = p_dup
      and exists (select 1 from engagement_participants x
                  where x.person_id = p_keep and x.engagement_id = e.engagement_id);
  update engagement_participants set person_id = p_keep where person_id = p_dup;
  -- person_priorities is unique on (coach, person); drop pairs between the two
  -- people and rows that would collide with the keeper's, then repoint
  delete from person_priorities
    where (coach_person_id = p_keep and person_id = p_dup)
       or (coach_person_id = p_dup and person_id = p_keep);
  delete from person_priorities pr
    where pr.person_id = p_dup
      and exists (select 1 from person_priorities x
                  where x.person_id = p_keep and x.coach_person_id = pr.coach_person_id);
  update person_priorities set person_id = p_keep where person_id = p_dup;
  delete from person_priorities pr
    where pr.coach_person_id = p_dup
      and exists (select 1 from person_priorities x
                  where x.coach_person_id = p_keep and x.person_id = pr.person_id);
  update person_priorities set coach_person_id = p_keep where coach_person_id = p_dup;

  -- plain history/content tables: straight repoint
  update pipeline_events set person_id = p_keep where person_id = p_dup;
  update prayer_requests set person_id = p_keep where person_id = p_dup;
  update prayer_requests set created_by_person_id = p_keep where created_by_person_id = p_dup;
  update engagements set person_id = p_keep where person_id = p_dup;
  update engagements set created_by_person_id = p_keep where created_by_person_id = p_dup;
  update soap_journals set person_id = p_keep where person_id = p_dup;
  update messages set from_person_id = p_keep where from_person_id = p_dup;
  update messages set to_person_id = p_keep where to_person_id = p_dup;
  update conversation_messages set sender_id = p_keep where sender_id = p_dup;
  update assessment_scans set person_id = p_keep where person_id = p_dup;
  update assessment_scans set scanned_by = p_keep where scanned_by = p_dup;
  update big_five_results set person_id = p_keep where person_id = p_dup;
  update big_five_results set last_edited_by = p_keep where last_edited_by = p_dup;
  update passion_results set person_id = p_keep where person_id = p_dup;
  update passion_results set last_edited_by = p_keep where last_edited_by = p_dup;
  update spiritual_gifts_results set person_id = p_keep where person_id = p_dup;
  update spiritual_gifts_results set last_edited_by = p_keep where last_edited_by = p_dup;
  update ministry_fit_results set person_id = p_keep where person_id = p_dup;
  update booklet_progress set person_id = p_keep where person_id = p_dup;
  update content_reports set reporter_person_id = p_keep where reporter_person_id = p_dup;
  update invite_tokens set person_id = p_keep where person_id = p_dup;
  update victory_groups set owner_person_id = p_keep where owner_person_id = p_dup;
  update group_meeting_status set created_by_person_id = p_keep where created_by_person_id = p_dup;
  update people set last_edited_by = p_keep where last_edited_by = p_dup and id <> p_dup;
  -- victory_groups.last_edited_by is trigger-managed; a direct update would be
  -- overwritten, but the FK still needs clearing before the delete
  update victory_groups set last_edited_by = null where last_edited_by = p_dup;

  -- future-proofing: if a table added after this migration still references the
  -- duplicate, fail loudly (rolling everything back) instead of orphaning data
  declare
    fk record;
    has_ref boolean;
  begin
    for fk in
      select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and ccu.table_name = 'people' and ccu.column_name = 'id'
        and not (tc.table_name = 'people' and kcu.column_name = 'last_edited_by')
    loop
      execute format('select exists (select 1 from public.%I where %I = $1)',
                     fk.table_name, fk.column_name)
        into has_ref using p_dup;
      if has_ref then
        leftover := concat_ws(', ', leftover, fk.table_name || '.' || fk.column_name);
      end if;
    end loop;
  end;
  if leftover is not null then
    raise exception 'merge would orphan rows still pointing at the duplicate: %', leftover;
  end if;

  -- back-fill contact from the duplicate; keep a differing second phone
  update people k set
    email = coalesce(nullif(k.email, ''), nullif(dup_row.email, '')),
    phone = coalesce(nullif(k.phone, ''), nullif(dup_row.phone, '')),
    victory_group_id = coalesce(k.victory_group_id, dup_row.victory_group_id),
    spiritual_birthday = coalesce(k.spiritual_birthday, dup_row.spiritual_birthday),
    baptism_date = coalesce(k.baptism_date, dup_row.baptism_date),
    testimony_text = coalesce(k.testimony_text, dup_row.testimony_text),
    testimony_video_url = coalesce(k.testimony_video_url, dup_row.testimony_video_url)
    where k.id = p_keep;
  if nullif(keep_row.phone, '') is not null and nullif(dup_row.phone, '') is not null
     and keep_row.phone <> dup_row.phone then
    update people set notes = coalesce(notes, '')
        || case when coalesce(notes, '') = '' then '' else chr(10) end
        || 'Alt phone: ' || dup_row.phone
      where id = p_keep;
  end if;

  -- higher stage wins
  if coalesce(array_position(stage_rank, dup_row.current_stage), 0)
     > coalesce(array_position(stage_rank, keep_row.current_stage), 0) then
    update people set current_stage = dup_row.current_stage where id = p_keep;
  end if;

  -- fullest name wins
  if length(trim(coalesce(dup_row.name, ''))) > length(trim(coalesce(keep_row.name, ''))) then
    update people set name = dup_row.name where id = p_keep;
  end if;

  -- audit trail on the keeper
  update people set notes = coalesce(notes, '')
      || case when coalesce(notes, '') = '' then '' else chr(10) end
      || 'Merged duplicate profile "' || coalesce(dup_row.name, '?') || '"'
      || coalesce(' <' || nullif(dup_row.email, '') || '>', '')
      || ' (created ' || to_char(dup_row.created_at, 'Mon DD YYYY') || ') on '
      || to_char(now(), 'Mon DD YYYY')
    where id = p_keep;

  delete from people where id = p_dup;

  if moved_auth is not null then
    update people set auth_user_id = moved_auth where id = p_keep;
  end if;

  return jsonb_build_object('ok', true, 'kept', p_keep, 'removed', p_dup,
                            'movedLogin', moved_auth is not null);
end;
$$;

revoke execute on function public.merge_people(uuid, uuid) from public, anon, authenticated;
