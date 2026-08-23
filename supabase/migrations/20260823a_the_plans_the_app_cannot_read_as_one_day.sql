-- Two nutrition checks, both new, because nothing had ever compared a client's
-- meal plan with the macro targets they are graded against.
--
-- plan_cannot_be_read_as_one_day — the plan the food logger now reads for the
-- day's target, in the two shapes it must refuse rather than guess at:
--   Madeleine Coker — M2, M4 and M5 hold no food, so her plan sums to 973
--     against the 1,550 Dustin set her. A half-entered plan, not a wrong
--     target; showing her 973 would be the app inventing a cut.
--   Claudine Ocon — three options at each of five slots, not interchangeable
--     (M1 runs 328-463 kcal, M5 185-396). There is no single total for a day,
--     so summing whichever option sorts first invents a number.
--
-- macro_target_stale_against_plan — the plan drives the chart now, so a
-- divergence means the macro_targets row is STALE and adherence is still being
-- graded against it. Five today. Three of them (Cheyenne, Tyler, Hassan) carry
-- rows AUTO-SEEDED FROM BODYWEIGHT on 23 Jul, written straight over plans that
-- already existed — Cheyenne's plan was built on 20 Jul to about 1,500 kcal and
-- had 2,440 written on top of it three days later. The other two (Gerard,
-- Robert) are real plans that drifted from real targets.
--
-- 10% with a 100 kcal floor: plan items carry fractional macros and a 4/4/9 sum
-- lands a calorie or two off a typed target, while a real gap here is hundreds.

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

  with gov as (
    select c.id, c.name,
           (select mp.id from meal_plans mp
             where mp.client_id = c.id and mp.status = 'live'
               and mp.effective_date <= v_today_ct
             order by mp.effective_date desc, mp.created_at desc limit 1) as plan_id,
           (select mt.calories from macro_targets mt
             where mt.client_id = c.id and mt.effective_date <= v_today_ct
             order by mt.effective_date desc limit 1) as target_kcal
    from clients c where c.archived_at is null
  ),
  shape as (
    select g.id, g.name, g.target_kcal, g.plan_id,
           count(m.id) as meals,
           count(distinct m.position) as slots,
           count(*) filter (
             where m.position between 1 and 5
               and not exists (select 1 from meal_items mi where mi.meal_id = m.id)
           ) as empty_core_slots
    from gov g join meals m on m.meal_plan_id = g.plan_id
    group by g.id, g.name, g.target_kcal, g.plan_id
  ),
  total as (
    select s.id,
           round((sum(mi.protein) * 4 + sum(mi.carbs) * 4 + sum(mi.fats) * 9)::numeric) as plan_kcal
    from shape s
    join meals m on m.meal_plan_id = s.plan_id
    join meal_items mi on mi.meal_id = m.id
    group by s.id
  )

  select 'plan_cannot_be_read_as_one_day', 'warn', count(*),
         jsonb_agg(jsonb_build_object('client', x.name, 'why', x.why))
  from (
    select s.name,
           case when s.empty_core_slots > 0 then 'a core slot has no food'
                else 'options at a slot — no single daily total' end as why
    from shape s
    where s.empty_core_slots > 0 or s.meals > s.slots
  ) x

  union all

  select 'macro_target_stale_against_plan', 'warn', count(*),
         jsonb_agg(jsonb_build_object(
           'client', y.name, 'target_kcal', y.target_kcal,
           'plan_kcal', y.plan_kcal, 'gap', y.plan_kcal - y.target_kcal))
  from (
    select s.name, s.target_kcal, t.plan_kcal
    from shape s join total t on t.id = s.id
    where s.empty_core_slots = 0 and s.meals = s.slots
      and s.target_kcal is not null and s.target_kcal > 0
      and abs(t.plan_kcal - s.target_kcal) > greatest(100, s.target_kcal * 0.10)
  ) y;

  get diagnostics n = row_count;
  return n;
end;
$$;
