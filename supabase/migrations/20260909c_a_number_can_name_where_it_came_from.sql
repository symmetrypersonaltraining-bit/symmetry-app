-- A NUMBER SHOULD BE ABLE TO NAME WHERE IT CAME FROM.
--
-- Dustin, 9 Sep 2026: "if it's not in the data base they need a way to search
-- in online through ai and get real numbers. again this is the whole point of
-- having a 'brain' in the app."
--
-- The brain goes to USDA FoodData Central on a catalogue miss and writes what
-- it finds into food_catalog. Two things need to be true for that to be safe:
-- the same food must not be re-fetched and re-inserted on every miss, and a
-- number that later turns out to be wrong must be traceable to the row it came
-- from.
--
-- ⚠️ I ADDED THE WRONG COLUMN FIRST, AND THE MISTAKE IS WORTH KEEPING HERE.
--
-- The first version of this added `source_ref`. `fdc_id` has been on this table
-- all along, carrying the FDC id on 442,891 rows, with an index. I missed it
-- because the information_schema query I checked the table with returned every
-- column twice and hit its own LIMIT before reaching it. A truncated listing
-- looks exactly like a complete one -- check the count, not just the output.
--
-- Two columns meaning the same thing is how a lookup starts missing: half the
-- rows found by one, half by the other.

alter table public.food_catalog drop column if exists source_ref;

-- Partial, so it constrains only the rows this feature writes and cannot
-- collide with the 442,891 branded rows that already carry an fdc_id.
create unique index if not exists food_catalog_online_fdc_uniq
  on public.food_catalog (fdc_id)
  where source = 'usda_online' and fdc_id is not null;

-- ── AND THE SOURCE COLUMN HAS TO ALLOW THE NEW VALUE ───────────────────────
--
-- food_catalog.source is CHECK-constrained to a fixed list. Filing these rows
-- under 'usda' would hide them among the 7,766 from the bulk import, and the
-- whole point of the column is that these arrived ONE AT A TIME, on a client's
-- miss, and should be findable, countable and auditable as a group.
--
-- Caught by tests/unit/dbCheckConstraintValues.test.ts before it shipped: that
-- test reads every string literal written into a constrained column and
-- compares it with the constraint. Without it this would have been a 23514 on
-- somebody's dinner, reported to them as a constraint name.

alter table public.food_catalog drop constraint if exists food_catalog_source_check;

alter table public.food_catalog add constraint food_catalog_source_check
  check (source = any (array[
    'trainer', 'usda_core', 'usda_branded', 'usda', 'usda_generic',
    'usda_online',   -- fetched from FoodData Central on a catalogue miss
    'off', 'brand', 'restaurant', 'community', 'client'
  ]::text[]));

comment on constraint food_catalog_source_check on public.food_catalog is
  'Where a row came from. usda_online is fetched live from FoodData Central when the catalogue misses a food, one row at a time, carrying its fdcId in fdc_id.';
