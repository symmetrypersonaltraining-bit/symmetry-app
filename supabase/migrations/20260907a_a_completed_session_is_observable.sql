-- A COMPLETED SESSION HAS TO BE OBSERVABLE
--
-- Dustin, 7 Sep, home showing both of today's sessions on Start and the week at
-- 0% adherence: "I logged my workout earlier... I just relogged n completed it
-- and still won't save."
--
-- It had saved: workout_logs completed at 2:04pm Central with 31 set logs, and
-- today's scheduled_workouts row marked completed and linked to that log. He was
-- looking at a render made before he finished. The screen-side fix is
-- RefreshOnReturn; these are the two things found underneath it, both of which
-- made the problem harder to see than it needed to be.

begin;

-- 1. updated_at WAS DEAD.
--
-- The row that completed today still read 2026-08-12 on updated_at, identical to
-- created_at, because nothing maintained the column. "When did this row become
-- complete" is the first question you ask when a screen and the data disagree,
-- and it could not be answered at all.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists scheduled_workouts_touch_updated_at on public.scheduled_workouts;
create trigger scheduled_workouts_touch_updated_at
  before update on public.scheduled_workouts
  for each row execute function public.touch_updated_at();

-- 2. REALTIME COULD NOT CARRY THE CHANGE.
--
-- RealtimeScheduleSync subscribes to this table and refreshes the route when a
-- row changes - it is the thing meant to turn Start into Done the moment a
-- session is credited. postgres_changes on a table with RLS enabled needs
-- REPLICA IDENTITY FULL; without it old_record cannot be sent. The component is
-- written to no-op silently when realtime hands it nothing, so this failed
-- quietly and looked like nothing at all.
--
-- The cost is a fuller WAL record per update on a table that takes a few hundred
-- writes a day.
alter table public.scheduled_workouts replica identity full;

-- 3. AND SOMETHING WATCHES FOR THE SHAPE WHERE IT IS ACTUALLY BROKEN.
--
-- Today was a stale screen; the data was right. It took a database query to
-- know that, because nothing was watching. This check runs with the rest of
-- the scheduling integrity checks, twice a day.
--
-- Deliberately narrow: the log is for THIS day, on THIS date, and finished.
-- Not "any completed log with no scheduled row" - that is every off-plan and
-- extra session a client does, and it would make the alarm meaningless.
-- Measured across 60 days and every active client when it was written: zero
-- rows. So anything that appears here is real, and it is a workout somebody
-- did that their adherence does not count.
--
-- Written as a text edit of the live function so the two checks already in it
-- are carried forward verbatim rather than retyped.
do $do$
declare src text; out text;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='run_scheduling_integrity_checks' and pronamespace='public'::regnamespace;
  if src is null then return; end if;
  if position('completed_session_not_credited' in src) > 0 then return; end if;

  out := replace(src,
$old$    group by c.name, p.name
    having count(*) > 1
  ) t;$old$,
$new$    group by c.name, p.name
    having count(*) > 1
  ) t

  union all

  select 'completed_session_not_credited', 'critical', count(*),
         jsonb_agg(jsonb_build_object('client', t.name, 'date', t.scheduled_date,
                                      'label', t.label, 'logged_at', t.logged_at))
  from (
    select c.name, sw.scheduled_date, d.label, wl.completed_at as logged_at
    from scheduled_workouts sw
    join clients c on c.id = sw.client_id
    join days d on d.id = sw.day_id
    join workout_logs wl
      on wl.client_id = sw.client_id and wl.day_id = sw.day_id
     and wl.log_date = sw.scheduled_date and wl.completed
    where sw.deleted_at is null
      and sw.status <> 'completed'
      and sw.scheduled_date >= v_today_ct - 30
      and c.archived_at is null
  ) t;$new$);

  if out = src then raise exception 'run_scheduling_integrity_checks: anchor not found'; end if;
  execute out;
end $do$;

commit;
