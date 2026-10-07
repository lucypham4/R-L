-- The chef's own order for their dishes.
--
-- A chef can hold a dish on their home screen and drag it somewhere else,
-- and their public page shows the dishes in that order too. The order is
-- one list of dish ids on the chef's profile rather than a position on
-- every meal, so moving one dish is one write, and a dish the list doesn't
-- name yet (logged since the chef last arranged them) just goes first.
--
-- text[] rather than uuid[]: an id that no longer matches a dish (one the
-- chef has since deleted) is skipped by the app, not an error.
--
-- Until this has run, dragging a dish still moves it on screen, and saving
-- the new order fails with a message saying so.
--
-- Run this once, after multi-chef-migration.sql.

alter table public.chefs
  add column if not exists dish_order text[] not null default '{}';

-- No policy changes needed: "Public read access" already lets a visitor
-- read it on the public page, and "Own profile update" already scopes
-- writes to auth.uid() = id, so one chef can never rearrange another
-- chef's page.

-- Tell the API about the new column now, rather than whenever it next
-- reloads: until it does, saving it fails with "Could not find the
-- 'dish_order' column of 'chefs' in the schema cache".
notify pgrst, 'reload schema';
