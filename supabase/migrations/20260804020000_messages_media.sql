-- Voice/video messages: a message can carry one media attachment (public URL in
-- the prayer-media bucket, same upload path the prayer wall uses). media_kind
-- tells clients whether to render an audio or video player.
alter table public.messages
  add column if not exists media_url text,
  add column if not exists media_kind text check (media_kind in ('audio', 'video'));
