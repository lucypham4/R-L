-- Multi-photo migration: meals can now carry up to 6 photos instead of one.
-- Run this once. Additive, keeps the old `photo_url` column (and its data)
-- around unused rather than dropping it.

alter table public.meals add column if not exists photos jsonb not null default '[]'::jsonb;

update public.meals
set photos = to_jsonb(array[photo_url])
where photo_url is not null and photos = '[]'::jsonb;
