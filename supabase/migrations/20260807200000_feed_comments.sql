-- Public comments on Feed items (shared SOAPs / shared prayer requests).
-- A comment belongs to the POST, like feed_likes: archiving or deleting an
-- item from your own feed (feed_item_states) never removes comments, and
-- target_id has NO foreign key (shared SOAP ids live in the iSOAP database).
-- SELECT is open to all signed-in members — same stance as feed_likes: the
-- app only surfaces comments under cards the viewer's merged feed already
-- shows, and every authenticated user is a church member. Authors may edit
-- nothing but may delete their own comment; the POST author may also delete
-- comments under their post (moderation) via is_hidden, and anyone may flag.

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  target_type text not null check (target_type in ('soap', 'prayer_request')),
  target_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  is_hidden boolean not null default false,
  flagged_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists feed_comments_target_idx
  on public.feed_comments (target_type, target_id, created_at);

alter table public.feed_comments enable row level security;

drop policy if exists feed_comments_select on public.feed_comments;
create policy feed_comments_select on public.feed_comments
  for select to authenticated using (true);

drop policy if exists feed_comments_insert on public.feed_comments;
create policy feed_comments_insert on public.feed_comments
  for insert to authenticated with check (person_id = public.current_person_id());

-- update: only flagging (append your own id) and hiding are done through
-- RPCs below; direct updates stay closed.

drop policy if exists feed_comments_delete on public.feed_comments;
create policy feed_comments_delete on public.feed_comments
  for delete to authenticated using (person_id = public.current_person_id());

-- Flag a comment for moderation. Any member may flag; flagging twice is a
-- no-op. Hides the comment once flagged (conservative: UGC review gate).
create or replace function public.flag_feed_comment(p_comment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.feed_comments
     set flagged_by = array_append(flagged_by, public.current_person_id()),
         is_hidden = true
   where id = p_comment_id
     and not (flagged_by @> array[public.current_person_id()]);
$$;

grant execute on function public.flag_feed_comment(uuid) to authenticated;
