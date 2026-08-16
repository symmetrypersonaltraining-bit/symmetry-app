-- One pending 'moved' proposal per session, and it pairs with the nearest date.
--
-- Follows 20260816_detector_absence_is_not_a_signal.sql. Two changes, both
-- inside the pairing block; everything else in the function is byte-identical.
--
-- ── 1. Two contradictory proposals for the same session ────────────────────
--
-- Found live. Sariah Duncan's supervised session on Wed 19 Aug had BOTH of
-- these sitting pending at the same time:
--
--   moved  2026-08-19 -> 2026-08-18   raised 15 Aug 23:30
--   moved  2026-08-19 -> 2026-08-20   raised 16 Aug 11:30
--
-- One session, two different answers, both awaiting approval. The open-proposal
-- unique index is (client_id, from_date, to_date, reason), so a different
-- to_date is a different row and nothing stopped it. She has three appointments
-- that week and two supervised sessions, so the pairing target legitimately
-- moved between runs — and each run left its answer behind.
--
-- The spec asks for ONE proposal per moved session. Now each run supersedes any
-- pending move for a session whose target it no longer agrees with, then
-- inserts today's. The queue reflects the calendar as it stands this morning
-- rather than accumulating every answer the detector has ever given.
--
-- Superseded, never deleted. And the older row is only touched when today's run
-- has a live opinion about that exact session; a pending move for a session
-- outside the 28-day window is left completely alone.
--
-- ── 2. Pair with the NEAREST date, not by row number ───────────────────────
--
-- The first version matched orphans to uncovered dates by `row_number()` inside
-- the week — first orphan to first uncovered, in date order. With one orphan on
-- Wednesday and uncovered appointments on Tuesday and Thursday, "first" is an
-- accident of sort order, not a judgement.
--
-- Now candidates are ranked by `abs(to_date - from_date)` and taken greedily:
-- `distinct on (sw_id)` gives each session its closest date, then
-- `distinct on (appt_id)` makes sure no two sessions claim the same
-- appointment. Still strictly 1:1 — an appointment can absorb at most one
-- session, a session can move to at most one date — and ties break on the
-- earlier date so the result is deterministic across runs.
--
-- Anything left unpaired stays 'uncovered', which is correct: with three
-- appointments and two sessions in a week, one appointment genuinely has no
-- session to fill it and Dustin should see that rather than have it hidden.
--
-- ── Unchanged ──────────────────────────────────────────────────────────────
--
-- Absence of an appointment still emits nothing. Clients with no future
-- appointments are still skipped entirely. 'uncovered', 'cancelled' and
-- 'retired' are untouched. Approval is still manual.
--
-- Reversible: the pre-16-Aug definition is in
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

  -- ── Pair them 1:1 inside the same ISO week, nearest date first ────────────
  drop table if exists _scd_pair;
  create temporary table _scd_pair on commit drop as
  with cand as (
    select o.client_id, o.sw_id, o.day_id, o.from_date, o.client_name, o.day_label,
           u.appt_id, u.to_date, u.at_time,
           abs(u.to_date - o.from_date) as gap
    from _scd_orphan o
    join _scd_uncovered u
      on u.client_id = o.client_id
     and date_trunc('week', u.to_date) = date_trunc('week', o.from_date)
  ), best_for_session as (
    -- each session takes its closest date; ties break earlier-date-first
    select distinct on (sw_id) * from cand order by sw_id, gap, to_date, appt_id
  )
  -- and no two sessions may claim the same appointment
  select distinct on (appt_id) * from best_for_session order by appt_id, gap, from_date, sw_id;

  -- A session whose pending move no longer matches today's answer: retire the
  -- stale one so exactly one pending move survives per session.
  update schedule_change_proposals p
     set status = 'superseded', resolved_at = now()
   from _scd_pair pr
   where p.status = 'pending'
     and p.reason = 'moved'
     and p.scheduled_workout_id = pr.sw_id
     and p.to_date is distinct from pr.to_date;

  -- MOVED: one proposal for one rescheduled session.
  insert into schedule_change_proposals
    (client_id, scheduled_workout_id, day_id, appointment_id, from_date, to_date, reason, confidence, detail)
  select p.client_id, p.sw_id, p.day_id, p.appt_id, p.from_date, p.to_date, 'moved', 'one_off',
         jsonb_build_object('client', p.client_name, 'day', p.day_label,
                            'moved_to', p.to_date, 'time', p.at_time)
  from _scd_pair p
  where not exists (select 1 from schedule_change_proposals x
                    where x.status = 'pending' and x.reason = 'moved'
                      and x.scheduled_workout_id = p.sw_id)
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
