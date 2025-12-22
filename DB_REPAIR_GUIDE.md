# 🛠️ Database Fix & Security Update

It seems the previous trigger might have failed for some users, or they signed up before the table existed. Also, we are fixing the security warning you saw.

## 1. Run this "Repair" Script
This SQL script does two things:
1.  **Updates the Trigger** to be secure (fixes "Mutable Search Path") and more robust.
2.  **Backfills Missing Data** for any users who already signed up but have no profile.

Copy and run this in your **Supabase SQL Editor**:

```sql
-- 1. Fix the Trigger (Secure & Robust)
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
  on conflict (id) do nothing; -- Prevent error if exists
  
  insert into public.user_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. Backfill for existing users (Run manually once)
do $$
declare
  user_rec record;
begin
  for user_rec in select * from auth.users loop
    -- Create profile if missing
    insert into public.profiles (id, email, full_name, avatar_url)
    values (
        user_rec.id, 
        user_rec.email, 
        coalesce(user_rec.raw_user_meta_data->>'full_name', ''), 
        coalesce(user_rec.raw_user_meta_data->>'avatar_url', '')
    )
    on conflict (id) do nothing;

    -- Create progress if missing
    insert into public.user_progress (user_id)
    values (user_rec.id)
    on conflict (user_id) do nothing;
  end loop;
end;
$$;
```

## 2. Enable "HaveIBeenPwned" (Optional)
To clear the other warning:
1.  Go to **Authentication** -> **Providers** (or Security settings).
2.  Look for "Leaked Passwords Protection".
3.  Enable it (it checks passwords against unwanted lists).

After running Step 1, try logging in again. Your data should now sync correctly!
