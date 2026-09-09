-- THE FAT WAS LOST IN TRANSIT, AND THE CALORIES KNEW IT ALL ALONG.
--
-- Dustin, 9 Sep 2026, on the 95 logged rows whose calories disagree with their
-- own macros: "6: recompute to real numbers."
--
-- 15 of the 95 share one signature: est_fats = 0 while the calories sit far
-- above what protein and carbs alone can pay for. That is not a food with no
-- fat in it. It is the fat column arriving empty from the photo path -- the
-- route reads `result.fat_g ?? result.fats_g`, and rows written before that
-- fallback existed lost whichever key the model happened to use.
--
-- The calories survived, so the fat is recoverable exactly: whatever the
-- calories have left after protein and carbs are paid for.
--
--     4 slices of sausage pizza   1,120 kcal  52P  98C  0F  ->  57.8 F
--     Homemade pizza                820 kcal  38P  85C  0F  ->  36.4 F
--     Protein powder, one scoop     130 kcal  23P   3C  0F  ->   2.9 F
--     Two Dove dark chocolate        84 kcal   1P   9C  0F  ->   4.9 F
--
-- Every one lands where the food actually lands. This is arithmetic on a number
-- that was already right, not a new estimate. 266 g of fat restored in total.
--
-- ── WHAT THIS DELIBERATELY DOES NOT TOUCH ─────────────────────────────────
--
-- The other 80 rows are not solvable this way and are LEFT ALONE. "banana --
-- 105 kcal, 1P, 27C, 14F" has no non-negative solution for any single macro:
-- the fat is simply wrong, and the row needs re-resolving against the food
-- database, not arithmetic. That is a script through the resolver, with the
-- before and after read before anything is written.
--
-- ⚠️ BACKED UP FIRST, per the standing rule.

create table if not exists public.bak_offplan_macros_20260909 as
  select id, client_id, log_date, meal_position, off_plan_details,
         est_kcal, est_protein, est_carbs, est_fats, off_plan_macros, now() as backed_up_at
  from public.meal_adherence_logs
  where est_kcal is not null
    and coalesce(est_fats, 0) = 0
    and (coalesce(est_protein, 0) + coalesce(est_carbs, 0)) > 0
    and (est_kcal - coalesce(est_protein, 0) * 4 - coalesce(est_carbs, 0) * 4) > 25;

update public.meal_adherence_logs l
   set est_fats = round(((l.est_kcal - coalesce(l.est_protein,0)*4 - coalesce(l.est_carbs,0)*4) / 9.0)::numeric, 1),
       -- est_* and off_plan_macros are written together and must never
       -- disagree; the stored analysis moves with the column.
       off_plan_macros = case
         when l.off_plan_macros is null then null
         else jsonb_set(
                jsonb_set(l.off_plan_macros, '{fats}',
                  to_jsonb(round(((l.est_kcal - coalesce(l.est_protein,0)*4 - coalesce(l.est_carbs,0)*4) / 9.0)::numeric, 1))),
                '{fat_recovered_from_calories}', 'true'::jsonb)
       end
 from public.bak_offplan_macros_20260909 b
where l.id = b.id;
