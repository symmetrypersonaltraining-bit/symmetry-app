-- A HALF CUP HAS NO LEADING ZERO.
--
-- 494 foods opened on "1 .5 cup". Broccoli read "1 .5 cup, chopped", grapefruit
-- "1 .5 fruit", oats "1 .333 cup". A client reading that stops trusting the
-- screen, and they are right to: it is not a measurement, it is a parser
-- talking to itself.
--
-- THE CAUSE. USDA writes a half cup as ".5 cup" -- no leading zero. Both SQL
-- parsers open with `[0-9]+`, which requires a digit BEFORE the point, so
-- neither one matched:
--
--   food_serving_count_in('.5 cup')  ->  1          (should be 0.5)
--   food_serving_label_of('.5 cup')  ->  '.5 cup'   (should be 'cup')
--
-- The count fell back to its coalesce default of 1 and the ".5" stayed stuck to
-- the front of the label, so food_serving_fmt(1, '.5 cup') rendered "1 .5 cup".
-- Every downstream number was then computed against a unit that does not exist.
--
-- ⚠️ THE APP WAS ALWAYS RIGHT, WHICH IS WHY THIS SURVIVED. foodResolve.ts
-- parses the count with `([\d.]+)?`, which DOES match a bare ".5". So TypeScript
-- read ".5 cup" correctly while Postgres did not, the two disagreed about the
-- same three characters, and the disagreement only became visible once Postgres
-- started WRITING a default for TypeScript to read back. Two parsers for one
-- format is the bug; this makes them agree on the bare decimal.
--
-- Reversible: bak_food_default_serving_20260908b holds the four default_serving
-- columns for every row this touches.

-- ── back up before touching anything ───────────────────────────────────────
create table if not exists bak_food_default_serving_20260908b as
select id, default_serving_desc, default_serving_grams,
       default_serving_why, default_serving_set_at
from food_catalog
where jsonb_typeof(serving_options) = 'array'
  and exists (select 1 from jsonb_array_elements(serving_options) o
              where o->>'desc' ~ '^\s*\.[0-9]');

-- ── both parsers accept a bare leading decimal ─────────────────────────────
--
-- `[0-9]*\.?[0-9]+` reads "1", "1.5" and ".5" alike. It stays anchored and it
-- stays greedy, so "1.5" is still one number and not "1" followed by ".5".
create or replace function food_serving_count_in(d text)
returns numeric language sql immutable as $$
  select coalesce(
    case
      when substring(d from '^\s*([0-9]+)\s*/\s*[0-9]+') is not null
        then substring(d from '^\s*([0-9]+)\s*/\s*[0-9]+')::numeric
           / nullif(substring(d from '^\s*[0-9]+\s*/\s*([0-9]+)')::numeric, 0)
      else nullif(substring(d from '^\s*([0-9]*\.?[0-9]+)'), '')::numeric
    end, 1);
$$;

create or replace function food_serving_label_of(d text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(d,'')), '\([^)]*\)', ' ', 'g'),
               '^\s*[0-9]*\.?[0-9]+(?:\s*/\s*[0-9]+)?\s*', ''),
             '\s+', ' ', 'g'),
           '[\s,;.:-]+$', '')), '');
$$;

-- ── recompute only the rows that could have been misread ───────────────────
--
-- Scoped to rows carrying a bare-decimal option (730) rather than the whole
-- catalogue: every other row parsed correctly the first time and re-running the
-- brain over 471,633 rows to change 494 of them is a statement timeout looking
-- for somewhere to happen.
with recomputed as (
  select c.id, food_default_serving(c.name, c.serving_options) as d
  from food_catalog c
  where jsonb_typeof(c.serving_options) = 'array'
    and exists (select 1 from jsonb_array_elements(c.serving_options) o
                where o->>'desc' ~ '^\s*\.[0-9]')
)
update food_catalog c
set default_serving_desc  = r.d->>'desc',
    default_serving_grams = (r.d->>'grams')::numeric,
    default_serving_why   = r.d->>'why',
    default_serving_set_at = now()
from recomputed r
where r.id = c.id;

-- ── the guard: no default may begin with a lone decimal point ──────────────
--
-- A check rather than a comment, because this exact shape came back twice: the
-- 6 Sep RACC pass wrote ".5 cup" into serving_options and nothing complained,
-- and the 8 Sep default pass read it back and rendered it. The constraint is
-- NOT VALID against history on purpose -- it polices what is written from here,
-- and no existing row violates it once the update above has run.
alter table food_catalog
  drop constraint if exists food_default_serving_is_readable;
alter table food_catalog
  add constraint food_default_serving_is_readable
  check (default_serving_desc is null or default_serving_desc !~ '[0-9]\s+\.[0-9]')
  not valid;
