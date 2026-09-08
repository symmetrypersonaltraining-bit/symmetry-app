-- ONE CHICKEN BREAST IS AN ANSWER.
--
-- Dustin, 8 Sep: *"for chicken breast this should be logical, this is where I
-- need you to build in a 'brain' for the database n all features that use it.
-- if i say I ate 1 chicken breast without any measurements, it needs to log the
-- average size chicken breast in oz. or give me small med large options w oz."*
--
-- His own row logged **1 oz — 28 g** for "Chicken breast". Saying you ate a
-- chicken breast recorded an ounce of one.
--
-- ⚠️ THE CATALOGUE CANNOT ANSWER THIS, AND THAT IS THE POINT. Every other fix in
-- this sequence found the right number already sitting in the row. Here the
-- number is absent, and the number that IS there is worse than nothing.
-- Measured across every row naming a breast:
--
--     median "1 breast"   863 g      p25 384 g     p75 1171 g
--
-- because USDA's "breast" is a whole bone-in breast — both lobes, skin, bone:
--
--     Chicken, rotisserie, breast, meat only   1 breast, with skin and bone  483 g
--     Chicken, broiler, rotisserie, BBQ        1 breast                      384 g
--
-- Nobody means 483 g. They mean the boneless skinless one out of the pack. So
-- this is a judgement written down as data, marked as a standard rather than a
-- measurement, and changeable in one row.
--
-- ✅ AND THE DATA AGREES WITH THE STANDARD. USDA's own plain raw cut, the one
-- row that measures the thing a person actually buys, says:
--
--     Chicken, broilers or fryers, breast, meat and skin, raw
--         1 breast, bone removed = 174 g
--
-- 174 g against the 170 g (6 oz) seeded below. That row is deliberately NOT
-- overwritten — it measured it, we only assumed it — but it is the check that
-- the assumption is the right one.
--
-- ── The rule ───────────────────────────────────────────────────────────────
--
--   Said with no measurement   ->  the MEDIUM. "1 chicken breast" logs 6 oz.
--   Wants to be exact          ->  small / medium / large, each carrying its
--                                  ounces, offered in the unit picker.
--
-- Sizes are stored in grams because that is what the app logs; each description
-- carries its ounces because that is how he and his clients talk about meat.
-- Both parsers already discard a trailing "(...)", so "1 breast (6 oz)" reads as
-- one breast to the app and as six ounces to a person.
--
-- ── ⚠️ WHY THIS APPLIES TO SIX ROWS AND NOT FIVE THOUSAND ───────────────────
--
-- The first cut of this matched on the keyword alone: 5,000 rows, and it made
-- the database worse. Caught by looking at the diff before keeping it:
--
--     Shrimp Soup Base                      -> 1 shrimp    (a soup is not a shrimp)
--     Hillshire Farms turkey breast         -> 1 breast    (a deli pack)
--     Beef, bottom sirloin, tri-tip roast   -> 1 steak     (a roast is not a steak)
--     Chicken breast tenders, breaded       -> 1 breast    (a tender is not a breast)
--     Chicken breast, oven-roasted, sliced  -> 1 breast    (deli slices)
--     Shrimp (cooked)                       -> 1 shrimp, 10 g  (nobody logs one shrimp)
--
-- Every one of those is the exact complaint this work exists to end, so the
-- rule now demands the food BE the cut: the name, once parentheses and one
-- leading qualifier are stripped, must START with the keyword, and must not
-- carry a processed-form word. `shrimp` and `turkey breast` were dropped from
-- the table outright — a shrimp is too small to be a portion and a turkey
-- breast is a roast, not a serving.
--
-- Reversible: bak_food_catalog_pieces_20260908d holds serving_options and all
-- four default_serving columns for every row the keywords can reach.

create table if not exists food_piece_sizes (
  keyword   text primary key,
  unit      text not null,          -- what ONE of them is called: breast, thigh
  small_g   numeric not null,
  medium_g  numeric not null,       -- the answer when nobody said a size
  large_g   numeric not null,
  priority  int not null,
  note      text,
  added_at  timestamptz not null default now(),
  constraint piece_sizes_ascend check (small_g < medium_g and medium_g < large_g)
);
grant select on food_piece_sizes to anon, authenticated, service_role;

