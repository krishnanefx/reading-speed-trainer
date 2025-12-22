-- Run this in the Supabase SQL Editor

-- 1. Create Profiles Table (Public User Info)
create table profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create Progress Table (Gamification)
create table user_progress (
  user_id uuid references profiles(id) not null primary key,
  current_streak int default 0,
  longest_streak int default 0,
  total_words_read int default 0,
  peak_wpm int default 0,
  daily_goal int default 5000,
  gym_best_time float,
  unlocked_achievements jsonb default '[]'::jsonb,
  last_read_date date,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Create Sessions Table (History)
create table reading_sessions (
  id text primary key, -- Use the same timestamp-based ID from local
  user_id uuid references profiles(id) not null,
  book_id text not null,
  duration_seconds int not null,
  words_read int not null,
  average_wpm int not null,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Create Books Table (Content & Progress)
create table books (
  id text primary key,
  user_id uuid references profiles(id) not null,
  title text not null,
  content text, -- Storing full text here. For very large books, Storage Buckets are better, but Text is fine for <10MB
  progress float default 0,
  total_words int default 0,
  current_index int default 0,
  last_read bigint,
  wpm int,
  cover text, -- Base64 string
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Enable Row Level Security (RLS)
alter table profiles enable row level security;
alter table user_progress enable row level security;
alter table reading_sessions enable row level security;
alter table books enable row level security;

-- 6. Create Policies (Security Rules) --

-- ... (Previous policies) ...

-- Books: Users can only see/edit their own books
create policy "Users can see own books." on books
  for select using ( auth.uid() = user_id );

create policy "Users can insert own books." on books
  for insert with check ( auth.uid() = user_id );

create policy "Users can update own books." on books
  for update using ( auth.uid() = user_id );

create policy "Users can delete own books." on books
  for delete using ( auth.uid() = user_id );

-- 5. Create Policies (Security Rules)

-- Profiles: Users can see and edit their own profile
create policy "Public profiles are viewable by everyone." on profiles
  for select using ( true );

create policy "Users can insert their own profile." on profiles
  for insert with check ( auth.uid() = id );

create policy "Users can update own profile." on profiles
  for update using ( auth.uid() = id );

-- Progress: Users can only see/edit their own progress
create policy "Users can see own progress." on user_progress
  for select using ( auth.uid() = user_id );

create policy "Users can insert own progress." on user_progress
  for insert with check ( auth.uid() = user_id );

create policy "Users can update own progress." on user_progress
  for update using ( auth.uid() = user_id );

-- Sessions: Users can only see/edit their own sessions
create policy "Users can see own sessions." on reading_sessions
  for select using ( auth.uid() = user_id );

create policy "Users can insert own sessions." on reading_sessions
  for insert with check ( auth.uid() = user_id );

create policy "Users can update own sessions." on reading_sessions
  for update using ( auth.uid() = user_id );

-- 6. Trigger to automatically create profile on signup
-- 6. Trigger to automatically create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id, 
    new.email, 
    coalesce(new.raw_user_meta_data->>'full_name', ''), 
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  
  -- Also initialize empty progress
  insert into public.user_progress (user_id)
  values (new.id);
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
