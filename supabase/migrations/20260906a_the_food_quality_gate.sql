-- THE FOOD QUALITY GATE  ·  6 Sep 2026
--
-- Dustin: "we need proper units on every food that calculate proper macros for
-- each unit and defaults to standard serving... as of right now its useless."
--
-- Four attempts before this tried to INFER serving sizes from food_catalog.
-- They failed because the catalogue cannot answer the question: 511,555 of its
-- rows are Open Food Facts, and for 127,847 of them OFF has no serving size at
-- all. That was checked against the OFF API product by product, not assumed.
-- Neither can it be re-fetched: the data was never collected.
--
-- So the fix is structural, in three parts.
--
--   1. AN AUTHORITATIVE CORE. USDA Standard Reference 28 - 8,789 foods with
--      lab-measured macros and USDA's OWN household measures. import_usda_core()
--      pulls data/usda-sr28.tsv straight from the public repo over http.
--
--   2. A GATE. quarantined = the calories disagree with 4P+4C+9F, or the macros
--      are physically impossible, or the row carries no real household measure.
--      Ranking bad rows to the bottom was not enough - they were still pickable,
--      and a pickable wrong row is a wrong log. They are now not returned.
--
--   3. RANKING THAT KNOWS WHAT A FOOD IS. Authority beats an exact name, so a
--      shopper's packet titled "butter" claiming 428 kcal cannot outrank USDA's
--      717. But authority only counts when the row is ABOUT the thing searched
--      for - USDA's only match for "mixed berries" is a strained babyfood, and
--      a real punnet of mixed berries is the better answer.
--
-- Applied live on 6 Sep; this file is the record. Reversible from
-- bak_food_catalog_deleted_20260906, _servings_, _badservings_, _racc_ and
-- _relabel_20260906.

-- ── columns ───────────────────────────────────────────────────────────────
alter table food_catalog add column if not exists usda_ndb text;
create unique index if not exists food_catalog_usda_ndb_uidx on food_catalog (usda_ndb);

alter table food_catalog add column if not exists quarantined boolean not null default false;
comment on column food_catalog.quarantined is
 'True = not fit to log against, hidden from every search path. Set by recompute_food_quarantine().';

alter table food_catalog add column if not exists usda_conflict boolean not null default false;
comment on column food_catalog.usda_conflict is
 'True = calories fall well outside what USDA records for the same food. NOT hidden - the signal is noisy ("Peach Halves in Light Syrup" reads as "syrup" and its 39 kcal is correct). Ranked below clean rows instead.';

alter table food_catalog drop constraint if exists food_catalog_source_check;
alter table food_catalog add constraint food_catalog_source_check
  check (source = any (array['usda_core','usda','usda_generic','off','brand','restaurant','community','client']));

-- ── the gate ──────────────────────────────────────────────────────────────
create or replace function public.recompute_food_quarantine()
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_bad int; v_ok int;
begin
  update food_catalog fc set quarantined = q.bad
  from (
    select id,
      not (
        kcal is not null and kcal >= 0 and kcal <= 902
        and coalesce(protein,0) >= 0 and coalesce(carbs,0) >= 0 and coalesce(fats,0) >= 0
        and coalesce(protein,0) + coalesce(carbs,0) + coalesce(fats,0) <= 101
        and abs(coalesce(kcal,0) - (4*coalesce(protein,0)+4*coalesce(carbs,0)+9*coalesce(fats,0)))
              <= greatest(30, 0.15*greatest(kcal,1))
        and exists (select 1 from jsonb_array_elements(coalesce(serving_options,'[]'::jsonb)) o
                    where o->>'desc' !~* '^(100 g|1 oz)$'
                      and (o->>'grams') ~ '^[0-9.]+$' and (o->>'grams')::numeric > 0)
      ) as bad
    from food_catalog
  ) q
  where q.id = fc.id and fc.quarantined is distinct from q.bad;
  select count(*) filter (where quarantined), count(*) filter (where not quarantined)
    into v_bad, v_ok from food_catalog;
  return jsonb_build_object('hidden', v_bad, 'searchable', v_ok);
end $fn$;

-- Runs nightly (cron job "food-quality-gate-nightly"), because the OFF bulk
-- import keeps adding rows and the gate must apply to them too.

-- ── the reference tables ──────────────────────────────────────────────────
-- serving_kw / serving_phrase hold FDA Reference Amounts Customarily Consumed
-- (21 CFR 101.12) - the published table that decides what a package prints as
-- one serving. usda_kcal_ref holds a calorie range per food, derived from the
-- USDA core itself, used to flag crowd rows that contradict it.
--
-- import_usda_core(), search_food_catalog() and match_food_for_ai() are large
-- and were applied live; their current definitions are authoritative in the
-- database. Read them with:
--   select pg_get_functiondef(oid) from pg_proc where proname = '<name>';
