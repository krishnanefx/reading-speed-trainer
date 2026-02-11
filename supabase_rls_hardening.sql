-- RLS hardening patch for strict per-user access.
-- Run in Supabase SQL Editor after tables exist.

alter table if exists profiles enable row level security;
alter table if exists user_progress enable row level security;
alter table if exists reading_sessions enable row level security;
alter table if exists books enable row level security;

-- Drop legacy policies to avoid duplicates/conflicts.
drop policy if exists "Public profiles are viewable by everyone." on profiles;
drop policy if exists "Users can insert their own profile." on profiles;
drop policy if exists "Users can update own profile." on profiles;

drop policy if exists "Users can see own progress." on user_progress;
drop policy if exists "Users can insert own progress." on user_progress;
drop policy if exists "Users can update own progress." on user_progress;

drop policy if exists "Users can see own sessions." on reading_sessions;
drop policy if exists "Users can insert own sessions." on reading_sessions;
drop policy if exists "Users can update own sessions." on reading_sessions;
drop policy if exists "Users can delete own sessions." on reading_sessions;

drop policy if exists "Users can see own books." on books;
drop policy if exists "Users can insert own books." on books;
drop policy if exists "Users can update own books." on books;
drop policy if exists "Users can delete own books." on books;

-- Profiles: owner-only access.
create policy "Users can see own profile." on profiles
  for select using (auth.uid() = id);

create policy "Users can insert own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Progress: owner-only access.
create policy "Users can see own progress." on user_progress
  for select using (auth.uid() = user_id);

create policy "Users can insert own progress." on user_progress
  for insert with check (auth.uid() = user_id);

create policy "Users can update own progress." on user_progress
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sessions: owner-only CRUD.
create policy "Users can see own sessions." on reading_sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions." on reading_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sessions." on reading_sessions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own sessions." on reading_sessions
  for delete using (auth.uid() = user_id);

-- Books: owner-only CRUD with update check.
create policy "Users can see own books." on books
  for select using (auth.uid() = user_id);

create policy "Users can insert own books." on books
  for insert with check (auth.uid() = user_id);

create policy "Users can update own books." on books
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own books." on books
  for delete using (auth.uid() = user_id);
