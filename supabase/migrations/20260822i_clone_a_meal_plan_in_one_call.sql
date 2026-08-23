-- Copying a meal plan by hand is where the mistakes come from. Three separate
-- attempts on 22 Aug wrote CTE inserts that silently inserted ZERO item rows --
-- no error, just a plan with six empty meals -- and one of those attempts got
-- as far as sitting live alongside the real plan. One call, or it will happen
-- again.
--
-- SECURITY DEFINER, but that does NOT open a door: guard_locked_meal_plan reads
-- the caller's PostgREST role, which SECURITY DEFINER does not change. Called
-- from a direct session it works; called through the API for a locked client it
-- is refused exactly as a plain INSERT would be. EXECUTE is revoked from the
-- API roles anyway.

create or replace function public.clone_meal_plan(
  p_source    uuid,
  p_effective date,
  p_title     text default null,
  p_status    text default 'live'
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new    uuid;
  v_client uuid;
  v_ver    integer;
  m        record;
  v_meal   uuid;
  v_items  integer := 0;
begin
  select client_id into v_client from public.meal_plans where id = p_source;
  if v_client is null then
    raise exception 'clone_meal_plan: no plan with id %', p_source;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_ver
    from public.meal_plans where client_id = v_client;

  insert into public.meal_plans
    (client_id, version_number, effective_date, status, title, change_reason, day_group, created_by_client)
  select v_client, v_ver, p_effective, p_status,
         coalesce(p_title, title),
         'Cloned from ' || p_source::text,
         day_group, created_by_client
    from public.meal_plans where id = p_source
  returning id into v_new;

  for m in select * from public.meals where meal_plan_id = p_source order by position loop
    insert into public.meals (meal_plan_id, name, timing, position, swaps, rotation)
      values (v_new, m.name, m.timing, m.position, m.swaps, m.rotation)
      returning id into v_meal;

    insert into public.meal_items
      (meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position, kcal, micros)
    select v_meal, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position, kcal, micros
      from public.meal_items where meal_id = m.id;

    v_items := v_items + (select count(*) from public.meal_items where meal_id = v_meal);
  end loop;

  -- A plan with meals but no food in them is the exact failure this function
  -- exists to prevent. Refuse to leave one behind.
  if v_items = 0 and exists (select 1 from public.meal_items mi
                             join public.meals mm on mm.id = mi.meal_id
                            where mm.meal_plan_id = p_source) then
    raise exception 'clone_meal_plan: copied 0 items from a source that has some. Nothing written.';
  end if;

  return v_new;
end;
$$;

revoke execute on function public.clone_meal_plan(uuid, date, text, text) from public, anon, authenticated, service_role;
