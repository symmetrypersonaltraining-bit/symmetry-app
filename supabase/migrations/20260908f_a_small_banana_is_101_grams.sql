-- A SMALL BANANA IS 101 GRAMS. THE APP SHOULD KNOW THAT, NOT ASK.
--
-- Dustin, 8 Sep: *"these decisions are not mine to say. I'm not gonna go through
-- half a million different foods and figure out the macros and the grams... You
-- can go online as AI and figure out how many grams a small banana is. That
-- needs to happen for all of these foods."*
--
-- He is right, and the previous session got this exactly wrong: it found that
-- his three banana rows all said 100 g, reported it, and called it "his to say".
-- How much a small banana weighs is a fact with a source. It is not a
-- programming decision and he must never be asked for it again.
--
-- ── THE ROOT CAUSE OF TWO WEEKS OF THIS ────────────────────────────────────
--
-- Every nutrition app gets household measures ("1 small", "1 medium") from ONE
-- place: the **food_portion** file of USDA FoodData Central. Our import took the
-- nutrients and a handful of cup measures and left that file behind. Measured:
--
--     rows carrying ANY size portion        706
--     searchable rows                   322,232        0.2%
--
-- So the app was never given the data that answers "how big is a small banana".
-- Every downstream symptom — the piece-size table, the keyword map, the RACC
-- pass, `weighedDefaultAmount` — has been a workaround for a missing import.
-- This is the table that import lands in.
--
-- ⚠️ His own rows show it plainly. "Bananas" carried USDA's own description,
-- `1 large (8" to 8-7/8" long)`, with the weight overwritten to **100 g**. The
-- label came from USDA and the number did not. A large banana is 136 g.
--
--     Banana (small)   1 medium = 100 g   ->  1 small  = 101 g
--     Banana (medium)  1 each   = 100 g   ->  1 medium = 118 g
--     Bananas          1 large  = 100 g   ->  1 medium = 118 g, large offered at 136
--
-- ── What is NOT changed, and why ───────────────────────────────────────────
--
-- `serving_grams` stays where it is. It is the weight the MACROS ARE QUOTED FOR
-- and foodResolve divides by it; moving it to 101 would declare a banana's
-- per-100 g macros to be the value of one small banana. The portion and the
-- quoting basis are two different facts with two different columns -- the same
-- rule as 20260908a, and it nearly got broken again here.
--
-- Reversible: bak_food_catalog_banana_20260908f.

create table if not exists food_portion_reference (
  food_key   text not null,
  portion    text not null,
  grams      numeric not null,
  source     text not null,
  checked_at timestamptz not null default now(),
  primary key (food_key, portion),
  constraint portion_grams_positive check (grams > 0)
);
grant select on food_portion_reference to anon, authenticated, service_role;

comment on table food_portion_reference is
  'What one small / medium / large of a food weighs. THE APP''S ANSWER, not the trainer''s: nobody should be asked how many grams a small banana is. Every row records where its number came from. This is the landing table for the USDA FoodData Central food_portion import (fdc.nal.usda.gov), which is where every nutrition app gets household measures and which our own import dropped -- 706 of 322,232 rows carry a size.';

create table if not exists bak_food_catalog_banana_20260908f as
select id, name, serving_options, serving_desc, serving_grams,
       default_serving_desc, default_serving_grams, default_serving_why
from food_catalog where lower(name) ~ '\ybananas?\y';

insert into food_portion_reference (food_key, portion, grams, source) values
  ('banana','small',   101, 'USDA FoodData Central 173944 (SR Legacy), 1 small 6"-6 7/8"'),
  ('banana','medium',  118, 'USDA FoodData Central 173944 (SR Legacy), 1 medium 7"-7 7/8"'),
  ('banana','large',   136, 'USDA FoodData Central 173944 (SR Legacy), 1 large 8"-8 7/8"')
on conflict (food_key, portion) do update
  set grams = excluded.grams, source = excluded.source, checked_at = now();

-- ── the size a row NAMES is the size it means ──────────────────────────────
--
-- "Banana (small)" is a small banana. It said "1 medium" and weighed 100 g, so
-- the one row whose name already carried the answer was the one being ignored.
create or replace function food_size_in_name(p_name text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_name,'')) ~ '\y(extra small|x-small)\y' then 'small'
    when lower(coalesce(p_name,'')) ~ '\ysmall\y'  then 'small'
    when lower(coalesce(p_name,'')) ~ '\ymedium\y' then 'medium'
    when lower(coalesce(p_name,'')) ~ '\y(large|lg)\y' then 'large'
    else null end;
$$;
grant execute on function food_size_in_name(text) to anon, authenticated, service_role;

-- ── apply it: all three sizes offered, the named size opened ───────────────
with sizes as (
  select jsonb_agg(jsonb_build_object('desc','1 '||portion,'grams',grams) order by grams) as opts
  from food_portion_reference where food_key='banana'
), tgt as (
  select c.id, coalesce(food_size_in_name(c.name),'medium') as want,
         (select grams from food_portion_reference
           where food_key='banana' and portion = coalesce(food_size_in_name(c.name),'medium')) as g
  from food_catalog c
  where c.quarantined is not true and lower(c.name) ~ '^bananas?( \(.*\))?$'
)
update food_catalog c
set serving_options = (
      select coalesce(jsonb_agg(o), '[]'::jsonb)
      from jsonb_array_elements(c.serving_options) o
      where food_serving_label_of(o->>'desc') !~ '^(small|medium|large|each)($|[^a-z])'
    ) || (select opts from sizes),
    default_serving_desc  = '1 ' || t.want,
    default_serving_grams = t.g,
    default_serving_why   = 'USDA portion reference',
    default_serving_set_at = now()
from tgt t where t.id = c.id;
