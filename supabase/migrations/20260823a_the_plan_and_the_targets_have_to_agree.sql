-- A client's meal plan and the macro targets they are graded against are two
-- separate rows kept in step by hand, and nothing has ever compared them.
--
-- On 23 Aug, switching the food logger's daily target to the plan's own total
-- was about to move ELEVEN clients' numbers, some of them hard: Cheyenne
-- 2,440 → 1,480, Tyler 3,040 → 2,135, Madeleine 1,550 → 973. Those plans do not
-- add up to a full day. The targets are right and the plans are short, so a
-- client would have been shown several hundred calories under what their
-- trainer set. It was caught by measuring, not by any check. Now there is one.
--
-- 10% (floor 100 kcal) is the tolerance because plan items carry fractional
-- macros and the 4/4/9 sum lands a calorie or two off a typed target; a genuine
-- gap here is hundreds, not units. At that tolerance seven of the eleven flag,
-- which is the right set — the other four are 75-126 kcal and are noise.
--
-- The same summation the app uses: one meal per position (the first option at
-- that slot), so a rotation plan counts as one day and not five.
--
-- Cron job 17 runs it with the other two check functions:
--   select cron.alter_job(17, command => 'select public.run_integrity_checks();
--     select public.run_scheduling_integrity_checks();
--     select public.run_nutrition_integrity_checks();');

create or replace function public.run_nutrition_integrity_checks()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  insert into integrity_checks (check_name, severity, count, detail)
  select 'plan_total_disagrees_with_macro_target', 'warn', count(*),
         jsonb_agg(jsonb_build_object(
           'client', t.name, 'target_kcal', t.target_kcal,
           'plan_kcal', t.plan_kcal, 'gap', t.plan_kcal - t.target_kcal))
  from (
    with gov as (
      select c.id, c.name,
             (select mp.id from meal_plans mp
               where mp.client_id = c.id and mp.status = 'live'
                 and mp.effective_date <= v_today_ct
               order by mp.effective_date desc, mp.created_at desc limit 1) as plan_id,
             (select mt.calories from macro_targets mt
               where mt.client_id = c.id and mt.effective_date <= v_today_ct
               order by mt.effective_date desc limit 1) as target_kcal
      from clients c
      where c.archived_at is null and not coalesce(c.nutrition_only, false) is null
    ),
    firstpos as (
      select g.id, m.position, min(m.id::text) as keep
      from gov g join meals m on m.meal_plan_id = g.plan_id
      group by g.id, m.position
    ),
    sums as (
      select f.id,
             round((sum(mi.protein) * 4 + sum(mi.carbs) * 4 + sum(mi.fats) * 9)::numeric) as plan_kcal
      from firstpos f join meal_items mi on mi.meal_id = f.keep::uuid
      group by f.id
    )
    select g.name, g.target_kcal, s.plan_kcal
    from gov g join sums s on s.id = g.id
    where g.target_kcal is not null
      and g.target_kcal > 0
      and abs(s.plan_kcal - g.target_kcal) > greatest(100, g.target_kcal * 0.10)
  ) t;

  get diagnostics n = row_count;
  return n;
end;
$$;
