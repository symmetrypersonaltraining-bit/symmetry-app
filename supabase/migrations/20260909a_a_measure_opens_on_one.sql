-- A MEASURE OPENS ON ONE.
--
-- Dustin, 8 Sep, and it is the sentence this whole thread started from:
-- *"i want it to open to the correct grams for 1 serving, not '1 serving' so
-- butter should open to 1 tbsp and you can edit it if you had more than that."*
--
-- Butter still opened on **6 tbsp**. His literal example, still wrong, five
-- migrations later. Found by listing the 314 foods he actually programmes and
-- reading what the catalogue gives each one:
--
--     Butter              6 tbsp   — 85 g      a whole stick
--     Baby Spinach        3 cup    — 85 g      the whole bag
--     Chia Seeds          3.5 tbsp — 42 g
--     Almonds             2.5 oz   — 73 g      ~420 calories
--     Hard Boiled Eggs    2 large  — 103 g
--
-- ── The fault ──────────────────────────────────────────────────────────────
--
-- The brain took the package's serving weight and restated it as a count of
-- household units: 85 g of butter IS six tablespoons. True of the label, and
-- never what a person wants to see first. **83,478 rows** opened on more than
-- one of a divisible unit.
--
-- So: a MEASURE (tbsp, cup, oz) or a SIZE (small, medium, large) opens on ONE
-- of itself. A NAMED PIECE keeps the label's count, because "8 crackers" is how
-- the box is actually eaten and 1 cracker is not a serving anyone means.
--
-- ⚠️ AND ONLY EVER DOWNWARDS. The first cut of this rounded a 0.75-cup serving
-- UP to 1 cup — overstating the portion, which is the same fault in the other
-- direction and would have undone the point. A fraction is left alone. After
-- the guard: of 12,763 rows changing in a 40,000-row sample, 12,327 portions
-- shrank and **4** grew.
--
-- ── Also fixed here: "1 serving, 1/2 cup" is not a vague label ─────────────
--
-- 20260908e treated any label starting with a vague word as meaningless, so
-- "1 serving, 1/2 cup" had its half cup thrown away and fell through to the
-- keyword map — doubling an ice cream from 68 g to 132 g. A label is vague only
-- when the vague word is ALL there is. That check is now anchored at both ends,
-- which took the regressions in that sample from 91 down to 4.
--
-- Reversible: bak_food_default_serving_20260909 (all 322,232 searchable rows).

create table if not exists bak_food_default_serving_20260909 as
select id, name, source, default_serving_desc, default_serving_grams, default_serving_why
from food_catalog where quarantined is not true;

-- ── what opens on one ──────────────────────────────────────────────────────
create or replace function food_serving_opens_on_one(label text)
returns boolean language sql immutable as $$
  select food_serving_is_divisible(label)
      or coalesce(label ~ '^(extra small|small|medium|large|extra large|jumbo|whole|each)($|[^a-z])', false);
$$;
grant execute on function food_serving_opens_on_one(text) to anon, authenticated, service_role;

-- ── a vague word only counts when it is the whole label ────────────────────
create or replace function food_serving_label_is_vague(label text)
returns boolean language sql immutable as $$
  select coalesce(label ~ '^(each|unit|units|item|items|piece|pieces|serving|servings|portion|portions)$', false);
$$;

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
        -- Downwards only: shrink a multiple to one, never inflate a fraction.
        if cnt is not null and cnt > 1 and food_serving_opens_on_one(own_label) then
          return jsonb_build_object('desc', food_serving_fmt(1, own_label),
                                    'grams', round(own_per,2), 'why', 'one of its own unit');
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
      if cnt is not null and cnt > 1 and food_serving_opens_on_one(rule.label) then
        return jsonb_build_object('desc', food_serving_fmt(1, rule.label),
                                  'grams', rule.grams, 'why', 'one mapped unit');
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

-- ── the recompute ──────────────────────────────────────────────────────────
--
-- ⚠️ RUN THIS IN BATCHES. The whole catalogue in one statement exceeds the
-- 60-second statement timeout. Non-branded sources go in one pass; the 443k
-- branded rows go one leading hex character of the id at a time, sixteen
-- batches, each of which completes comfortably.
--
-- On 9 Sep the non-branded pass and branded batches '0' through 'a' were
-- applied. **Batches 'b', 'c', 'd', 'e' and 'f' were NOT** — the session was
-- stopped mid-run. Until they are, those rows still open on multiples. Running
-- an already-applied batch again is harmless: the update is a no-op when the
-- answer has not changed.

-- Pass 1: everything except branded.
with r as (
  select c.id, food_default_serving(c.name, c.serving_options) as d
  from food_catalog c
  where c.quarantined is not true and jsonb_typeof(c.serving_options) = 'array'
    and c.source in ('trainer','client','brand','restaurant','usda','usda_core','usda_generic')
)
update food_catalog c
set default_serving_desc = r.d->>'desc', default_serving_grams = (r.d->>'grams')::numeric,
    default_serving_why = r.d->>'why', default_serving_set_at = now()
from r where r.id = c.id
  and (c.default_serving_desc is distinct from r.d->>'desc'
       or c.default_serving_grams is distinct from (r.d->>'grams')::numeric);

-- Pass 2: branded, one batch per leading hex character. Repeat for each of
-- 0 1 2 3 4 5 6 7 8 9 a b c d e f, changing the character on the last line.
--
--   with r as (
--     select c.id, food_default_serving(c.name, c.serving_options) as d
--     from food_catalog c
--     where c.quarantined is not true and jsonb_typeof(c.serving_options) = 'array'
--       and c.source = 'usda_branded' and left(c.id::text,1) = '0')
--   update food_catalog c
--   set default_serving_desc = r.d->>'desc', default_serving_grams = (r.d->>'grams')::numeric,
--       default_serving_why = r.d->>'why', default_serving_set_at = now()
--   from r where r.id = c.id
--     and (c.default_serving_desc is distinct from r.d->>'desc'
--          or c.default_serving_grams is distinct from (r.d->>'grams')::numeric);
