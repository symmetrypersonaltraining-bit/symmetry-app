-- IF IT IS NOT ON THE CALENDAR, IT IS NOT WITH THE TRAINER.
--
-- Dustin, 10 Sep 2026, 7:13am, with three names on Today's Sessions that
-- should not have been there:
--
--   "I need to know why Tyler, Troy and Christine are in my schedule. Troy n
--    christine are archived. Tyler only trains w me at 5am Mondays."
--   "Tyler trains on Mondays now. that should have been picked up by cal sync,
--    find out why it wasn't n fix it ... get it fixed this cant happen anymore."
--
-- THREE CAUSES, ONE SHAPE. Today's Sessions shows every workout flagged
-- supervised for the day even without an appointment (27 Aug -- supervised
-- sessions were being missed). The flag is stamped by generate_scheduled_workouts
-- from client_training_patterns at generation time and NEVER re-derived. So:
--
--   Christine -- archived 31 Aug. Archiving sets clients.archived_at and nothing
--   else; her programme kept 35 future rows, 9 flagged with-you.
--   Troy      -- never archived in the app at all (done by hand today). Pattern
--   said Wed/Thu with-you; last appointment 29 Jul.
--   Tyler     -- trained Thursdays until 20 Aug. His pattern was corrected to
--   Monday-only; the rows generated 17/24 Aug kept Thursday = with-you through
--   10 December, plus all six days of a peak week that is a photoshoot prep,
--   not sessions with him.
--
-- WHY CALENDAR SYNC NEVER CAUGHT IT. detect_schedule_changes has two rules: an
-- appointment with no with-you workout ('uncovered'), and a client with nothing
-- booked at all ('retired'). It has no rule for the inverse -- a with-you
-- workout with no appointment on a client who still trains. Tyler kept his
-- Mondays, so 'retired' never fired.
--
-- THE RULE. derive_supervised_from_calendar clears the flag on a future,
-- unlogged, scheduled workout that has no scheduled appointment that day. It is
-- DOWNWARD ONLY -- it never sets the flag -- and it is judged against the
-- client's OWN BOOKED HORIZON, the same rule the
-- supervised_workout_no_appointment integrity check already uses: a session
-- later than the last appointment the client has actually made is a booking
-- they have not made yet, not a ghost. Todd books two weeks out and is
-- programmed through October; he is untouched. Archived clients are judged on
-- every date.
--
-- It runs inside the existing calendar_derived_consistency cron (06:05, 09:05,
-- 18:05 Central), ahead of sync_supervised_workouts_to_appointments.
--
-- FIRST RUN, 10 Sep: 42 rows cleared across five clients (Tyler 19, Christine
-- 9, Troy 9, Lauren 4, Laurie 1); Todd, Celeste and Krysta correctly left
-- alone. Backed up to bak_ghost_sessions_20260910_cleared.

create or replace function public.derive_supervised_from_calendar(p_dry_run boolean default true)
returns table (client_name text, sched_date date, day_label text, action text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  return query
  with horizon as (
    select a.client_id, max((a.scheduled_at at time zone 'America/Chicago')::date) as last_booked
    from appointments a where a.status = 'scheduled' group by a.client_id
  ),
  ghost as (
    select sw.id, c.name as c_name, sw.scheduled_date as s_date, d.label as d_label
    from scheduled_workouts sw
    join clients c on c.id = sw.client_id
    left join days d on d.id = sw.day_id
    left join horizon h on h.client_id = sw.client_id
    where sw.deleted_at is null
      and sw.supervised
      and sw.status = 'scheduled'
      and sw.workout_log_id is null
      and sw.scheduled_date >= v_today
      and not exists (
        select 1 from appointments a
        where a.client_id = sw.client_id and a.status = 'scheduled'
          and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date)
      and (c.archived_at is not null or (h.last_booked is not null and sw.scheduled_date <= h.last_booked))
  ),
  upd as (
    update scheduled_workouts sw set supervised = false
    from ghost g where sw.id = g.id and not p_dry_run
    returning sw.id
  )
  select g.c_name, g.s_date, g.d_label,
         case when p_dry_run then 'would clear' else 'cleared' end
  from ghost g order by g.c_name, g.s_date;
end $$;

comment on function public.derive_supervised_from_calendar(boolean) is
  'Clears supervised on future scheduled workouts that have no appointment that day, judged against the client''s own booked horizon (or any date if archived). Downward only. Runs in cron job calendar_derived_consistency. Dustin, 10 Sep 2026: "if it is not on the calendar it is not with me."';

-- Wire it into the job that already keeps the schedule consistent with the
-- calendar, first in line so the sync and the billing recalc read cleaned rows.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'calendar_derived_consistency'),
  command := $job$
    select public.derive_supervised_from_calendar(false);
    select public.sync_supervised_workouts_to_appointments(false);
    select public.recalc_pending_payment_reminders();
  $job$
);
