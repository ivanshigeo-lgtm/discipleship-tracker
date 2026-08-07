-- Likes on Feed items (shared SOAPs / shared prayer requests). A like belongs
-- to the POST, not to any viewer's copy of it: archiving or deleting an item
-- from your own feed (feed_item_states) never removes a like, so the author
-- always sees the cumulative count their post has generated. target_id has NO
-- foreign key on purpose (same reason as feed_item_states: shared SOAP ids
-- live in the iSOAP database). SELECT is open to all signed-in members so any
-- card can show its count; only the liker may add/remove their own like.

create table if not exists public.feed_likes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  target_type text not null check (target_type in ('soap', 'prayer_request')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (person_id, target_type, target_id)
);

create index if not exists feed_likes_target_idx
  on public.feed_likes (target_type, target_id);

alter table public.feed_likes enable row level security;

drop policy if exists feed_likes_select on public.feed_likes;
create policy feed_likes_select on public.feed_likes
  for select to authenticated using (true);

drop policy if exists feed_likes_insert on public.feed_likes;
create policy feed_likes_insert on public.feed_likes
  for insert to authenticated with check (person_id = public.current_person_id());

drop policy if exists feed_likes_delete on public.feed_likes;
create policy feed_likes_delete on public.feed_likes
  for delete to authenticated using (person_id = public.current_person_id());
