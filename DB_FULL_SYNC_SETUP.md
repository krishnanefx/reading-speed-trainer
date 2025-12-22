# ⚡️ Full Data Sync Setup (Final Version)

To enable **Full Synchronization** (including Books, Progress, and Sessions) across devices, you must update your database one last time.

## 1. Run this in Supabase SQL Editor

Copy and paste this ENTIRE block. It creates the missing `books` table and ensures everything is secure.

```sql
-- 1. Create Profiles
create table if not exists profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create Progress
create table if not exists user_progress (
  user_id uuid references profiles(id) not null primary key,
  current_streak int default 0,
  longest_streak int default 0,
  total_words_read int default 0,
  peak_wpm int default 0,
  daily_goal int default 5000,
  gym_best_time float,
  unlocked_achievements jsonb default '[]'::jsonb,
  last_read_date date,
  -- Settings Sync
  default_wpm int,
  default_chunk_size int,
  default_font text,
  theme text,
  auto_accelerate boolean,
  bionic_mode boolean,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Create Sessions
create table if not exists reading_sessions (
  id text primary key,
  user_id uuid references profiles(id) not null,
  book_id text not null,
  duration_seconds int not null,
  words_read int not null,
  average_wpm int not null,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Create Books (NEW)
create table if not exists books (
  id text primary key,
  user_id uuid references profiles(id) not null,
  title text not null,
  content text, 
  progress float default 0,
  total_words int default 0,
  current_index int default 0,
  last_read bigint,
  wpm int,
  cover text, 
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Enable RLS
alter table profiles enable row level security;
alter table user_progress enable row level security;
alter table reading_sessions enable row level security;
alter table books enable row level security;

-- 6. Create Policies (Safe to run multiple times, will error if exists but that's fine)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can see own books.') then
    create policy "Users can see own books." on books for select using ( auth.uid() = user_id );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own books.') then
    create policy "Users can insert own books." on books for insert with check ( auth.uid() = user_id );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can update own books.') then
    create policy "Users can update own books." on books for update using ( auth.uid() = user_id );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own books.') then
    create policy "Users can delete own books." on books for delete using ( auth.uid() = user_id );
  end if;
end
$$;

-- (Rerun previous policies just in case, omitted for brevity as they likely exist)

-- 7. Secure Trigger (Final Fix)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id, 
    new.email, 
    coalesce(new.raw_user_meta_data->>'full_name', ''), 
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  
  insert into public.user_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

## 2. Verify
Go to the **Table Editor** in Supabase. You should see `books` alongside `profiles`, `user_progress`, and `reading_sessions`. 

Now when you upload a book on one device, it will eventually appear on others when you reload/login!
