-- Per-chef short bio.
--
-- Written on the chef's profile page and shown under their name on their
-- public page, so it's the first thing a client reads about them. Kept
-- short on purpose: a line or two, not a CV.
--
-- Run this once, after multi-chef-migration.sql.

alter table public.chefs
  add column if not exists bio text not null default '';

-- Added separately from the column so re-running this file on a table
-- that already has the column is still safe. The app holds the same
-- limit (BIO_MAX_LENGTH in chefsApi.js).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chefs_bio_length_check'
  ) then
    alter table public.chefs
      add constraint chefs_bio_length_check check (char_length(bio) <= 280);
  end if;
end $$;

-- No policy changes needed: "Public read access" already lets a visitor
-- read it on the public page, and "Own profile update" already scopes
-- writes to auth.uid() = id, so one chef can never rewrite another's bio.

-- Tell the API about the new columns now, rather than whenever it next
-- reloads: until it does, saving them fails with "Could not find the ...
-- column of 'chefs' in the schema cache".
notify pgrst, 'reload schema';