comment on table food_piece_sizes is
  'What ONE of a food is, when the food is sold as a piece and the catalogue does not know. A standard, not a measurement: USDA''s "1 breast" is a bone-in whole breast (median 863 g) and nobody means that. Edit a row to change what the app assumes.';

-- ── how many ounces that is, said the way a person says it ─────────────────
create or replace function food_oz_of(grams numeric)
returns text language sql immutable as $$
  select rtrim(rtrim(to_char(round(grams / 28.35, 1), 'FM990.9'), '0'), '.') || ' oz';
$$;
grant execute on function food_oz_of(numeric) to anon, authenticated, service_role;

-- ── the same word matching the rest of the brain uses ──────────────────────
create or replace function food_piece_for(p_name text)
returns food_piece_sizes language sql stable as $$
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
  select p.* from food_piece_sizes p
  join forms f on f.s = p.keyword
  order by p.priority desc, p.keyword
  limit 1;
$$;
grant execute on function food_piece_for(text) to anon, authenticated, service_role;

-- ── the guard that keeps this to six rows ──────────────────────────────────
create or replace function food_is_the_plain_cut(p_name text, p_keyword text)
returns boolean language sql immutable as $$
  -- The food IS the cut, not a product made from it. Two conditions, and the
  -- second was learned the hard way: "Chicken breast tenders, breaded" and
  -- "Chicken breast, oven-roasted, sliced" both START with "chicken breast"
  -- and are both emphatically not one chicken breast.
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p_name,'')), '\([^)]*\)', ' ', 'g'),
             '^\s*(top|boneless|skinless|grilled|roasted|baked|raw|cooked|lean|fresh|organic)\s+', '', 'g'),
           '[^a-z ]+', ' ', 'g')) like p_keyword || '%'
     and lower(coalesce(p_name,'')) !~
         '(tender|nugget|fritter|patty|breaded|slice|sliced|roll|jerky|soup|sauce|base|seasoning|marinade|popcorn|strip|salad|sandwich|wrap|burrito|pizza|sausage|bacon|deli|lunch|smoked|canned|dried|spread|dip|kit|bowl|entree|dinner|prepackaged|flavor|fat-free|pre-basted)';
$$;
grant execute on function food_is_the_plain_cut(text, text) to anon, authenticated, service_role;

-- ── the standard, in ounces, converted once ────────────────────────────────
--
-- Poultry raw, boneless, skinless — the pack in the fridge. Beef trimmed, on
-- the plate. Every one of these is a row he can change.
insert into food_piece_sizes (keyword, unit, small_g, medium_g, large_g, priority, note) values
  ('chicken breast','breast',      113, 170, 227, 20, '4 / 6 / 8 oz, boneless skinless'),
  ('chicken thigh','thigh',         71,  99, 128, 19, '2.5 / 3.5 / 4.5 oz, boneless skinless'),
  ('chicken tender','tender',       28,  43,  57, 20, '1 / 1.5 / 2 oz'),
  ('chicken drumstick','drumstick', 43,  57,  71, 22, '1.5 / 2 / 2.5 oz, meat only'),
  ('chicken wing','wing',           21,  28,  43, 17, '0.75 / 1 / 1.5 oz, meat only'),
  ('salmon fillet','fillet',       113, 170, 227, 19, '4 / 6 / 8 oz'),
  ('tilapia','fillet',              85, 113, 170,  9, '3 / 4 / 6 oz'),
  ('pork chop','chop',             113, 170, 227, 15, '4 / 6 / 8 oz, trimmed'),
  ('ribeye','steak',               170, 227, 340,  8, '6 / 8 / 12 oz, trimmed'),
  ('sirloin','steak',              170, 227, 340,  9, '6 / 8 / 12 oz, trimmed'),
  ('filet mignon','steak',         113, 170, 227, 14, '4 / 6 / 8 oz'),
  ('burger patty','patty',          85, 113, 170, 14, '3 / 4 / 6 oz raw')
on conflict (keyword) do nothing;

