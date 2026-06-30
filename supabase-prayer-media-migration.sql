-- Video prayers/praises: a media_url on the prayer (the typed text/caption stays
-- in `request` so AI can search it). Plus a public storage bucket for the videos.
alter table prayer_requests add column if not exists media_url text;

insert into storage.buckets (id, name, public)
values ('prayer-media', 'prayer-media', true)
on conflict (id) do nothing;
