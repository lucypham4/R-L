-- Meal Diary — meals table
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- for a fresh project.

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuisine text not null default '',
  category text not null default '',
  date date not null,
  serves integer not null default 2,
  description text not null default '',
  ingredients text[] not null default '{}',
  method text[] not null default '{}',
  note text not null default '',
  tags text[] not null default '{}',
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists meals_date_idx on public.meals (date desc);

alter table public.meals enable row level security;

-- Phase 1 has no user accounts yet (the brief calls for simple password
-- login before Phase 2's per-user auth), so these policies are
-- intentionally open — anyone with the anon key can read and add meals.
-- Tighten this once auth lands: e.g. restrict insert/update/delete to
-- `auth.role() = 'authenticated'` or a specific user id.
drop policy if exists "Public read access" on public.meals;
create policy "Public read access"
  on public.meals for select
  using (true);

drop policy if exists "Public insert access" on public.meals;
create policy "Public insert access"
  on public.meals for insert
  with check (true);
