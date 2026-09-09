-- SOURCED DATA LIVES INSIDE THE BRAIN, OR IT DOES NOT SURVIVE.
--
-- `20260908f` fixed the banana rows with a direct UPDATE: small 101, medium
-- 118, large 136, from USDA 173944. Hours later the full `20260909a` recompute
-- ran and **wiped it** — "Banana (small)" went back to reading 1 medium, 118 g.
--
-- The lesson, and it is the important one: a number written into rows is only
-- as durable as the next pass over those rows. `food_default_serving()` is the
-- one place that decides what a food opens on, so anything the answer depends
-- on has to be reachable FROM it. A fix applied beside the brain is a fix with
-- a countdown on it.
--
-- So the portion reference is now consulted by the brain, first, ahead of
-- everything: it is researched data with a source per row, and it beats
-- anything inferred. And the size a row's NAME states is the size it means —
-- "Banana (small)" is a small banana, which was the one row already carrying
-- the answer and the one being ignored.

create or replace function food_portion_key_for(p_name text)
returns text language sql stable as $$
  with cleaned as (
    select btrim(regexp_replace(
             regexp_replace(lower(coalesce(p_name,'')), '\([^)]*\)', ' ', 'g'),
             '[^a-z ]+', ' ', 'g')) as n
  ), w as (
    select t.w, t.ord from cleaned,
      unnest(regexp_split_to_array(cleaned.n, '\s+')) with ordinality as t(w, ord)
    where t.w <> ''
  ), forms as (
    select w as s from w
    union select left(w, length(w)-1) from w where w like '%s' and length(w) > 3
    union select a.w || ' ' || b.w from w a join w b on b.ord = a.ord + 1
  )
  select p.food_key from (select distinct food_key from food_portion_reference) p
  join forms f on f.s = p.food_key
  order by length(p.food_key) desc limit 1;
$$;
grant execute on function food_portion_key_for(text) to anon, authenticated, service_role;

-- food_default_serving() gains this as its FIRST branch; the rest of the
-- function is unchanged from 20260909a:
--
--   pkey := food_portion_key_for(p_name);
--   if pkey is not null then
--     psize := coalesce(food_size_in_name(p_name), 'medium');
--     ... look up food_portion_reference, fall back to its medium ...
--     return '1 ' || psize at those grams, why 'USDA portion reference';
--   end if;
--
-- The live definition carries it. Applied 9 Sep together with a recompute of
-- every row a portion key can reach.
