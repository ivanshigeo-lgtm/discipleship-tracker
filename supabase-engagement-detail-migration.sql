-- Engagement detail: action points per engagement, and linking prayer/praise
-- requests back to the engagement they came out of.

-- Checkable action items for a meeting/engagement.
create table if not exists engagement_action_items (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  text text not null default '',
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table engagement_action_items enable row level security;
drop policy if exists "Allow all operations on engagement_action_items" on engagement_action_items;
create policy "Allow all operations on engagement_action_items"
  on engagement_action_items for all using (true);

create index if not exists idx_eng_action_items_eng on engagement_action_items(engagement_id);

-- Optional link from a prayer/praise to the engagement it was captured in.
alter table prayer_requests
  add column if not exists engagement_id uuid references engagements(id) on delete set null;

create index if not exists idx_prayer_engagement on prayer_requests(engagement_id);
