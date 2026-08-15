-- Momentum must count PROGRESS, not DATA ENTRY.
--
-- When a coach onboards someone they type in the person's whole history at once:
-- Paige Asato's 10 milestones and 12 One2One chapters were all entered in a single
-- 23-second session. The log stores when it was TYPED, not when it HAPPENED, so
-- onboarding reads as this week's momentum.
--
-- His rule: entered data is a BASELINE — historical, with or without a date, never
-- counted toward momentum. Only progress past that baseline is momentum.
--
-- Detection is automatic (no UI, no coach discipline) and keys off the BURST, not
-- proximity to the profile's created_at — Paige's burst was 294 hours after her
-- profile was created, so a "near signup" rule would have missed the very case that
-- started this. A completion is historical when it belongs to a rapid entry session:
--
--   milestones : >= 6 in one session, OR >= 3 that cross a 4E stage boundary
--   chapters   : >= 6 chapters logged in one session
--
-- where a session chains completions with gaps of <= 5 minutes. The argument is
-- physical, not statistical: you cannot ACHIEVE six milestones of spiritual growth
-- in under a minute, but you can type them in. Measured over the real data, the
-- 10+ bucket averages 60 seconds and spans 3.1 of the 4 stages.
--
-- achieved_on is optional — a date if the coach knows when it really happened,
-- blank if not. Either way the row is excluded from momentum. A person's journey
-- and detail views still show everything; the history is real, it just isn't momentum.

alter table public.stage_checklist_items
  add column if not exists is_historical boolean not null default false,
  add column if not exists achieved_on date;

alter table public.booklet_chapter_events
  add column if not exists is_historical boolean not null default false,
  add column if not exists achieved_on date;

comment on column public.stage_checklist_items.is_historical is
  'True when this completion was part of a bulk catch-up entry session rather than progress made that day. Excluded from momentum; still shown on the person''s journey.';
comment on column public.stage_checklist_items.achieved_on is
  'Optional real-world date the milestone was achieved, when the coach knows it. Never affects momentum.';
comment on column public.booklet_chapter_events.is_historical is
  'True when this advance was part of a bulk catch-up entry session rather than reading done that day.';
comment on column public.booklet_chapter_events.achieved_on is
  'Optional real-world date the chapters were read, when the coach knows it. Never affects momentum.';

create index if not exists stage_checklist_items_momentum_idx
  on public.stage_checklist_items (completed_at)
  where completed_at is not null and is_historical = false;

create index if not exists booklet_chapter_events_momentum_idx
  on public.booklet_chapter_events (created_at)
  where is_historical = false;

-- ---------------------------------------------------------------------------
-- Recompute: one person, all their sessions, both tables.
--
-- Recomputing the whole person (rather than just the touched row) is what makes a
-- late arrival correct: the 6th tick in a burst has to retro-mark the 5 before it.
-- People carry a few dozen rows, so this is cheap.
--
-- app.skip_hist_sync is transaction-local (set_config ..., true) and stops the
-- trigger from re-entering when these UPDATEs fire it. pg_trigger_depth() is NOT
-- usable here: the recompute can be invoked at top level, in which case its own
-- UPDATE fires the trigger back at depth 1.
-- ---------------------------------------------------------------------------

create or replace function public.recompute_historical_for_person(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.skip_hist_sync', 'on', true);

  with ordered as (
    select id, completed_at, stage,
           case when completed_at - lag(completed_at) over w <= interval '5 minutes'
                then 0 else 1 end as new_session
    from stage_checklist_items
    where person_id = p_person and completed_at is not null
    window w as (order by completed_at, id)
  ),
  grouped as (
    select id, stage,
           sum(new_session) over (order by completed_at, id
                                  rows between unbounded preceding and current row) as sid
    from ordered
  ),
  sess as (
    select sid, count(*) as n, count(distinct stage) as stages
    from grouped group by sid
  ),
  verdict as (
    select g.id, (s.n >= 6 or (s.n >= 3 and s.stages >= 2)) as hist
    from grouped g join sess s on s.sid = g.sid
  )
  update stage_checklist_items t
     set is_historical = v.hist
    from verdict v
   where t.id = v.id and t.is_historical is distinct from v.hist;

  -- An un-ticked box is never historical (and a coach un-ticking one must clear it).
  update stage_checklist_items
     set is_historical = false
   where person_id = p_person and completed_at is null and is_historical;

  with ordered as (
    select id, created_at,
           greatest(to_chapter - coalesce(from_chapter, 0), 1) as units,
           case when created_at - lag(created_at) over w <= interval '5 minutes'
                then 0 else 1 end as new_session
    from booklet_chapter_events
    where person_id = p_person
    window w as (order by created_at, id)
  ),
  grouped as (
    select id, created_at, units,
           sum(new_session) over (order by created_at, id
                                  rows between unbounded preceding and current row) as sid
    from ordered
  ),
  sess as (
    select sid, sum(units) as chapters from grouped group by sid
  ),
  verdict as (
    select g.id, (s.chapters >= 6) as hist
    from grouped g join sess s on s.sid = g.sid
  )
  update booklet_chapter_events t
     set is_historical = v.hist
    from verdict v
   where t.id = v.id and t.is_historical is distinct from v.hist;

  perform set_config('app.skip_hist_sync', 'off', true);
end;
$$;

revoke all on function public.recompute_historical_for_person(uuid) from public, anon, authenticated;

create or replace function public.trg_sync_historical()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.skip_hist_sync', true), 'off') = 'on' then
    return null;
  end if;
  perform public.recompute_historical_for_person(coalesce(new.person_id, old.person_id));
  return null;
end;
$$;

-- One trigger per table covers every write path in BOTH repos —
-- upsertStageChecklistItem, updateStageChecklistItem, the booklet_chapter_events
-- insert inside upsertBookletProgress, their journey-app mirrors, and anything
-- added later. It also makes the flag self-healing: a client that writes
-- is_historical directly is immediately corrected by the recompute.
drop trigger if exists sync_historical on public.stage_checklist_items;
create trigger sync_historical
after insert or update or delete on public.stage_checklist_items
for each row execute function public.trg_sync_historical();

drop trigger if exists sync_historical on public.booklet_chapter_events;
create trigger sync_historical
after insert or update or delete on public.booklet_chapter_events
for each row execute function public.trg_sync_historical();

-- ---------------------------------------------------------------------------
-- One-time backfill. The same rule applies retroactively, so the Aug 11 burst
-- needs no special-case migration.
-- ---------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select id from public.people
    where id in (select person_id from public.stage_checklist_items)
       or id in (select person_id from public.booklet_chapter_events)
  loop
    perform public.recompute_historical_for_person(p.id);
  end loop;
end $$;
