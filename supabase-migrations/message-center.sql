-- Run this in the Supabase SQL Editor

-- Conversations (DMs and group chats)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  name text,                    -- null = DM, set = group name
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Who is in each conversation
create table if not exists conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz default now(),
  unique(conversation_id, person_id)
);

-- Messages within a conversation
create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references people(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Auto-bump conversations.updated_at when a message is sent
create or replace function update_conv_updated_at()
returns trigger as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conv_updated_at on conversation_messages;
create trigger trg_conv_updated_at
  after insert on conversation_messages
  for each row execute function update_conv_updated_at();

-- RLS (open for now — members are validated app-side)
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table conversation_messages enable row level security;

drop policy if exists "open_conversations" on conversations;
drop policy if exists "open_conv_members" on conversation_members;
drop policy if exists "open_conv_messages" on conversation_messages;
create policy "open_conversations" on conversations for all using (true) with check (true);
create policy "open_conv_members" on conversation_members for all using (true) with check (true);
create policy "open_conv_messages" on conversation_messages for all using (true) with check (true);

-- RPC: find or create a 1-on-1 DM between two people
create or replace function get_or_create_dm(person_a uuid, person_b uuid)
returns uuid as $$
declare
  conv_id uuid;
  member_count int;
begin
  select cm1.conversation_id into conv_id
  from conversation_members cm1
  join conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  join conversations c on c.id = cm1.conversation_id
  where cm1.person_id = person_a
    and cm2.person_id = person_b
    and c.name is null
  limit 1;

  if conv_id is not null then
    select count(*) into member_count
    from conversation_members where conversation_id = conv_id;
    if member_count = 2 then
      return conv_id;
    end if;
  end if;

  insert into conversations (name) values (null) returning id into conv_id;
  insert into conversation_members (conversation_id, person_id)
    values (conv_id, person_a), (conv_id, person_b);
  return conv_id;
end;
$$ language plpgsql security definer;
