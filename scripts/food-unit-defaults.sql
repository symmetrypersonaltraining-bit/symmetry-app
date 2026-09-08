-- Step 1 of regenerating src/lib/nutrition/foodUnitDefaults.ts.
--
-- The unit a food should default to is not a thing to guess, borrow or ask a
-- model for. Dustin has already written it down, once per food, every time he
-- programmed a meal. This query is that record.
--
-- IT HANDS OVER RAW NAMES AND DOES NOT NORMALISE THEM. That is the whole point
-- of the split. The map's keys have to be exactly what unitKey() produces at
-- runtime, and a second normalisation written in SQL drifts from the first: it
-- did, over accents, and "Jocko Mölk Whey" ended up filed as `jocko molk whey`
-- while the lookup asked for `jocko m lk whey`. Three of his foods answered for
-- nothing. So the normalising now happens in exactly one place — unitKey, via
-- scripts/emit-food-unit-defaults.ts. All this query does is count.
--
-- Step 1: run this through the Supabase MCP tool, save the single returned
--         string to a file (one row per line: food <TAB> unit <TAB> count).
-- Step 2: npx tsx scripts/emit-food-unit-defaults.ts <that file>
with his as (
  select btrim(food) f, btrim(lower(unit)) u, count(*) n
  from meal_items
  where unit is not null and food is not null
    and btrim(food) <> '' and btrim(unit) <> ''
  group by 1, 2
)
select string_agg(f || E'\t' || u || E'\t' || n, E'\n' order by f, u) from his;
