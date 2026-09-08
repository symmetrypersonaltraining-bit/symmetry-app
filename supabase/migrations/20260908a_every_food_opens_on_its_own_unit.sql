-- EVERY FOOD OPENS ON ITS OWN UNIT.
--
-- Dustin, 8 Sep 2026: "i want it to open to the correct grams for 1 serving,
-- not '1 serving' so butter should open to 1 tbsp and you can edit it if you
-- had more than that. every single food in that database needs to be set up
-- like that ive been trying to explain that for 2 weeks now."
--
-- WHY IT TOOK TWO WEEKS, WRITTEN DOWN SO IT CANNOT RECUR: the naming work was
-- already done. The 6 Sep RACC pass named 78,266 foods correctly -- "Rice,
-- white, cooked" has carried "1 cup = 158 g" since that night -- and every one
-- of those rows still opened on "100 g", because the names went into
-- serving_options and nothing ever chose from them. Four attempts to INFER the
-- unit were built on top of a shelf that was already stocked.
--
-- ⚠️ WHY THE ANSWER IS NOT WRITTEN INTO serving_grams. That column is the weight
-- the MACROS ARE QUOTED FOR -- lib/nutrition/foodResolve.ts divides by it. On
-- every USDA row it is 100 and the macros are per 100 g. Writing 14 into it for
-- butter, to make butter open on a tablespoon, declares 717 calories to be the
-- value of ONE TABLESPOON: a 7x error on 471,633 rows, behind a label that
-- finally reads correctly. The portion and the quoting basis are two different
-- facts, and they now have two different columns.
--
-- Reversible: bak_food_catalog_servings_20260908 holds serving_desc,
-- serving_grams and serving_options for all 471,633 rows as they were.

-- ── the map, as data rather than a script somebody ran once ─────────────────
create table if not exists food_serving_rules (
  keyword text primary key,
  label text not null,
  grams numeric not null,
  priority int not null,          -- longest keyword wins: "peanut butter" over "butter"
  source text not null default 'racc_20260906',
  added_at timestamptz not null default now()
);
grant select on food_serving_rules to anon, authenticated, service_role;

alter table food_catalog
  add column if not exists default_serving_desc text,
  add column if not exists default_serving_grams numeric,
  add column if not exists default_serving_why text,
  add column if not exists default_serving_set_at timestamptz;

comment on column food_catalog.default_serving_desc is
  'What this food opens on: "1 tbsp", "1 medium", "23 each". Display only. The macros are quoted per serving_grams, which is a different fact.';
comment on column food_catalog.default_serving_grams is
  'Weight of the default serving above. Scale macros with serving_grams, never with this.';

-- ── parsing, shared with the app's own reader ───────────────────────────────
create or replace function food_serving_count_in(d text)
returns numeric language sql immutable as $$
  select coalesce(
    case
      when substring(d from '^\s*([0-9]+)\s*/\s*[0-9]+') is not null
        then substring(d from '^\s*([0-9]+)\s*/\s*[0-9]+')::numeric
           / nullif(substring(d from '^\s*[0-9]+\s*/\s*([0-9]+)')::numeric, 0)
      else nullif(substring(d from '^\s*([0-9]+(?:\.[0-9]+)?)'), '')::numeric
    end, 1);
$$;

create or replace function food_serving_label_of(d text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(d,'')), '\([^)]*\)', ' ', 'g'),
               '^\s*[0-9]+(?:\.[0-9]+)?(?:\s*/\s*[0-9]+)?\s*', ''),
             '\s+', ' ', 'g'),
           '[\s,;.:-]+$', '')), '');
$$;

-- A count a person would read. 1.75 tbsp is an answer; 1.7381 is an admission
-- that the number came from a machine.
create or replace function food_serving_pretty_count(c numeric)
returns numeric language sql immutable as $$
  select case when c < 2 then round(c * 4) / 4
              when c < 5 then round(c * 2) / 2
              else round(c) end;
$$;

create or replace function food_serving_fmt(c numeric, label text)
returns text language sql immutable as $$
  select rtrim(rtrim(to_char(c, 'FM999999990.999'), '0'), '.') || ' ' || label;
$$;

-- ⚠️ `\b` IS NOT A WORD BOUNDARY IN POSTGRES -- it is `\y`. The first cut of
-- these used \b, so both answered false for everything, and "Bananas, raw"
-- survived two fixes still opening on "1 cup, mashed" (200 calories for a
-- banana). A regex that never matches fails exactly like a rule nobody wrote.
create or replace function food_serving_is_volume(label text)
returns boolean language sql immutable as $$
  select coalesce(label ~ '^(cup|cups|tbsp|tablespoons?|tsp|teaspoons?|fl oz|fluid ounces?|ml|milliliters?|millilitres?|liters?|litres?|pints?|quarts?|gallons?)($|[^a-z])', false);
$$;

-- Units that can honestly carry a fraction. A cup can be had in quarters; a
-- banana cannot.
create or replace function food_serving_is_divisible(label text)
returns boolean language sql immutable as $$
  select coalesce(label ~ '^(cup|cups|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|fl oz|ml|milliliters?|liters?|litres?|g|grams?|kg|lbs?|pounds?|pints?|quarts?|gallons?)($|[^a-z])', false);
$$;

