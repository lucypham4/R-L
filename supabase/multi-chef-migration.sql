-- Multi-chef migration, turns this from one shared diary into a platform
-- where every chef gets their own isolated meals and a public page at
-- /<slug>. Run this once. It supersedes phase2-auth-policies.sql's read
-- restriction, reads need to be public again so anyone can view a
-- chef's page, so run this even if you already ran that file.

-- Each chef's public profile: page slug + display name.
create table if not exists public.chefs (
  id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.chefs enable row level security;

drop policy if exists "Public read access" on public.chefs;
create policy "Public read access"
  on public.chefs for select
  using (true);

drop policy if exists "Own profile insert" on public.chefs;
create policy "Own profile insert"
  on public.chefs for insert
  with check (auth.uid() = id);

drop policy if exists "Own profile update" on public.chefs;
create policy "Own profile update"
  on public.chefs for update
  using (auth.uid() = id);

-- Every meal now belongs to exactly one chef.
alter table public.meals add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists meals_user_id_idx on public.meals (user_id);

-- Public read (that's the point of a public portfolio); writes are
-- scoped to the meal's own chef.
drop policy if exists "Authenticated read access" on public.meals;
drop policy if exists "Public read access" on public.meals;
create policy "Public read access"
  on public.meals for select
  using (true);

drop policy if exists "Authenticated insert access" on public.meals;
drop policy if exists "Public insert access" on public.meals;
drop policy if exists "Own meals insert" on public.meals;
create policy "Own meals insert"
  on public.meals for insert
  with check (auth.uid() = user_id);
