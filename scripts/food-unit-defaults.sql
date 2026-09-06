-- Regenerates src/lib/nutrition/foodUnitDefaults.ts
--
-- The unit a food should default to is not a thing to guess, borrow or ask a
-- model for. Dustin has already written it down, once per food, every time he
-- programmed a meal. This query is that record.
--
-- Run against the Symmetry project, paste the array into the generated file.
with his as (
  select lower(trim(food)) f, lower(trim(unit)) u, count(*) n
  from meal_items
  where unit is not null and food is not null and trim(food) <> ''
  group by 1, 2
),
top as (
  select distinct on (f) f, u, n from his order by f, n desc, u
)
select json_agg(json_build_array(f, u, n) order by f)::text from top;
