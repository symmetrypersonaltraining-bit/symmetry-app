-- A CUP OF RICE IS NOT A CUP OF WATER.
--
-- Dustin's own programmed foods opened on a cup weighing 240 g. 240 g is a cup
-- of WATER. It is the number you get when nobody knew what the food was:
--
--   Spinach          1 cup = 240 g   a cup of spinach is 30 g    +700%
--   Steel-cut oats   1 cup = 240 g   81 g                        +196%
--   Broccoli         1 cup = 240 g   91 g                        +164%
--   Pasta (cooked)   1 cup = 240 g   140 g                        +71%
--   Blueberries      1 cup = 240 g   148 g                        +62%
--   White rice       1 cup = 240 g   158 g                        +52%
--
-- These are the foods he PROGRAMMES. A client logging the rice in their plan
-- was charged half a meal again in calories.
--
-- ── FAULT 1: a row's own wrong number beat a map that knew better ──────────
--
-- The brain trusts a row's own named serving first, which is right when the row
-- knows something. These rows did not: they carried the generic volume weight,
-- and food_serving_rules already held the real one. So the map now wins the
-- narrow case where the row is quoting WATER for a solid -- same unit, generic
-- weight, map disagrees. It is deliberately narrow: a cup of milk really is
-- ~244 g, and a smoothie really is ~240, so those move by nothing or by 4 g.
--
-- ── FAULT 2: "in water" was the keyword ───────────────────────────────────
--
--   Canned tuna in water    -> matched 'water' -> 1 cup = 240 g
--   Sardines in water       -> matched 'water' -> 1 cup = 240 g
--
-- Longest keyword wins, and 'water' (5) is longer than 'tuna' (4). This is the
-- SAME failure as 89d991fa on 8 Sep, where the word "water" answered for his
-- protein shakes -- fixed there for one food, in the matcher this time. How a
-- tin is PACKED is not what is in the tin, so the packing medium comes off the
-- name before any keyword is looked up. "Goya coconut water" keeps its water,
-- because that is the food and not the packing.
--
-- Reversible: bak_food_default_serving_20260908c.

-- ── what a volume weighs when nobody knew the food ─────────────────────────
create or replace function food_serving_water_density(label text)
returns numeric language sql immutable as $$
  select case
    when label ~ '^(cups?)($|[^a-z])' then 240
    when label ~ '^(tbsp|tablespoons?)($|[^a-z])' then 15
    when label ~ '^(tsp|teaspoons?)($|[^a-z])' then 5
    when label ~ '^(fl oz|fluid ounces?)($|[^a-z])' then 30
    else null end;
$$;
grant execute on function food_serving_water_density(text) to anon, authenticated, service_role;

-- ── how a tin is packed is not what is in the tin ──────────────────────────
--
-- Stripped BEFORE the name is cut into words, so 'tuna' is the longest thing
-- left in "canned tuna in water" and wins on its own merits.
create or replace function food_serving_rule_for(p_name text)
returns food_serving_rules language sql stable as $$
  with cleaned as (
    select regexp_replace(lower(coalesce(p_name,'')),
             '\s+(?:packed\s+)?in\s+(water|oil|brine|juice|syrup)\y', ' ', 'g') as n
  ), w as (
    select t.w, t.ord
    from cleaned,
         unnest(regexp_split_to_array(
           btrim(regexp_replace(cleaned.n, '[^a-z]+', ' ', 'g')), '\s+'
         )) with ordinality as t(w, ord)
    where t.w <> ''
  ), shingles as (
    select w from w
    union all
    select a.w || ' ' || b.w from w a join w b on b.ord = a.ord + 1
    union all
    select a.w || ' ' || b.w || ' ' || c.w from w a join w b on b.ord = a.ord + 1 join w c on c.ord = a.ord + 2
  ), forms as (
    select w as s from shingles
    union
    select left(w, length(w) - 1) from shingles where w like '%s' and length(w) > 3
  )
  select r.* from food_serving_rules r
  join forms f on f.s = r.keyword
  order by r.priority desc, r.keyword
  limit 1;
$$;

