-- Phase 2 — tighten meals RLS now that Lucy and her partner sign in.
-- Run this once, after creating their two accounts in the Supabase
-- dashboard (Authentication → Users → Add user). Additive only — it does
-- not touch existing rows or the table shape, unlike schema.sql.
--
-- Reads stay public (the portfolio is meant to be browsed by anyone with
-- the link); only adding meals now requires a signed-in session.

drop policy if exists "Public insert access" on public.meals;

drop policy if exists "Authenticated insert access" on public.meals;
create policy "Authenticated insert access"
  on public.meals for insert
  with check (auth.role() = 'authenticated');
