-- The auto-rotation cloner keeps kcal and micros.
--
-- ── The trap, which this codebase has already been caught by once ──────────
--
-- `src/app/api/nutrition/plan-edit/route.ts` carries this comment above its own
-- clone, verbatim:
--
--   "kcal + micros MUST be in this list. It is an explicit column list, so a
--    column missing from it is silently dropped when the plan is cloned -
--    the trap flagged in docs/BACKLOG.md item 4."
--
-- The app-side cloner was fixed. `generate_rotation_plans()` — which does the
-- same clone, from the database, on pg_cron job 14, every morning at 06:20 CT —
-- has the identical explicit column list and is missing both columns.
--
-- ── Measured before changing anything ──────────────────────────────────────
--
--   select count(*), count(*) filter (where kcal is not null),
--          count(*) filter (where micros is not null) from meal_items;
--   → 1566 rows, 0 with kcal, 0 with micros.
--
-- So this is **latent, not active**. Nothing is being lost today because there
-- is nothing to lose: not one meal item anywhere in the database has ever
-- carried a kcal or a micros value. The clone is faithful by accident.
--
-- It is worth fixing anyway, and now rather than later, for one reason: the app
-- has just started producing that data. FoodSearchSheet carries the full
-- nutrient bag (`d445002`), the AI parse path carries it (`3c59a08`), and
-- plan-edit already copies both columns. The first meal plan built with real
-- nutrient data would be silently stripped of it for every rotation client —
-- 24 plans, 724 items, running out to 19 October — and the symptom would appear
-- weeks later as "the nutrients are missing on future plans", which is a
-- miserable thing to diagnose backwards.
--
-- A fix that cannot change behaviour today, on a path that will need it
-- tomorrow, is the cheapest this ever gets.
--
-- ── Not changed ────────────────────────────────────────────────────────────
--
-- Everything else is byte-for-byte the previous definition. The rotation logic,
-- the horizon, the skip-if-a-plan-already-exists guard and the version
-- numbering are untouched; only the two column names are added.
--
-- Reversible: the previous definition is captured verbatim in
-- public.bak_generate_rotation_plans_20260816 by the migration alongside this
-- one. Run its `def` column to restore.

create or replace function public.generate_rotation_plans(p_horizon_weeks integer default 10)
 returns table(client_id uuid, effective_date date, cycle_index integer, new_plan_id uuid, meals_cloned integer, items_cloned integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  central_today date := (now() at time zone 'America/Chicago')::date;
  base_monday date;
  rot record; i int; mday date; idx int; tmpl uuid; new_pid uuid; next_ver int;
  m record; new_mid uuid; v_meals int; v_items int; rc int; tmpl_reason text;
begin
  base_monday := central_today + ((8 - extract(isodow from central_today)::int) % 7);
  for rot in select * from plan_rotations pr where pr.active loop
    for i in 0..(p_horizon_weeks - 1) loop
      mday := base_monday + (i * 7);
      if exists (select 1 from meal_plans mp where mp.client_id = rot.client_id and mp.effective_date = mday) then
        continue;
      end if;
      idx := ((((mday - rot.anchor_monday) / 7) % rot.weeks) + rot.weeks) % rot.weeks;
      tmpl := rot.template_plan_ids[idx + 1];
      select coalesce(max(mp.version_number), 0) + 1 into next_ver from meal_plans mp where mp.client_id = rot.client_id;
      select mp.change_reason into tmpl_reason from meal_plans mp where mp.id = tmpl;
      insert into meal_plans (client_id, version_number, effective_date, status, change_reason)
      values (rot.client_id, next_ver, mday, 'pending', 'Auto-rotation wk' || (idx + 1) || ': ' || coalesce(tmpl_reason, ''))
      returning id into new_pid;
      v_meals := 0; v_items := 0;
      for m in select * from meals mm where mm.meal_plan_id = tmpl loop
        insert into meals (meal_plan_id, name, timing, position, swaps, rotation)
        values (new_pid, m.name, m.timing, m.position, m.swaps, m.rotation)
        returning id into new_mid;
        v_meals := v_meals + 1;
        -- kcal and micros ARE in this list now. See the header: an explicit
        -- column list silently drops whatever is not named in it, and this is
        -- the second cloner in the app to be caught by that.
        insert into meal_items (meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position, kcal, micros)
        select new_mid, mi.food, mi.amount, mi.unit, mi.is_unlimited, mi.basis, mi.protein, mi.carbs, mi.fats, mi.position, mi.kcal, mi.micros
        from meal_items mi where mi.meal_id = m.id;
        get diagnostics rc = row_count;
        v_items := v_items + rc;
      end loop;
      client_id := rot.client_id; effective_date := mday; cycle_index := idx;
      new_plan_id := new_pid; meals_cloned := v_meals; items_cloned := v_items;
      return next;
    end loop;
  end loop;
end;
$function$;