-- ── the map wins when the row is quoting water ─────────────────────────────
create or replace function food_default_serving(p_name text, p_options jsonb)
returns jsonb language plpgsql stable as $$
declare
  own_desc text; own_grams numeric; own_label text; own_per numeric;
  svg numeric; oz numeric; rule food_serving_rules; cnt numeric; raw numeric;
  has_rule boolean := false; target numeric; step_aside boolean; cap numeric;
  generic numeric;
  tol constant numeric := 0.25;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    return jsonb_build_object('desc','100 g','grams',100,'why','no options');
  end if;

  rule := food_serving_rule_for(p_name);
  has_rule := rule.keyword is not null and rule.grams > 0;
  target := case when has_rule then rule.grams else null end;

  select o->>'desc', (o->>'grams')::numeric into own_desc, own_grams
  from jsonb_array_elements(p_options) o
  where lower(o->>'desc') not in ('100 g','1 oz','1 serving')
    and (o->>'grams')::numeric > 0
    and food_serving_label_of(o->>'desc') is not null
  order by
    (food_serving_is_volume(food_serving_label_of(o->>'desc')))::int asc,
    ((o->>'grams')::numeric / greatest(food_serving_count_in(o->>'desc'),0.0001) < 5)::int asc,
    case when target is null then 0
         else abs((o->>'grams')::numeric / greatest(food_serving_count_in(o->>'desc'),0.0001) - target)
    end asc
  limit 1;

  select (o->>'grams')::numeric into svg from jsonb_array_elements(p_options) o
  where lower(o->>'desc') = '1 serving' and (o->>'grams')::numeric > 0 limit 1;
  select (o->>'grams')::numeric into oz from jsonb_array_elements(p_options) o
  where lower(o->>'desc') = '1 oz' and (o->>'grams')::numeric > 0 limit 1;

  if own_desc is not null then
    own_label := food_serving_label_of(own_desc);
    own_per   := own_grams / nullif(food_serving_count_in(own_desc), 0);
    generic   := food_serving_water_density(own_label);
    step_aside := has_rule and rule.grams >= 5 and (
        (food_serving_is_volume(own_label) and not food_serving_is_volume(rule.label))
        or own_per * 2 < rule.grams
        -- The row is quoting WATER for its own unit and the map knows the food.
        -- Narrow on purpose: same unit, generic weight, and a map that actually
        -- disagrees. A cup of milk stays a cup of milk.
        or (generic is not null
            and abs(own_per - generic) < 0.51
            and rule.label = own_label
            and abs(rule.grams - generic) >= 1));
    if not step_aside then
      if svg is not null and own_per > 0 then
        raw := svg / own_per;
        cap := food_serving_count_cap(own_label);
        if food_serving_is_divisible(own_label) then cnt := food_serving_pretty_count(raw);
        else
          cnt := round(raw);
          if cnt < 1 or abs(raw - cnt) > tol * greatest(cnt,1) then cnt := null; end if;
        end if;
        if cnt is not null and cnt >= 0.25 and cnt <= cap then
          return jsonb_build_object('desc', food_serving_fmt(cnt, own_label),
                                    'grams', svg, 'why', 'label weight, own unit');
        end if;
      end if;
      if own_per >= 5 then
        return jsonb_build_object('desc', food_serving_fmt(1, own_label),
                                  'grams', round(own_per,2), 'why', 'own named serving');
      end if;
    end if;
  end if;

  if svg is not null then
    if has_rule then
      raw := svg / rule.grams;
      cap := food_serving_count_cap(rule.label);
      if food_serving_is_divisible(rule.label) then cnt := food_serving_pretty_count(raw);
      else
        cnt := round(raw);
        if cnt < 1 or abs(raw - cnt) > tol * greatest(cnt,1) then cnt := null; end if;
      end if;
      if cnt is not null and cnt >= 0.25 and cnt <= cap then
        return jsonb_build_object('desc', food_serving_fmt(cnt, rule.label),
                                  'grams', svg, 'why', 'label weight, mapped unit');
      end if;
    end if;
    return jsonb_build_object('desc','1 serving','grams', svg, 'why','label weight, no name');
  end if;

  if has_rule and rule.grams >= 5 then
    return jsonb_build_object('desc', food_serving_fmt(1, rule.label),
                              'grams', rule.grams, 'why', 'mapped unit, no label serving');
  end if;
  if oz is not null then
    return jsonb_build_object('desc','1 oz','grams', oz, 'why','too small to count, ounce instead');
  end if;
  return jsonb_build_object('desc','100 g','grams',100,'why','nothing to go on');
end;
$$;

-- ── the foods he programmes that the map did not know ──────────────────────
insert into food_serving_rules (keyword, label, grams, priority, source) values
  ('butternut squash','cup',205,16,'his_foods_20260908'),
  ('beets','cup',170,5,'his_foods_20260908'),
  ('canned tuna','can',142,11,'his_foods_20260908'),
  ('sardines','can',92,8,'his_foods_20260908'),
  ('chuck roast','oz',28,11,'his_foods_20260908'),
  ('carbo gain','cup',132,10,'his_foods_20260908')
on conflict (keyword) do nothing;

-- ── back up, then recompute HIS foods only ─────────────────────────────────
--
-- Scoped to the 309 trainer- and client-owned rows. The USDA half of the
-- catalogue is a separate, measured pass: most of its 1-cup-240-g rows are
-- drinks, where 240 is the right answer, and a sweep of 322,232 rows is not
-- something to ride along on a fix to his own foods.
create table if not exists bak_food_default_serving_20260908c as
select id, name, default_serving_desc, default_serving_grams,
       default_serving_why, default_serving_set_at
from food_catalog where source in ('trainer','client');

-- Live rows only. Every trainer/client row without a default is a quarantined
-- one -- meal descriptions like "salmon, rice, peanuts" that the quality gate
-- already hides -- and giving those a serving would be dressing up a row nobody
-- can search for. This leaves the change set as exactly the 28 corrections.
with recomputed as (
  select c.id, food_default_serving(c.name, c.serving_options) as d
  from food_catalog c
  where c.source in ('trainer','client')
    and c.quarantined is not true
    and jsonb_typeof(c.serving_options) = 'array'
)
update food_catalog c
set default_serving_desc  = r.d->>'desc',
    default_serving_grams = (r.d->>'grams')::numeric,
    default_serving_why   = r.d->>'why',
    default_serving_set_at = now()
from recomputed r
where r.id = c.id;
