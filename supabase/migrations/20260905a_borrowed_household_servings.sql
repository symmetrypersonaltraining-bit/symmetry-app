-- BUTTER IS MEASURED IN TABLESPOONS, WHATEVER THE ROW SAYS.
--
-- Dustin, 5 Sep: "why are we still fighting this? butter shouod measure in
-- tablespoons i thought we fixed all this."
--
-- Fair question. 4 Sep fixed WHICH of a row's own servings gets picked — a real
-- piece over a cup, because USDA stores serving_options alphabetically. This is
-- the case underneath it: a row with no countable serving AT ALL.
--
-- He searched his actual butter, Kerrygold Salted Irish Butter, and got it,
-- correctly. That row comes from Open Food Facts and carries exactly two
-- options, "100 g" and "1 oz", so grams was the only honest thing to offer.
--
-- Not a rare shape. Of the catalogue's butter rows 7,218 are crowd-submitted
-- and 318 are USDA-verified; only 31 carry a tablespoon. The foods this hurts
-- are the ones nobody weighs: butter, oil, peanut butter, honey, mayonnaise,
-- syrup, jam.
--
-- ── WHERE THE GRAMS COME FROM ───────────────────────────────────────────────
--
-- Not a model, and not a table someone typed. The rule this whole area runs on
-- is that a number comes from a row. USDA's "Butter, salted" carries
-- "1 tbsp (14.2 g)", "1 pat (5 g)", "1 stick (113 g)", "1 cup (227 g)" — real,
-- checked, already here. So a weight-only row BORROWS the household measures of
-- the best-matching verified row for the same food.
--
-- Matching is by shared name tokens, most overlap first, and the head noun must
-- match. That is what stops peanut butter borrowing dairy butter's 14.2 g per
-- tablespoon: "Peanut butter, smooth" shares two tokens with "Peanut Butter"
-- and "Butter, salted" shares one, so the peanut row wins — and its own entry
-- is "2 tbsp (32 g)", which parseServingOption divides down to 16 g each.
-- Ties break towards the shorter, plainer name: the generic entry, not a brand.
--
-- Verified against the live catalogue the day it was written:
--   Salted Irish Butter  -> pat 5 g · tbsp 14.2 g · stick 113 g · cup 227 g
--   Peanut Butter        -> 2 tbsp (32 g)     [= 16 g each, NOT 14.2]
--   Extra Virgin Olive Oil -> tablespoon 14 g · teaspoon 4.5 g
--   Raw Honey            -> tbsp 21 g · cup 339 g
--   Cream Cheese         -> tbsp 14.5 g
--
-- Returns '[]' when nothing matches well enough. An empty answer is correct;
-- offering a tablespoon whose weight we do not know is the failure this avoids.
create or replace function public.borrowed_household_servings(
  p_name text,
  p_brand text default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select array_remove(array(
      select w from unnest(regexp_split_to_array(
        lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', ' ', 'g')), '\s+')) w
      where length(w) >= 3
    ), null) as toks
  ),
  head as (
    -- The last significant word is the food itself: "Salted Irish BUTTER".
    select (select toks[array_length(toks, 1)] from me) as noun
  ),
  candidates as (
    select fc.id, fc.name, fc.serving_options,
           (select count(*) from unnest((select toks from me)) w
             where lower(fc.name) ~ ('\y' || w || '\y')) as overlap
    from food_catalog fc, head
    where fc.verified is true
      and head.noun is not null
      and lower(fc.name) ~ ('\y' || head.noun || '\y')
      -- It must actually carry a countable serving, or there is nothing to take.
      and exists (
        select 1 from jsonb_array_elements(coalesce(fc.serving_options, '[]'::jsonb)) o
        where (o->>'grams') is not null and (o->>'grams')::numeric > 0
          and (o->>'desc') !~* '^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$'
      )
    order by overlap desc, length(fc.name), fc.name
    limit 1
  )
  select coalesce(
    (select jsonb_agg(o)
       from candidates c, jsonb_array_elements(c.serving_options) o
      where (o->>'grams') is not null and (o->>'grams')::numeric > 0
        and (o->>'desc') !~* '^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$'),
    '[]'::jsonb);
$$;

grant execute on function public.borrowed_household_servings(text, text) to authenticated, anon;
