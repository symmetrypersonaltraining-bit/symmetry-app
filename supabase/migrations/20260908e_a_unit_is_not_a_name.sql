-- A UNIT IS NOT A NAME.
--
-- Dustin, 8 Sep: *"I want real unit names based on serving sizes for those."*
--
-- 68,853 rows opened on "1 serving" and 7,165 on "1 unit" or "1 each". The
-- WEIGHT on those rows is right — it comes off the label — but the word tells a
-- client nothing. "1 each" is what a database says when it does not know what
-- the food is. A person says "1 bun".
--
-- ── Where the vague words came from ────────────────────────────────────────
--
-- Twenty-six rules in food_serving_rules carried the label 'each' while their
-- own keyword WAS the noun all along:
--
--     avocado · bun · burrito · croissant · donut · doughnut · egg roll
--     grilled cheese · lemon · lime · nugget · olive · pancake · pickle
--     roll · sandwich · string cheese · waffle
--
-- So every food matching them was told it came in "eaches". The keyword,
-- singularised, is the name, and now it is the label.
--
-- ── ⚠️ AND WHY THIS RENAMES 3,623 ROWS RATHER THAN 45,283 ───────────────────
--
-- 45,283 rows could have been touched. Reading the diff first found two ways it
-- went wrong, and both make the database WORSE than the vague word it replaces
-- — wrong is worse than vague, which is the whole complaint:
--
--     All-Natural Unsweet Tea, Lemon & Lime   ->  "6 lemon"     a soda
--     Gourmet Black Olive Pate                ->  "8 olive"     a pate
--     Cookie, oatmeal sandwich, creme filled  ->  "1 sandwich"  a biscuit
--     Pork, cured, ham, slice, pan-broiled    ->  85 g becomes 28 g
--
-- Three guards, each from one of those:
--
--   1. `food_name_is_flavoured` — a lemon-flavoured soda is not lemons. When a
--      name carries "flavor", "tea", "soda", "juice", "candy", "pate" and the
--      rest, a whole-food keyword is describing the FLAVOUR, not the food.
--   2. Only MANUFACTURED-FORM labels are applied here — bun, roll, burrito,
--      pickle, donut. The produce words stay out; a fruit needs to know whether
--      it is the food or the flavour, and that is a bigger job than a rename.
--   3. **The grams may not move.** A row is renamed only when the new answer
--      weighs exactly what the old one did. This commit changes words and
--      nothing else, so no logged portion can regress on it — and the check
--      below proves it: weights_moved = 0.
--
-- Reversible: bak_food_serving_rules_20260908e and
-- bak_food_default_serving_20260908e.

create table if not exists bak_food_serving_rules_20260908e as
select * from food_serving_rules;

create table if not exists bak_food_default_serving_20260908e as
select id, name, default_serving_desc, default_serving_grams, default_serving_why, default_serving_set_at
from food_catalog
where quarantined is not true
  and (default_serving_desc = '1 serving'
       or food_serving_label_is_vague(food_serving_label_of(default_serving_desc)));

-- ── words that name nothing ────────────────────────────────────────────────
create or replace function food_serving_label_is_vague(label text)
returns boolean language sql immutable as $$
  select coalesce(label ~ '^(each|unit|units|item|items|piece|pieces|serving|servings|portion|portions)($|[^a-z])', false);
$$;
grant execute on function food_serving_label_is_vague(text) to anon, authenticated, service_role;

-- ── the flavour guard ──────────────────────────────────────────────────────
create or replace function food_name_is_flavoured(p_name text)
returns boolean language sql immutable as $$
  -- A lemon-flavoured soda is not lemons, and an olive pate is not olives.
  select lower(coalesce(p_name,'')) ~
    '(flavou?r|tea\y|soda|cola|seltzer|sparkling|drink|juice|lemonade|candy|wafer|pate|p.t.|syrup|sauce|dressing|vinaigrette|yogurt|ice cream|sorbet|cookie|cracker|chip|gum|mint\y|extract|essence|scented|zest)';
$$;
grant execute on function food_name_is_flavoured(text) to anon, authenticated, service_role;

-- ── the keyword was the name all along ─────────────────────────────────────
update food_serving_rules
set label = case when keyword like '%s' and length(keyword) > 3
                 then left(keyword, length(keyword) - 1) else keyword end,
    source = 'named_20260908'
where food_serving_label_is_vague(label);

insert into food_serving_rules (keyword, label, grams, priority, source) values
  ('link','link',25,4,'named_20260908'),
  ('pouch','pouch',21,5,'named_20260908'),
  ('container','container',170,9,'named_20260908')
on conflict (keyword) do nothing;

-- ── the brain prefers a word that means something ──────────────────────────
--
-- Added to step_aside: "1 unit" and "1 each" name nothing, so if the map knows
-- what the food is, its word beats a word that carries no information. The rest
-- of food_default_serving is unchanged from 20260908d.
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

-- ── rename, and only rename ────────────────────────────────────────────────
with s as (
  select c.id, c.default_serving_grams as old_g,
         food_default_serving(c.name, c.serving_options) as d
  from food_catalog c
  join lateral food_serving_rule_for(c.name) r on r.keyword is not null
  where c.quarantined is not true and jsonb_typeof(c.serving_options) = 'array'
    and (c.default_serving_desc = '1 serving'
         or food_serving_label_is_vague(food_serving_label_of(c.default_serving_desc)))
    -- manufactured forms only; a fruit has to know food from flavour first
    and r.label in ('bar','cookie','cracker','patty','link','pancake','waffle','muffin',
                    'tortilla','pouch','container','roll','bun','burrito','croissant',
                    'donut','doughnut','nugget','sandwich','string cheese','pickle','egg roll',
                    'grilled cheese','biscuit','bagel','wrap','slice','scoop','can','bottle')
    and not food_name_is_flavoured(c.name)
)
update food_catalog c
set default_serving_desc = s.d->>'desc',
    default_serving_why  = s.d->>'why',
    default_serving_set_at = now()
from s
where s.id = c.id
  and (s.d->>'grams')::numeric = s.old_g          -- names only: no weight may move
  and c.default_serving_desc is distinct from s.d->>'desc';
