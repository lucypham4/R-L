-- How many a dish served is optional.
--
-- The column was `not null default 2`, so a meal saved without a serving
-- count claimed to serve two people. The add-meal form no longer requires
-- it: left blank, the app sends no value and the card says nothing about
-- serves. Null is how the database says "the chef didn't say"; meals that
-- already hold a 2 keep it.
--
-- Until this has run, a meal saved with the field blank still lands as 2.
--
-- Run this once.

alter table public.meals
  alter column serves drop not null,
  alter column serves drop default;