-- How many of a unit still reads as a serving. Past this it is arithmetic:
-- "35 tsp" of toaster pastries and "11 tbsp" of Rice A Roni were both real
-- answers from a random sample of 22 rows.
create or replace function food_serving_count_cap(label text)
returns numeric language sql immutable as $$
  select case
    when label ~ '^(tsp|teaspoons?)($|[^a-z])' then 6
    when label ~ '^(tbsp|tablespoons?)($|[^a-z])' then 8
    when label ~ '^(cups?)($|[^a-z])' then 4
    when label ~ '^(oz|ounces?|fl oz)($|[^a-z])' then 24
    else 60 end;
$$;

-- Matching by WORDS, not substrings, and not 327 regexes per row.
--
-- Substring matching gave "Corndogs -> 1 cup" from the keyword 'corn'. Regex
-- word boundaries fixed that and cost a statement timeout on the bulk fill --
-- 327 regular expressions per row is fine once and hopeless 471,633 times. The
-- name is cut into words and shingles so the planner can hash it, which keeps
-- both properties: 'corn' catches "corn on the cob" and leaves the corndog
-- alone, and plurals still match their singular keyword.
create or replace function food_serving_rule_for(p_name text)
returns food_serving_rules language sql stable as $$
  with w as (
    select t.w, t.ord
    from unnest(regexp_split_to_array(
           btrim(regexp_replace(lower(coalesce(p_name,'')), '[^a-z]+', ' ', 'g')), '\s+'
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

-- ── the one place that decides what a food opens on ────────────────────────
--
-- In order:
--   1. The row's own named serving -- a real piece before a volume, because
--      USDA stores options alphabetically and "1 cup, mashed" sorts above
--      "1 small". That is the 26 Aug bug and it has now been fixed at three
--      different levels; this is the last one.
--   2. The keyword map for a NAME, combined with the product's own label
--      weight. The label is the authority on weight; the map only says what to
--      call it. 30 g of butter is "2 tbsp", not "1 tbsp", because the package
--      says 30.
--   3. The label weight under a plain "1 serving" when no keyword matches.
--      Right weight beats a good name.
--   4. An ounce, then 100 g, when there is nothing else at all -- 10 rows.
create or replace function food_default_serving(p_name text, p_options jsonb)
returns jsonb language plpgsql stable as $$
declare
  own_desc text; own_grams numeric; own_label text; own_per numeric;
  svg numeric; oz numeric; rule food_serving_rules; cnt numeric; raw numeric;
  has_rule boolean := false; target numeric; step_aside boolean; cap numeric;
  -- A name is a description and the grams are the fact: a 154 g apple is still
  -- "1 medium" even though medium is 182 g, and it logs 154 g either way.
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
    -- Under 5 g is a genuine option and never a default: nobody logs one almond.
    ((o->>'grams')::numeric / greatest(food_serving_count_in(o->>'desc'),0.0001) < 5)::int asc,
    -- Among several of its own pieces -- extra small, small, medium, large --
    -- the map says which one a person means.
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
    -- A row's own unit wins by default, but not when it is a fraction of the
    -- unit the food is actually sold in: butter's "1 pat, 5 g" against a
    -- tablespoon.
    step_aside := has_rule and rule.grams >= 5 and (
        (food_serving_is_volume(own_label) and not food_serving_is_volume(rule.label))
        or own_per * 2 < rule.grams);
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

grant execute on function food_default_serving(text, jsonb) to anon, authenticated, service_role;

-- The map itself is seeded from bak_food_catalog_racc_20260906 (307 keywords,
-- FDA RACC, applied 6 Sep) plus 20 produce keywords it never had. Seeding runs
-- in the same migration only where that backup exists; on a fresh database the
-- table starts empty and every row falls through to its own serving, which is
-- the honest behaviour rather than a wrong one.
insert into food_serving_rules (keyword, label, grams, priority)
select matched,
       mode() within group (order by label),
       mode() within group (order by grams::numeric),
       length(matched)
from bak_food_catalog_racc_20260906
where matched is not null and label is not null and grams is not null
group by matched
on conflict (keyword) do nothing;

insert into food_serving_rules (keyword, label, grams, priority, source) values
  ('blueberries','cup',148,11,'added_20260908'),
  ('strawberries','cup',152,12,'added_20260908'),
  ('raspberries','cup',123,11,'added_20260908'),
  ('blackberries','cup',144,12,'added_20260908'),
  ('mixed berries','cup',145,13,'added_20260908'),
  ('grapes','cup',151,6,'added_20260908'),
  ('cucumber','cup',119,8,'added_20260908'),
  ('celery','cup',101,6,'added_20260908'),
  ('lettuce','cup',47,7,'added_20260908'),
  ('zucchini','cup',124,8,'added_20260908'),
  ('asparagus','cup',134,9,'added_20260908'),
  ('green beans','cup',125,11,'added_20260908'),
  ('mushrooms','cup',70,9,'added_20260908'),
  ('bell pepper','cup',149,11,'added_20260908'),
  ('black beans','cup',172,11,'added_20260908'),
  ('walnuts','oz',28,7,'added_20260908'),
  ('pecans','oz',28,6,'added_20260908'),
  ('tilapia','oz',28,7,'added_20260908'),
  ('cod','oz',28,3,'added_20260908'),
  ('pickle','each',35,6,'added_20260908')
on conflict (keyword) do nothing;

-- One almond is 1.2 g and nobody has ever logged one. Every other small rule in
-- the map is a real unit -- a tsp of cinnamon, a clove of garlic, a cracker --
-- and those stay, because they are counted against the package weight
-- ("10 crackers, 31 g", which is how the box reads).
update food_serving_rules set label = 'oz', grams = 28, source = 'fixed_20260908'
where keyword in ('almond','almonds');
