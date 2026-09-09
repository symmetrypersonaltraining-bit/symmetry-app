-- "VERIFIED" HAS TO MEAN SOMETHING.
--
-- Dustin, 9 Sep 2026, ruling on the audit finding: "3: yes".
--
-- The finding: every row that was not client-created carried verified = true.
-- 442,891 of them are usda_branded, the MANUFACTURER-SUBMITTED half of
-- FoodData Central -- the crowd-sourced part. Two of them are called "Banana":
--
--     Banana   336 kcal, 0 g protein, 78.6 C, 1.1 F  per 100 g   verified
--     Banana   312 kcal, 12.5 P,      40.6 C, 6.3 F  per 100 g   verified
--
-- A raw banana is 89. Neither row is quarantined, so both are reachable, and
-- both wore the same badge as the laboratory row beside them.
--
-- This is MyFitnessPal's failure exactly: their own help page says a verified
-- entry can still be wrong, and a published analysis found ~30% of their top
-- 1,000 most-logged foods carried a >20% error in at least one macro.
-- Cronometer's answer is the opposite -- crowd rows never enter the main
-- database, and every entry is labelled with its real origin, not a tick.
--
-- FROM NOW:
--   verified      = MEASURED, or entered by the trainer.
--                   usda_core, usda_generic, usda, trainer, restaurant, brand,
--                   and usda_online rows from Foundation / SR Legacy / Survey.
--   not verified  = a label somebody submitted, or a client typed.
--                   usda_branded, off, client.
--
-- Both search functions already sort `verified desc` as a tiebreaker, BELOW
-- trainer rows, usda_core rows and the usda_conflict flag -- so a branded row
-- now sorts under a measured row of the same name instead of level with it.
-- Nothing is hidden or deleted: a branded row is still findable, still
-- loggable, and still the right answer when the food really is that product.
--
-- ⚠️ BACKED UP FIRST, per the standing rule. One UPDATE away from undone.

create table if not exists public.bak_food_verified_20260909 as
  select id, source, verified, now() as backed_up_at from public.food_catalog;

update public.food_catalog
   set verified = false
 where source in ('usda_branded', 'off')
   and verified is distinct from false;

comment on column public.food_catalog.verified is
  'The numbers were MEASURED (USDA core/generic/legacy, Survey, a restaurant''s published data) or entered by the trainer. FALSE for manufacturer-submitted labels (usda_branded, off) and client-typed rows. Changed 2026-09-09: it previously meant only "not client-created", which made it true on 442,891 crowd rows and therefore meaningless. Undo: bak_food_verified_20260909.';
