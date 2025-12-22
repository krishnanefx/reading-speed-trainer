# ⚡️ Critical Step: Setting up your Supabase Database

You mentioned you don't see any tables in Supabase. This is because **Supabase does not automatically create tables from your code.** You must run the SQL script I provided manually.

**If you do not do this, Login and Sync will fail.**

## 1. Copy the SQL Code
Open `supabase_setup.sql` in your editor and copy **ALL** the text.
Or copy it from here:

```sql
-- 1. Create Profiles Table
create table profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create Progress Table
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

-- 3. Create Sessions Table
create table reading_sessions (
  id text primary key,
  user_id uuid references profiles(id) not null,
  book_id text not null,
  duration_seconds int not null,
  words_read int not null,
  average_wpm int not null,
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Enable RLS
alter table profiles enable row level security;
alter table user_progress enable row level security;
alter table reading_sessions enable row level security;

-- 5. Create Policies
create policy "Public profiles are viewable by everyone." on profiles for select using ( true );
create policy "Users can insert their own profile." on profiles for insert with check ( auth.uid() = id );
create policy "Users can update own profile." on profiles for update using ( auth.uid() = id );

create policy "Users can see own progress." on user_progress for select using ( auth.uid() = user_id );
create policy "Users can insert own progress." on user_progress for insert with check ( auth.uid() = user_id );
create policy "Users can update own progress." on user_progress for update using ( auth.uid() = user_id );

create policy "Users can see own sessions." on reading_sessions for select using ( auth.uid() = user_id );
create policy "Users can insert own sessions." on reading_sessions for insert with check ( auth.uid() = user_id );
create policy "Users can update own sessions." on reading_sessions for update using ( auth.uid() = user_id );

-- 6. User Setup Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  
  insert into public.user_progress (user_id) values (new.id);
  
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 2. Run in Supabase
1.  Go to your **[Supabase Dashboard](https://supabase.com/dashboard)**.
2.  Click on your project.
3.  In the left sidebar, click the **SQL Editor** icon (looks like a terminal `>_`).
4.  Click **"New Query"**.
5.  Paste the code from above.
6.  Click **"Run"** (bottom right).

## 3. Verify
1.  Go to the **Table Editor** icon (looks like a spreadsheet).
2.  You should now see three tables: `profiles`, `user_progress`, and `reading_sessions`.
3.  If you see them, you are done! Log out and log back in to your app to test it.

---

### ⚠️ Troubleshooting "Relation Already Exists"
If you check and see errors like "relation already exists", it means you ran it twice. That's fine! Just check the Table Editor to confirm the tables are there.
