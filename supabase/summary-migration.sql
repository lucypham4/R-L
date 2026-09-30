-- A one-sentence summary per meal.
--
-- The line on a dish's resting card. It used to be the description
-- clamped to two lines, which cut the chef's own words off mid-sentence.
-- Now it's a sentence written to fit: by the AI fill for new meals, by the
-- chef in the add-meal form, or, for meals logged before this, written
-- once the first time their chef opens them (the summarize-dish function).
-- Empty means none has been written, and the app makes do with the
-- description's first sentence or the ingredients.
--
-- Run this once, after multi-chef-migration.sql.

alter table public.meals
  add column if not exists summary text not null default '';

-- Writing a summary onto an existing meal is an update, and until now
-- nothing let a chef update a meal at all. Scoped the same way inserts
-- are: a chef can only ever change their own.
drop policy if exists "Own meals update" on public.meals;
create policy "Own meals update"
  on public.meals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
