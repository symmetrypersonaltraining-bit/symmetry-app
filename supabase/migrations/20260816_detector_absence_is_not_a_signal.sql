-- The calendar detector stops treating a missing appointment as a problem.
--
-- ── THE PRINCIPLE, IN DUSTIN'S WORDS ────────────────────────────────────────
--
--   "Whether they have an appointment in the schedule should not change what I
--    programmed in the future. When I update the schedule each week, the
--    supervised workouts should get moved to the scheduled days, but until then
--    they stay on the app schedule where I put them."
--
-- The programmed schedule is the DEFAULT and it PERSISTS. An appointment is a
-- POSITIVE signal that can MOVE a workout. The ABSENCE of an appointment is not
-- a signal at all and must never flag, move or remove anything.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
--
-- The nightly job emitted reason='orphaned' for every supervised workout with
-- no appointment on that date — i.e. it treated the default state as an error.
-- 92 pending proposals on 16 Aug, most of them this false positive. Todd Prine
-- had 8, all false: his recurring Google series had simply lapsed while his
-- programming was exactly right.
--
-- ── WHY 'orphaned' IS NOT SIMPLY DELETED ────────────────────────────────────
--
-- The obvious fix — delete the orphaned INSERT — silently breaks the feature
-- Dustin actually wants. The old move-pairing worked by MUTATING an existing
-- pending 'orphaned' row into a 'moved' one. No orphan rows, no pairing, no
-- 'moved' proposals ever again.
--
-- So orphans are still COMPUTED; they are just never PERSISTED on their own.
-- They exist only long enough to be paired with an uncovered date in the same
-- week. An orphan nothing can absorb is dropped on the floor, which is the rule:
-- emit nothing.
--
-- ── THE RULES NOW ───────────────────────────────────────────────────────────
--
--   Supervised workout, no appointment      → NOTHING (was 'orphaned')
--   Client with zero future appointments    → SKIPPED ENTIRELY, no proposals
--   Orphan + uncovered, same client + week  → ONE 'moved', from_date → to_date
--   Appointment, no supervised workout      → 'uncovered'      (kept)
--   Appointment cancelled in Google         → 'cancelled'      (kept)
--   Recurring series with no future dates   → 'retired'        (kept)
--
-- Eligibility is "has at least one future appointment of ANY status", which is
-- the same test the spec's own verification query uses. A client whose only
-- future appointments are cancelled still has rows, so 'cancelled' keeps
-- working for them — that is deliberate.
--
-- ── PAIRING IS 1:1 ──────────────────────────────────────────────────────────
--
-- Matched by row_number within (client, ISO week). Two orphans and one uncovered
-- pairs the first and drops the second. One orphan and two uncovered pairs the
-- first and leaves the second as a genuine 'uncovered'. Without the row numbers
-- a cross join would emit a move for every combination.
--
-- ── NOT CHANGED ─────────────────────────────────────────────────────────────
--
-- Approval stays manual; nothing auto-applies. resolve_schedule_proposal() was
-- read and already does the right thing on apply — UPDATE scheduled_date and
-- moved_from_date on the same row, never delete-and-reinsert, and it refuses to
-- move a logged session or into an occupied date. It needed no change.
--
-- The 'orphaned' value stays in the reason CHECK constraint: 361 historical rows
-- use it and rewriting history to make a constraint tidier is not a fix.
--
-- Reversible: previous definition verbatim in
-- public.bak_detect_schedule_changes_20260816.

