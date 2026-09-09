-- A UNIT THAT CANNOT FIT IS NOT THE UNIT.
--
-- Found on 9 Sep while finishing 20260909a's recompute, by reading the diff of
-- the batch before keeping it. A can of ginger ale opened on **1 tsp — 2 g**.
--
--     Ginger Ale, Ginger                 1 tsp    2 g     really 591 g
--     Diet Soda, Ginger Ale              1 tsp    2 g     really 355 g
--     Macaroni & Cheese, Creamy Sauce    1 tbsp  16 g     really 340 g
--     Restaurant, chicken parmesan       1 tbsp   5 g     really 301 g
--     Cinnamon Rolls                     1 tsp    3 g     really  57 g
--
-- ── The fault ──────────────────────────────────────────────────────────────
--
-- 20260909a added "a measure opens on ONE" — correctly. But it put that return
-- BEFORE the cap check instead of inside it:
--
--     if cnt > 1 and food_serving_opens_on_one(label) then return 1 <label>;
--     if cnt >= 0.25 and cnt <= cap  then return cnt <label>;
--
-- The cap is the sanity check that says *this unit does not belong to this
-- food*. 591 g of ginger ale is 296 teaspoons; nothing is 296 teaspoons, and
-- the count blowing past the cap is precisely how the brain knew that the
-- keyword "ginger" had matched a FLAVOUR rather than the food. Before
-- 20260909a such a row fell through to "1 serving" at the label weight, which
-- is right. After it, the opens-on-one shortcut answered first and returned one
-- teaspoon — turning a missed keyword into a 296x understated portion.
--
-- **9,128 rows catalogue-wide**, understating by 31x on average and 430x at
-- worst. All branded — which is what a client hits when they scan a barcode.
--
-- ── The fix ────────────────────────────────────────────────────────────────
--
-- The cap comes first. Opening on one is a choice made among counts that were
-- already plausible, not a way around the plausibility test.
--
--     if cnt >= 0.25 and cnt <= cap then
--       if cnt > 1 and food_serving_opens_on_one(label) then return 1 <label>;
--       return cnt <label>;
--     end if;
--
-- Both call sites, because both had it: the row's own named serving and the
-- mapped unit.
--
-- ── Measured before applying ───────────────────────────────────────────────
--
-- Proven red first: the shipped function was loaded into a local Postgres 16
-- with its whole dependency chain and the cases above reproduced exactly, then
-- the fix turned them green. Butter still opens on 1 tbsp, baby spinach on
-- 1 cup, almonds on 1 oz, chia on 1 tbsp and a cracker box on 8 crackers --
-- every case 20260909a exists to fix is untouched, because none of them was
-- ever near its cap (butter is 5.67 of 8, spinach 2.8 of 4, almonds 2.6 of 24).
--
-- Then measured on the live catalogue through a shadow function:
--
--     20,344-row branded sample     539 changed, 539 GREW, 0 shrank
--     all 24,415 non-branded rows    11 changed,  11 GREW, 0 shrank
--     his own trainer/client foods    0 changed
--
-- Every change restores a portion that had been wrongly collapsed. Nothing
-- shrinks, which is the invariant that matters: this fix can only ever give
-- back a serving, never take one away.
--
-- Reversible: bak_food_default_serving_20260909 already holds all 322,232
-- searchable rows as they stood before 20260909a's pass.

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
      'grams', piece.medium_g, 'why', 'standard piece size');
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
            and rule.label = own_label and abs(rule.grams - generic) >= 1)
        or (food_serving_label_is_vague(own_label)
            and not food_serving_label_is_vague(rule.label)));
    if not step_aside then
      if svg is not null and own_per > 0 then
        raw := svg / own_per;
        cap := food_serving_count_cap(own_label);
        if food_serving_is_divisible(own_label) then cnt := food_serving_pretty_count(raw);
        else
          cnt := round(raw);
          if cnt < 1 or abs(raw - cnt) > tol * greatest(cnt,1) then cnt := null; end if;
        end if;
        -- The cap comes FIRST. A count past it means the unit does not belong
        -- to this food, and one of a unit that cannot fit is not an answer.
        if cnt is not null and cnt >= 0.25 and cnt <= cap then
          -- Downwards only: shrink a multiple to one, never inflate a fraction.
          if cnt > 1 and food_serving_opens_on_one(own_label) then
            return jsonb_build_object('desc', food_serving_fmt(1, own_label),
                                      'grams', round(own_per,2), 'why', 'one of its own unit');
          end if;
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
      -- The cap comes FIRST. 591 g of ginger ale is 296 teaspoons: the keyword
      -- matched a flavour, not the food, and "1 tsp" would hide a whole can.
      if cnt is not null and cnt >= 0.25 and cnt <= cap then
        if cnt > 1 and food_serving_opens_on_one(rule.label) then
          return jsonb_build_object('desc', food_serving_fmt(1, rule.label),
                                    'grams', rule.grams, 'why', 'one mapped unit');
        end if;
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

-- ── the recompute ──────────────────────────────────────────────────────────
--
-- Only rows that took one of the two opens-on-one branches can change: the
-- reordering is a no-op everywhere else, because every other branch is reached
-- on paths the cap never gated. That is 94,759 rows rather than 322,232, and
-- it is exact rather than a shortcut.
--
-- Still batched by leading hex character of the id -- four at a time here --
-- because the whole set in one statement exceeds the 60-second timeout.
-- Re-running a finished batch is harmless: the update is a no-op when the
-- answer has not changed.
--
--   with r as (
--     select c.id, food_default_serving(c.name, c.serving_options) as d
--     from food_catalog c
--     where c.quarantined is not true and jsonb_typeof(c.serving_options) = 'array'
--       and c.default_serving_why in ('one mapped unit','one of its own unit')
--       and left(c.id::text,1) in ('0','1','2','3'))
--   update food_catalog c
--   set default_serving_desc = r.d->>'desc', default_serving_grams = (r.d->>'grams')::numeric,
--       default_serving_why = r.d->>'why', default_serving_set_at = now()
--   from r where r.id = c.id
--     and (c.default_serving_desc is distinct from r.d->>'desc'
--          or c.default_serving_grams is distinct from (r.d->>'grams')::numeric);
--
-- Repeat for ('4','5','6','7'), ('8','9','a','b') and ('c','d','e','f').
--
-- Confirm afterwards -- was 9,128 before the pass, and ends at zero.
--
-- ⚠️ The check must round the count the way the FUNCTION does. Comparing the
-- raw ratio instead reports 644 phantom failures: a 33 g bag of popcorn is
-- 4.125 cups, food_serving_pretty_count rounds that to 4, and 4 is exactly the
-- cup cap. The row is correct and the naive check calls it broken.
--
--   with x as (
--     select c.default_serving_grams dg,
--            food_serving_label_of(c.default_serving_desc) lbl,
--            (select (o->>'grams')::numeric from jsonb_array_elements(c.serving_options) o
--              where lower(o->>'desc')='1 serving' and (o->>'grams')::numeric>0 limit 1) svg
--     from food_catalog c
--     where c.quarantined is not true
--       and c.default_serving_why in ('one mapped unit','one of its own unit')
--   ), y as (
--     select *, case when food_serving_is_divisible(lbl)
--                    then food_serving_pretty_count(svg/nullif(dg,0))
--                    else round(svg/nullif(dg,0)) end as cnt
--     from x where svg is not null and dg > 0
--   )
--   select count(*) from y where cnt > food_serving_count_cap(lbl);
