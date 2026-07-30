-- Primary Coach feature
-- A disciple can have multiple coaches; exactly one may be marked primary.
-- v1 drives: badge/label + getMyCoach (NOT sign-off authority, NOT constellation visibility).

-- 1. Column
alter table public.discipleship_connections
  add column if not exists is_primary boolean not null default false;

-- 2. Backfill: earliest (created_at) connection per disciple becomes primary.
--    Tie-break on id for determinism when created_at collides.
with ranked as (
  select id,
         row_number() over (
           partition by disciple_person_id
           order by created_at asc, id asc
         ) as rn
  from public.discipleship_connections
  where disciple_person_id is not null
)
update public.discipleship_connections c
set is_primary = true
from ranked r
where c.id = r.id
  and r.rn = 1
  and c.is_primary = false;

-- 3. Enforce at most one primary per disciple.
create unique index if not exists ux_conn_one_primary
  on public.discipleship_connections (disciple_person_id)
  where is_primary and disciple_person_id is not null;
