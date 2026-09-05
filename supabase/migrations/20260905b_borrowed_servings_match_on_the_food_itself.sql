-- THIRD AND CORRECT VERSION OF THE BORROW. The two before it were measured
-- against the whole catalogue and rejected. 20260905a is the first; this
-- replaces it the same evening, before anyone could log against it.
--
--   v1 (overlap only) matched on ANY shared word and was wrong constantly:
--     "Chicken Parmigiana & Penne" -> "Fat, chicken", 1 tbsp = 12.8 g
--     "Zero Sugar Oatmilk"         -> "Peanut spread, reduced sugar", 2 tbsp
--     "Garlic Bread"               -> "Bread, pan dulce", 1 slice = 63 g
--     "Artisan Pizza, Goat Cheese" -> a submarine sandwich, 6 inch = 201 g
--   A tablespoon of chicken fat offered on a plate of chicken parmigiana is
--   worse than the grams-only screen it replaced, because it looks certain.
--
--   v2 (full containment: every lender word inside the food's name) was safe and
--     nearly useless. USDA names carry qualifiers a package never does, so
--     "Butter, salted" could not lend to "Pure Irish Butter" (no "salted"),
--     "Oil, olive, salad or cooking" could not lend to "Extra Virgin Olive Oil",
--     and "Peanut butter, smooth" could not lend to "Peanut Butter". Four of
--     the five butters on Dustin's screen came back empty.
--
-- THE RULE THAT WORKS: the FOOD ITSELF has to appear on both sides. Take the
-- last significant word of the name being logged — on a package that is the
-- food, with the brand and the adjectives in front of it ("Salted Irish
-- BUTTER", "Extra Virgin Olive OIL") — and require it in the lender's name.
-- Then rank by how many of the food's other words the lender also explains, and
-- break ties towards the plainer, shorter name.
--
-- The ranking is what keeps peanut butter honest. Both "Butter, salted" and
-- "Peanut butter, smooth" contain "butter", so both are candidates for "Peanut
-- Butter" — and the peanut row explains two of its words against the dairy
-- row's one, so it wins. A tablespoon of peanut butter is 16 g, not 14.2.
--
-- Verified against the live catalogue before shipping:
--   Pure / Salted / Unsalted / Garlic & Herb Irish Butter
--                            -> pat 5 g · tbsp 14.2 g · stick 113 g · cup 227 g
--   Peanut Butter            -> 2 tbsp (32 g) = 16 g each
--   Extra Virgin Olive Oil   -> tablespoon 14 g · teaspoon 4.5 g
--   Raw Honey                -> tbsp 21 g · cup 339 g
--   Sharp cheddar cheese     -> slice 19 g / 21 g / 28 g
--   Greek Yogurt Plain       -> 1 container (7 oz) 200 g
--   Chicken Parmigiana & Penne -> 1 entrée 269 g
--   Zero Sugar Oatmilk       -> nothing, correctly
--
-- NOTHING IS BACKFILLED, deliberately. 276,275 of the catalogue's 574,667 rows
-- carry no countable portion, and a set-based backfill was built, sampled and
-- thrown away: the loose rule matched 162,286 of them and the strict rule
-- 14,298, and hand-checking the strict sample still found roughly one in eight
-- wrong ("Honey Wheat" taking Honey's 21 g tablespoon). Written into
-- serving_options those would be indistinguishable from real portions and wrong
-- forever. As a lookup at the moment someone opens a food, the borrowed measure
-- is on screen with its gram weight beside it, and can be seen and overridden.
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
  food as (
    -- The last significant word: "Salted Irish BUTTER", "Extra Virgin Olive OIL".
    select (select toks[array_length(toks, 1)] from me) as noun
  ),
  lender as (
    select fc.id, fc.name, fc.serving_options,
           (select count(*) from unnest((select toks from me)) w
             where lower(fc.name) ~ ('\y' || w || '\y')) as overlap
    from food_catalog fc, food
    where fc.verified is true
      and food.noun is not null
      and lower(fc.name) ~ ('\y' || food.noun || '\y')
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
       from lender c, jsonb_array_elements(c.serving_options) o
      where (o->>'grams') is not null and (o->>'grams')::numeric > 0
        and (o->>'desc') !~* '^\s*[\d.]+\s*(g|gm|kg|oz|lb|lbs|ml|l|fl\s?oz|grams?|ounces?|pounds?)\s*$'),
    '[]'::jsonb);
$$;

grant execute on function public.borrowed_household_servings(text, text) to authenticated, anon;
