-- A NOTE ON WHAT IS NOT HERE ANY MORE.
--
-- This body is much smaller than the 16 Aug detector. Earlier the same day,
-- migration 20260821171049_detector_stops_proposing_moves_and_cancellations
-- removed the orphan/pairing machinery and the 'moved' and 'cancelled'
-- reasons, because Dustin removed the question they existed to ask:
--
--   "on the schedule moves, if it picks up where the session was moved and the
--    workout is not there and it's still on the day the original session was on
--    then move it. you shouldnt need my approval for that"
--
-- The pairing now lives in sync_supervised_workouts_to_appointments(), which
-- PERFORMS the move. Two reasons still need a human and are all that remain:
-- 'uncovered' (an appointment nothing covers) and 'retired' (a slot that has
-- gone away). That migration was applied to the database but never written into
-- this directory; this file carries the resulting definition in full, so the
-- repo and production agree again.

-- The proposal detector stops filing suggestions the mover is forbidden to act on.
--
-- Two sources of noise, same root: it knew nothing about online_only clients or
-- about manual moves.
--
--   * online_only — Dustin, 21 Aug, named eleven clients whose workouts must
--     never follow the calendar: Tyler Dorsett, Bobbie Page, Celeste Lennon,
--     Robert Miller, Gerard Gautreaux, Krysta Ruiz-Schnitzler, Troy Schnitzler,
--     Madeleine Coker, Sharon Gautreaux, Dustin, Steph. The mover already
--     skipped them; the detector did not, so their appointments kept arriving
--     as "uncovered" decisions about a rule he had already made. Same for
--     "retired": an online-only client has no in-person slot to retire.
--
--   * manual moves — when a trainer deliberately moves a workout off its
--     appointment day, that day is uncovered BY DESIGN. Filing a proposal about
--     it asks him to reconsider a decision he just made.
--
-- Six pending proposals were superseded when this landed; the queue went from
-- six noise rows plus one real one to just the real one (Greg Lennon).

create or replace function public.detect_schedule_changes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  update schedule_change_proposals
  set status = 'superseded', resolved_at = now()
  where status = 'pending' and created_at < now() - interval '20 hours';

  update schedule_change_proposals
  set status = 'superseded', resolved_at = now()
  where status = 'pending' and reason in ('moved', 'cancelled');

  drop table if exists _scd_eligible;
  create temporary table _scd_eligible on commit drop as
  select distinct a.client_id
  from appointments a
  where (a.scheduled_at at time zone 'America/Chicago')::date >= v_today_ct;

  drop table if exists _scd_uncovered;
  create temporary table _scd_uncovered on commit drop as
  select a.client_id, a.id as appt_id, a.gcal_recurring_id,
         (a.scheduled_at at time zone 'America/Chicago')::date as to_date,
         c.name as client_name,
         to_char(a.scheduled_at at time zone 'America/Chicago','HH24:MI') as at_time
  from appointments a
  join clients c on c.id = a.client_id
  join _scd_eligible e on e.client_id = a.client_id
  where a.status = 'scheduled' and c.archived_at is null
    and not c.online_only
    and (a.scheduled_at at time zone 'America/Chicago')::date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id = a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date)
    -- The trainer moved this week's workout off the appointment day himself.
    -- The day is uncovered because he uncovered it.
    and not exists (select 1 from scheduled_workouts m
                    where m.client_id = a.client_id and m.deleted_at is null and m.supervised
                      and m.moved_by = 'manual'
                      and date_trunc('week', m.scheduled_date::timestamp)
                        = date_trunc('week', (a.scheduled_at at time zone 'America/Chicago')::date::timestamp));

  insert into schedule_change_proposals
    (client_id, appointment_id, gcal_recurring_id, to_date, reason, confidence, detail)
  select u.client_id, u.appt_id, u.gcal_recurring_id, u.to_date, 'uncovered',
         case when u.gcal_recurring_id is null then 'one_off' else 'pattern' end,
         jsonb_build_object('client', u.client_name, 'time', u.at_time)
  from _scd_uncovered u
  on conflict do nothing;

  insert into schedule_change_proposals (client_id, gcal_recurring_id, reason, confidence, detail)
  select p.client_id, p.series, 'retired', 'pattern',
         jsonb_build_object('client', p.client_name,
                            'was', to_char(date '2026-08-02' + p.pattern_dow,'Dy') || ' ' || p.pattern_time)
  from v_client_calendar_pattern p
  join clients c on c.id = p.client_id
  where p.is_retired
    and not c.online_only
    -- The client themselves has nothing booked at all. Otherwise their slot
    -- simply moved, and that is not a decision for anybody.
    and not exists (
      select 1 from appointments a
       where a.client_id = p.client_id and a.status = 'scheduled'
         and (a.scheduled_at at time zone 'America/Chicago')::date >= v_today_ct)
  on conflict do nothing;

  select count(*) into n from schedule_change_proposals where status = 'pending';
  return n;
end;
$function$;

-- Clear the ones already sitting in his queue for clients now walled off.
update schedule_change_proposals p
   set status = 'superseded', resolved_at = now()
  from clients c
 where c.id = p.client_id and p.status = 'pending' and c.online_only;
