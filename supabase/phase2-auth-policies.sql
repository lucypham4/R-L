-- SUPERSEDED by multi-chef-migration.sql, the app moved from "two known
-- people" to open sign-up with a public page per chef, which needs public
-- reads back. Run multi-chef-migration.sql instead (safe to run even if
-- you already ran this file, it re-opens reads and re-scopes writes to
-- each chef's own rows). Kept here for history only.
--
-- Phase 2, tighten meals RLS now that Lucy and her partner sign in.
-- Run this once, after creating their two accounts in the Supabase
-- dashboard (Authentication → Users → Add user). Additive only, it does
-- not touch existing rows or the table shape, unlike schema.sql.
--
-- The app itself is fully private now (everyone hits a sign-in screen),
-- and the public gallery is a separate static export that doesn't call
-- Supabase at view time, so there's no more reason for anon reads either.
-- Both read and write now require a signed-in session.

drop policy if exists "Public read access" on public.meals;
drop policy if exists "Authenticated read access" on public.meals;
create policy "Authenticated read access"
  on public.meals for select
  using (auth.role() = 'authenticated');

drop policy if exists "Public insert access" on public.meals;
drop policy if exists "Authenticated insert access" on public.meals;
create policy "Authenticated insert access"
  on public.meals for insert
  with check (auth.role() = 'authenticated');
