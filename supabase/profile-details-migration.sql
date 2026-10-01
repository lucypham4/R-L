-- Per-chef specialties and links.
--
-- Both are written on the chef's profile and shown there and on their
-- public page: specialties as a row of tags under their name ("Pastry",
-- "Plant-based"), links as where else clients can find them.
--
-- links holds one entry per platform, a handle or an address, never a
-- ready-made href: {"instagram": "ana", "website": "https://ana.com/"}.
-- The app builds every href itself (lib/socialLinks.js), so a row edited
-- by hand can't put a script link on a public page.
--
-- Run this once, after multi-chef-migration.sql.

alter table public.chefs
  add column if not exists specialties text[] not null default '{}',
  add column if not exists links jsonb not null default '{}'::jsonb;

-- Added separately from the columns so re-running this file on a table
-- that already has them is still safe. The app holds the same limits
-- (SPECIALTIES_MAX in chefsApi.js).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chefs_specialties_count_check'
  ) then
    alter table public.chefs
      add constraint chefs_specialties_count_check check (cardinality(specialties) <= 8);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'chefs_links_object_check'
  ) then
    alter table public.chefs
      add constraint chefs_links_object_check check (jsonb_typeof(links) = 'object');
  end if;
end $$;

-- No policy changes needed: "Public read access" already lets a visitor
-- read them on the public page, and "Own profile update" already scopes
-- writes to auth.uid() = id.
