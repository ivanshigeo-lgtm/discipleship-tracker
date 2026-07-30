-- Open self-service web signup: a disciple who signs up and enters a coach code
-- creates a connection request that the coach must ACCEPT before it's live.
-- `pending = true` marks such a request awaiting acceptance. Existing rows were
-- created directly by a coach and are already active, so they default to false.
alter table public.discipleship_connections
  add column if not exists pending boolean not null default false;