-- ── the brain consults it, ahead of the row's own serving ──────────────────
--
-- Ahead, because on exactly these foods the row's own serving is the bone-in
-- one this exists to overrule. It stands aside for a VOLUME — "1 cup, diced
-- chicken" is a real and different thing — and for a row that already names
-- the same piece, which is how USDA's measured "1 breast, bone removed = 174 g"
-- keeps its own number.
create or replace function food_default_serving(p_name text, p_options jsonb)
returns jsonb language plpgsql stable as $$
declare
  own_desc text; own_grams numeric; own_label text; own_per numeric;
  svg numeric; oz numeric; rule food_serving_rules; cnt numeric; raw numeric;
  has_rule boolean := false; target numeric; step_aside boolean; cap numeric;
  generic numeric; piece food_piece_sizes;
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

  own_label := food_serving_label_of(own_desc);

  piece := food_piece_for(p_name);
  if piece.keyword is not null
     and food_is_the_plain_cut(p_name, piece.keyword)
     and (own_desc is null
          or (not food_serving_is_volume(own_label)
              and own_label !~ ('^' || piece.unit || '($|[^a-z])'))) then
    return jsonb_build_object(
      'desc',  '1 ' || piece.unit || ' (' || food_oz_of(piece.medium_g) || ')',
      'grams', piece.medium_g,
      'why',   'standard piece size');
  end if;

  select (o->>'grams')::numeric into svg from jsonb_array_elements(p_options) o
  where lower(o->>'desc') = '1 serving' and (o->>'grams')::numeric > 0 limit 1;
  select (o->>'grams')::numeric into oz from jsonb_array_elements(p_options) o
  where lower(o->>'desc') = '1 oz' and (o->>'grams')::numeric > 0 limit 1;

  if own_desc is not null then
    own_per   := own_grams / nullif(food_serving_count_in(own_desc), 0);
    generic   := food_serving_water_density(own_label);
    step_aside := has_rule and rule.grams >= 5 and (
        (food_serving_is_volume(own_label) and not food_serving_is_volume(rule.label))
        or own_per * 2 < rule.grams
        or (generic is not null and abs(own_per - generic) < 0.51
            and rule.label = own_label and abs(rule.grams - generic) >= 1));
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

-- ── back up every row the keywords can reach, not just the six ─────────────
create table if not exists bak_food_catalog_pieces_20260908d as
select c.id, c.name, c.serving_options, c.default_serving_desc,
       c.default_serving_grams, c.default_serving_why
from food_catalog c
join lateral food_piece_for(c.name) p on p.keyword is not null
where c.quarantined is not true and c.source <> 'usda_branded';

-- ── small / medium / large, offered in the picker ──────────────────────────
--
-- Appended to serving_options, which the unit dropdown already reads and
-- already strips "(6 oz)" from. Each size is a DISTINCT label — "small breast",
-- not "breast (small)" — because the parenthesis is discarded and all three
-- would otherwise collapse onto one unit.
with sized as (
  select c.id, p.unit, p.small_g, p.medium_g, p.large_g
  from food_catalog c
  join lateral food_piece_for(c.name) p on p.keyword is not null
  where c.quarantined is not true and c.source <> 'usda_branded'
    and jsonb_typeof(c.serving_options) = 'array'
    and food_is_the_plain_cut(c.name, p.keyword)
    and not (c.serving_options::text like '%1 small ' || p.unit || ' (%')
)
update food_catalog c
set serving_options = c.serving_options || jsonb_build_array(
      jsonb_build_object('desc','1 small ' || s.unit || ' (' || food_oz_of(s.small_g) || ')','grams', s.small_g),
      jsonb_build_object('desc','1 ' || s.unit || ' (' || food_oz_of(s.medium_g) || ')','grams', s.medium_g),
      jsonb_build_object('desc','1 large ' || s.unit || ' (' || food_oz_of(s.large_g) || ')','grams', s.large_g))
from sized s where s.id = c.id;

-- ── and the default, for every row a piece keyword can reach ───────────────
with recomputed as (
  select c.id, food_default_serving(c.name, c.serving_options) as d
  from food_catalog c
  where c.quarantined is not true and jsonb_typeof(c.serving_options) = 'array'
    and (food_piece_for(c.name)).keyword is not null
)
update food_catalog c
set default_serving_desc  = r.d->>'desc',
    default_serving_grams = (r.d->>'grams')::numeric,
    default_serving_why   = r.d->>'why',
    default_serving_set_at = now()
from recomputed r
where r.id = c.id
  and (c.default_serving_desc is distinct from r.d->>'desc'
       or c.default_serving_grams is distinct from (r.d->>'grams')::numeric);
