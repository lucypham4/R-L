-- Per-chef profile picture.
--
-- Shown in the top right of the chef's own gallery and changed from
-- Settings. It lives on the profile rather than on the device so it
-- follows the chef to every device they sign in on. Null means they
-- haven't chosen one, and the app draws its default instead.
--
-- Holds either an uploaded image's URL or, when the app has nowhere to
-- upload to, the small cropped picture itself as a data URL.
--
-- Run this once, after multi-chef-migration.sql.

alter table public.chefs
  add column if not exists avatar_url text;

-- No policy changes needed: "Own profile update" already scopes writes to
-- auth.uid() = id, so one chef can never change another's picture.
