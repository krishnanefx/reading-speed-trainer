# Supabase RLS Audit

Date: 2026-02-11

## Scope
- Source reviewed: `/Users/krishnanadaikkappan/Documents/Hackathons/Y1 Winter Break/Reading speed trainer/supabase_setup.sql`
- Tables in scope: `profiles`, `user_progress`, `reading_sessions`, `books`

## Findings
1. `profiles` select policy was public (`using (true)`), which is broader than strict per-user constraints.
2. `user_progress`, `reading_sessions`, and `books` update policies used only `USING`, without explicit `WITH CHECK`.
3. `reading_sessions` had no delete policy.
4. Existing setup script has duplicate section labels and is not idempotent for policy recreation.

## Hardening Applied
- Added idempotent hardening patch:
  - `/Users/krishnanadaikkappan/Documents/Hackathons/Y1 Winter Break/Reading speed trainer/supabase_rls_hardening.sql`
- Patch actions:
  - Drops old policies (if present) and recreates strict per-user policies.
  - Restricts `profiles` select to owner-only (`auth.uid() = id`).
  - Adds `WITH CHECK` to update policies for `user_progress`, `reading_sessions`, `books`.
  - Adds delete policy for `reading_sessions`.
  - Keeps owner-only CRUD for `books`, `user_progress`, and `reading_sessions`.

## How To Apply
Run `/Users/krishnanadaikkappan/Documents/Hackathons/Y1 Winter Break/Reading speed trainer/supabase_rls_hardening.sql` in Supabase SQL Editor after base table creation.
