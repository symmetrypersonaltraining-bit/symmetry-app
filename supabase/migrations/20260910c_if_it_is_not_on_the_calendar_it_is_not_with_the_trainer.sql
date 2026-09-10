-- THE WITH-YOU MARKER FOLLOWS THE CALENDAR. THE WORKOUT STAYS WHERE IT IS.
--
-- Dustin, 10 Sep 2026, 7:13am, with three names on Today's Sessions that
-- should not have been there:
--
--   "I need to know why Tyler, Troy and Christine are in my schedule. Troy n
--    christine are archived. Tyler only trains w me at 5am Mondays."
--   "Tyler trains on Mondays now. that should have been picked up by cal sync,
--    find out why it wasn't n fix it ... get it fixed this cant happen anymore."
--
-- And, on first reading the word "clears": "i dont want the workout cleared
-- just bc its not in my gcal." It is not. This touches ONE column,
-- scheduled_workouts.supervised, true -> false. The workout keeps its date, its
-- day and its status; the client still sees it and logs it. The only thing
-- that changes is whether it counts as a session with the trainer -- which is
-- what puts it on HIS Today's Sessions without an appointment.
--
-- THREE CAUSES, ONE SHAPE. Today's Sessions shows every workout marked with-you
-- for the day even without an appointment (27 Aug -- with-you sessions were
-- being missed). The marker is stamped by generate_scheduled_workouts from
-- client_training_patterns at generation time and was NEVER re-derived. So:
--
--   Christine -- archived 31 Aug. Archiving sets clients.archived_at and nothing
--   else; her programme kept 35 future rows, 9 marked with-you.
--   Troy      -- never archived in the app at all (done by hand today). Pattern
--   said Wed/Thu with-you; last appointment 29 Jul.
--   Tyler     -- trained Thursdays until 20 Aug. His pattern was corrected to
--   Monday-only; the rows generated 17/24 Aug kept Thursday = with-you through
--   10 December, plus all six days of a peak week that is photoshoot prep.
--
-- WHY CALENDAR SYNC NEVER CAUGHT IT. detect_schedule_changes has two rules: an
-- appointment with no with-you workout ('uncovered'), and a client with nothing
-- booked at all ('retired'). It has no rule for the inverse -- a with-you
-- workout with no appointment on a client who still trains. Tyler kept his
-- Mondays, so 'retired' never fired.
--
-- THE RULE. derive_supervised_from_calendar takes the marker OFF a future,
-- unlogged, scheduled workout that has no scheduled appointment that day. It is
-- DOWNWARD ONLY -- it never sets the marker -- and it is judged against the
-- client's OWN BOOKED HORIZON, the same rule the
-- supervised_workout_no_appointment integrity check already uses: a session
-- later than the last appointment the client has actually made is a booking
-- they have not made yet, not a ghost. Todd books two weeks out and is
-- programmed through October; he is untouched. Archived clients are judged on
-- every date.
--
-- NOT ITS BUSINESS: a workout tied to a LIVE appointment. When he moves a
-- booking in Google Calendar (imported every 15 minutes),
-- sync_supervised_workouts_to_appointments moves that workout to match -- and
-- it only moves MARKED workouts. So this runs AFTER the sync in the cron, and
-- skips anything linked to a scheduled appointment on any date. If the sync
-- cannot move one (the target day is taken), the row keeps its marker and the
-- appointment_no_supervised_workout check reports it.
--
-- FIRST RUN, 10 Sep: 42 rows unmarked across five clients (Tyler 19, Christine
-- 9, Troy 9, Lauren 4, Laurie 1); Todd, Celeste and Krysta correctly left
-- alone. Every changed row is in bak_ghost_sessions_20260910_cleared.

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
      -- tied to a live booking: the sync's to move, not ours to unmark
      and not exists (select 1 from appointments la where la.id = sw.appointment_id and la.status = 'scheduled')
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
         case when p_dry_run then 'would unmark' else 'unmarked' end
  from ghost g order by g.c_name, g.s_date;
end $$;

comment on function public.derive_supervised_from_calendar(boolean) is
  'Takes the with-you marker (supervised) OFF future scheduled workouts that have no appointment that day and are not tied to a live appointment, judged against the client''s own booked horizon (any date if archived). The workout itself is untouched. Downward only. Runs AFTER sync_supervised_workouts_to_appointments in cron job calendar_derived_consistency. Dustin, 10 Sep 2026.';

-- Into the job that already keeps the schedule consistent with the calendar --
-- AFTER the sync, so a workout whose booking moved is moved first, and never
-- unmarked out from under it.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'calendar_derived_consistency'),
  command := $job$
    select public.sync_supervised_workouts_to_appointments(false);
    select public.derive_supervised_from_calendar(false);
    select public.recalc_pending_payment_reminders();
  $job$
);
