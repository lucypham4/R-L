-- Per-chef public page theme.
--
-- A chef's public page at /<slug> is seen by their clients, not by them,
-- so it can't follow the viewer's OS preference the way the private app
-- does -- the chef needs to decide how their own page looks. This adds
-- that choice as a column on their profile so it's set once and can be
-- changed at any time after the page is live.
--
-- Run this once, after multi-chef-migration.sql.

alter table public.chefs
  add column if not exists page_theme text not null default 'light';

-- Only the two themes the app can actually render. Added separately from
-- the column so re-running this file on a table that already has the
-- column is still safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chefs_page_theme_check'
  ) then
    alter table public.chefs
      add constraint chefs_page_theme_check check (page_theme in ('light', 'dark'));
  end if;
end $$;

-- No policy changes needed: "Public read access" already lets a visitor
-- read the column when rendering the page, and "Own profile update"
-- already scopes writes to auth.uid() = id, so one chef can never
-- restyle another chef's page.
