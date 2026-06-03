-- ============================================
-- Discipleship Tracker - Supabase Schema
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- PEOPLE TABLE
-- ============================================
create table if not exists people (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  phone text,
  current_stage text not null check (current_stage in ('Engage', 'Establish', 'Equip', 'Empower')),
  spiritual_birthday date,
  baptism_date date,
  notes text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- ENGAGEMENTS TABLE (Next Steps)
-- ============================================
create table if not exists engagements (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references people(id) on delete cascade,
  description text not null,
  follow_up_date date,
  status text not null default 'Pending' check (status in ('Pending', 'Completed')),
  created_at timestamptz default now()
);

-- ============================================
-- PRAYER REQUESTS TABLE
-- ============================================
create table if not exists prayer_requests (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references people(id) on delete cascade,
  request text not null,
  status text not null default 'Active' check (status in ('Active', 'Answered')),
  answered_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY (Recommended)
-- ============================================
alter table people enable row level security;
alter table engagements enable row level security;
alter table prayer_requests enable row level security;

-- For now, allow all operations (you can tighten this later)
create policy "Allow all operations on people" on people for all using (true);
create policy "Allow all operations on engagements" on engagements for all using (true);
create policy "Allow all operations on prayer_requests" on prayer_requests for all using (true);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
create index if not exists idx_people_stage on people(current_stage);
create index if not exists idx_engagements_person on engagements(person_id);
create index if not exists idx_prayer_person on prayer_requests(person_id);