create or replace function public.detect_schedule_changes()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  update schedule_change_proposals
  set status = 'superseded', resolved_at = now()
  where status = 'pending' and created_at < now() - interval '20 hours';

  -- ── Who is in scope at all ────────────────────────────────────────────────
  -- At least one future appointment, ANY status. A client with none is not
  -- telling us anything about their calendar, so we say nothing about theirs.
  drop table if exists _scd_eligible;
  create temporary table _scd_eligible on commit drop as
  select distinct a.client_id
  from appointments a
  where (a.scheduled_at at time zone 'America/Chicago')::date >= v_today_ct;

  -- ── Orphan candidates: COMPUTED, never persisted on their own ────────────
  drop table if exists _scd_orphan;
  create temporary table _scd_orphan on commit drop as
  select sw.client_id,
         sw.id            as sw_id,
         sw.day_id,
         sw.scheduled_date as from_date,
         c.name           as client_name,
         d.label          as day_label
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  join _scd_eligible e on e.client_id = sw.client_id
  left join days d on d.id = sw.day_id
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from appointments a
                    where a.client_id = sw.client_id and a.status = 'scheduled'
                      and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date);

  -- ── Uncovered candidates ──────────────────────────────────────────────────
  drop table if exists _scd_uncovered;
  create temporary table _scd_uncovered on commit drop as
  select a.client_id,
         a.id as appt_id,
         a.gcal_recurring_id,
         (a.scheduled_at at time zone 'America/Chicago')::date as to_date,
         c.name as client_name,
         to_char(a.scheduled_at at time zone 'America/Chicago','HH24:MI') as at_time
  from appointments a
  join clients c on c.id = a.client_id
  join _scd_eligible e on e.client_id = a.client_id
  where a.status = 'scheduled' and c.archived_at is null
    and (a.scheduled_at at time zone 'America/Chicago')::date between v_today_ct and v_today_ct + 28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id = a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date);

  -- ── Pair them 1:1 inside the same ISO week ────────────────────────────────
  drop table if exists _scd_pair;
  create temporary table _scd_pair on commit drop as
  with o as (
    select *, row_number() over (partition by client_id, date_trunc('week', from_date)
                                 order by from_date) as rn
    from _scd_orphan
  ), u as (
    select *, row_number() over (partition by client_id, date_trunc('week', to_date)
                                 order by to_date) as rn
    from _scd_uncovered
  )
  select o.client_id, o.sw_id, o.day_id, o.from_date, o.client_name, o.day_label,
         u.appt_id, u.to_date, u.at_time
  from o
  join u on u.client_id = o.client_id
        and date_trunc('week', u.to_date) = date_trunc('week', o.from_date)
        and u.rn = o.rn;

  -- MOVED: one proposal for one rescheduled session.
  insert into schedule_change_proposals
    (client_id, scheduled_workout_id, day_id, appointment_id, from_date, to_date, reason, confidence, detail)
  select p.client_id, p.sw_id, p.day_id, p.appt_id, p.from_date, p.to_date, 'moved', 'one_off',
         jsonb_build_object('client', p.client_name, 'day', p.day_label,
                            'moved_to', p.to_date, 'time', p.at_time)
  from _scd_pair p
  on conflict do nothing;

  -- UNCOVERED: only the appointments no pairing absorbed.
  insert into schedule_change_proposals
    (client_id, appointment_id, gcal_recurring_id, to_date, reason, confidence, detail)
  select u.client_id, u.appt_id, u.gcal_recurring_id, u.to_date, 'uncovered',
         case when u.gcal_recurring_id is null then 'one_off' else 'pattern' end,
         jsonb_build_object('client', u.client_name, 'time', u.at_time)
  from _scd_uncovered u
  where not exists (select 1 from _scd_pair p where p.appt_id = u.appt_id)
  on conflict do nothing;

  -- CANCELLED: appointment cancelled in Google, workout still on that date.
  insert into schedule_change_proposals
    (client_id, scheduled_workout_id, appointment_id, from_date, reason, confidence, detail)
  select sw.client_id, sw.id, a.id, sw.scheduled_date, 'cancelled', 'one_off',
         jsonb_build_object('client', c.name, 'note', 'appointment cancelled in Google - leave the date empty')
  from scheduled_workouts sw
  join clients c on c.id = sw.client_id
  join _scd_eligible e on e.client_id = sw.client_id
  join appointments a on a.client_id = sw.client_id
    and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date
    and a.status like 'cancelled%'
  where sw.deleted_at is null and sw.supervised and c.archived_at is null
    and sw.scheduled_date >= v_today_ct
  on conflict do nothing;

  -- RETIRED: a recurring series with zero future occurrences.
  insert into schedule_change_proposals (client_id, gcal_recurring_id, reason, confidence, detail)
  select p.client_id, p.series, 'retired', 'pattern',
         jsonb_build_object('client', p.client_name,
                            'was', to_char(date '2026-08-02' + p.pattern_dow,'Dy') || ' ' || p.pattern_time)
  from v_client_calendar_pattern p
  join _scd_eligible e on e.client_id = p.client_id
  where p.is_retired
  on conflict do nothing;

  select count(*) into n from schedule_change_proposals where status = 'pending';
  return n;
end $function$;

-- Retiring the false positives already sitting in the queue used to live here,
-- as a trailing statement. It never ran: the statement after a dollar-quoted
-- function body was dropped, the function was replaced, and the 10 pending
-- 'orphaned' rows were still there afterwards — caught by querying rather than
-- by trusting the success response.
--
-- It is now its own migration: 20260816_supersede_false_positive_proposals.sql.
-- Nothing else follows the function body in this file, deliberately.
