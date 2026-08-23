-- Dustin authors his own (and Steph's) meal plans in the Command Center project.
-- The app must never write them: not the AI plan builder, not plan-edit, not
-- adopt-plan, not the agent tools. Only a direct database session -- which is
-- what the Command Center chat connects with -- may change a locked plan.
--
-- TWO TRAPS THIS GUARD HAD TO CLEAR, both found by testing it rather than
-- trusting it -- see the comments inside the function.
--
-- NOTE ON THE ROLE CHECK. An earlier version of this guard tested current_user.
-- That silently allowed everything: inside a SECURITY DEFINER function
-- current_user is the function OWNER (postgres), never the caller. The caller's
-- identity survives in the `role` GUC, which PostgREST sets with SET LOCAL ROLE
-- on every request (anon / authenticated / service_role) and which reads 'none'
-- on a direct psql/MCP connection. That is the discriminator we test.

alter table public.clients
  add column if not exists plan_locked boolean not null default false;

comment on column public.clients.plan_locked is
  'True when this client''s meal plan is authored outside the app. Every app-side write to meal_plans / meals / meal_items / macro_targets for this client is rejected by guard_locked_meal_plan().';

create or replace function public.guard_locked_meal_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r        record;
  v_caller text := coalesce(current_setting('role', true), 'none');
  v_client uuid;
  v_name   text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  -- A direct database session (the Command Center chat, the SQL editor, a
  -- migration) carries no PostgREST role. Those are the author's own hands.
  if v_caller in ('none', 'postgres', 'supabase_admin')
     and current_setting('request.jwt.claims', true) is null then
    return r;
  end if;

  -- Field access on a `record` variable resolves at run time. A CASE over
  -- new.<column> does NOT: plpgsql demands every branch's column exist on the
  -- row type, so `new.meal_plan_id` inside a meal_plans trigger aborts the
  -- write for every client, locked or not. Hence the IF ladder.
  if tg_table_name in ('meal_plans', 'macro_targets') then
    v_client := r.client_id;
  elsif tg_table_name = 'meals' then
    select mp.client_id into v_client
      from public.meal_plans mp
     where mp.id = r.meal_plan_id;
  elsif tg_table_name = 'meal_items' then
    select mp.client_id into v_client
      from public.meals m
      join public.meal_plans mp on mp.id = m.meal_plan_id
     where m.id = r.meal_id;
  end if;

  if v_client is null then
    return r;
  end if;

  select c.name into v_name
    from public.clients c
   where c.id = v_client and c.plan_locked;

  if v_name is not null then
    raise exception
      'The meal plan for % is authored outside the app and cannot be changed here (% on %).',
      v_name, tg_op, tg_table_name
      using errcode = 'check_violation',
            hint = 'Change it from the Command Center project instead. The app only ever displays this plan.';
  end if;

  return r;
end;
$$;

drop trigger if exists trg_guard_locked_meal_plan   on public.meal_plans;
drop trigger if exists trg_guard_locked_meals       on public.meals;
drop trigger if exists trg_guard_locked_meal_items  on public.meal_items;
drop trigger if exists trg_guard_locked_macro_targets on public.macro_targets;

create trigger trg_guard_locked_meal_plan
  before insert or update or delete on public.meal_plans
  for each row execute function public.guard_locked_meal_plan();

create trigger trg_guard_locked_meals
  before insert or update or delete on public.meals
  for each row execute function public.guard_locked_meal_plan();

create trigger trg_guard_locked_meal_items
  before insert or update or delete on public.meal_items
  for each row execute function public.guard_locked_meal_plan();

create trigger trg_guard_locked_macro_targets
  before insert or update or delete on public.macro_targets
  for each row execute function public.guard_locked_meal_plan();

update public.clients
   set plan_locked = true
 where name in ('Dustin Gautreaux', 'Steph Gautreaux');
