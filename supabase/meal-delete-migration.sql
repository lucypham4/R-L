-- Let a chef delete their own meals.
--
-- Row-level security is on for meals, and a delete that no policy allows
-- doesn't fail: it matches no rows and reports success. Until this ran
-- there was no delete policy at all, so every delete from a signed-in
-- chef "worked" -- the dish left the screen -- and changed nothing, and
-- the dish was back on the next reload.
--
-- Scoped the same way inserts and updates are: a chef can only ever
-- delete their own.
--
-- Run this once, after multi-chef-migration.sql.

drop policy if exists "Own meals delete" on public.meals;
create policy "Own meals delete"
  on public.meals for delete
  using (auth.uid() = user_id);
