-- Let a meal plan and a macro target be SCHEDULED ahead, and be seen before
-- they start.  Applied to LIVE (mkfiginpiesospsnktea) on 16 Aug 2026.
--
-- Dustin, 16 Aug: "i do not want that project telling me it cant make a meal
-- plan live in the future and i cant look at it live in the future again. i
-- like the flag telling me when the new meal plan starts but there is zero
-- logic behind me not being able to plan ahead, schedule a meal plan and look
-- at it ahead of time."
--
-- ── 1. Two guards dropped ──────────────────────────────────────────────────
--
-- trg_no_future_live_plan and trg_no_future_macro_target raised an exception on
-- any row dated past Central today. They existed to prop up a flag model the
-- application no longer uses: plans resolve by DATE — pickPlanForDate takes the
-- newest effective_date on or before the date being VIEWED, exactly as
-- macro_targets has always resolved. A future-dated row therefore cannot govern
-- today, and it is the date comparison that guarantees that, not the status.
--
-- REVERSIBLE: both trigger definitions and both function bodies are captured
-- verbatim in bak_dropped_plan_guards_20260816 before anything is dropped.
--
-- ── 2. The nightly promotion job no longer eats future plans ───────────────
--
-- flip_due_meal_plans archived by status alone, so the morning a scheduled plan
-- came due it also retired every other plan the client had — including ones
-- booked for later. Gerard and Jerry each have eleven plans booked to October;
-- under the old body the first to go live would have taken the other ten with
-- it, silently, one client at a time. It now archives only rows already in
-- force as of the run date.
--
-- Verified inside a rolled-back transaction against real rows: a flip run dated
-- 2026-08-17 promotes Gerard's plan for that day and leaves all nine of his
-- later plans untouched.
--
-- Nothing is deleted anywhere in this file. No meal_plans, meals, meal_items,
-- macro_targets or meal_adherence_logs row is modified.

create table if not exists public.bak_dropped_plan_guards_20260816 (
  dropped_at   timestamptz default now(),
  object_name  text,
  object_kind  text,
  definition   text,
  why          text
);

insert into public.bak_dropped_plan_guards_20260816 (object_name, object_kind, definition, why)
select t.tgname, 'trigger', pg_get_triggerdef(t.oid),
       'Blocked scheduling a plan/target ahead of Central today.'
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgname in ('trg_no_future_live_plan','trg_no_future_macro_target')
union all
select p.proname, 'function', pg_get_functiondef(p.oid), 'Trigger body for the guard above.'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('enforce_no_future_live_plan','enforce_no_future_macro_target');

drop trigger if exists trg_no_future_live_plan on public.meal_plans;
drop trigger if exists trg_no_future_macro_target on public.macro_targets;
drop function if exists public.enforce_no_future_live_plan();
drop function if exists public.enforce_no_future_macro_target();

create or replace function public.flip_due_meal_plans(p_today date default null::date)
returns table(client_id uuid, plan_went_live uuid, plans_archived uuid[])
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  central_today date := coalesce(p_today, (now() at time zone 'America/Chicago')::date);
  r record;
  v_archived uuid[];
begin
  for r in
    select distinct on (mp.client_id) mp.client_id as cid, mp.id as pid, mp.effective_date as eff
    from meal_plans mp
    where mp.status = 'pending'
      and mp.effective_date is not null
      and mp.effective_date <= central_today
    order by mp.client_id, mp.effective_date desc, mp.created_at desc
  loop
    with arch as (
      update meal_plans m
         set status = 'archived'
       where m.client_id = r.cid
         and m.id <> r.pid
         -- THE FIX: only plans that have actually started. A plan dated after
         -- today is not superseded by this one going live; it has not begun.
         and m.effective_date is not null
         and m.effective_date <= central_today
         and m.status in ('live', 'pending')
       returning m.id
    )
    select coalesce(array_agg(a.id), '{}'::uuid[]) into v_archived from arch a;

    update meal_plans m set status = 'live' where m.id = r.pid and m.status = 'pending';

    insert into plan_flip_log (client_id, plan_id, action, effective_date, details)
    values (r.cid, r.pid, 'went_live', r.eff,
            jsonb_build_object('archived_plan_ids', to_jsonb(v_archived), 'run_for_date', central_today));

    client_id := r.cid;
    plan_went_live := r.pid;
    plans_archived := v_archived;
    return next;
  end loop;
end;
$function$;
