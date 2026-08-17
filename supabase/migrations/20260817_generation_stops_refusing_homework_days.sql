-- The third and last copy of the unfiltered "is this date occupied?" test.
--
-- Dustin, 17 Aug, asked what generation should do about a day that already
-- holds a client's homework:
--
--   "it should never refuse if me or my client does it. it goes wherever we put
--    it. the app should only auto generate or move assigned workouts to days
--    they are on the schedule so it's right in the app but if we override it
--    leave it alone"
--
-- Two rules in one sentence, and this function honoured neither.
--
-- ── RULE 1: homework is not an occupied day ────────────────────────────────
--
-- `date_already_covered` asked whether ANY live row sat on the date:
--
--   exists (select 1 from scheduled_workouts sw
--           where sw.client_id = cd.client_id
--             and sw.scheduled_date = cd.sched_date
--             and sw.deleted_at is null)
--
-- No `supervised` filter, so the work a client does on their own — mobility,
-- a walk, a bodyweight session — read as "this day is taken" and suppressed the
-- supervised session that belonged there. That is the same fault already fixed
-- in resolve_schedule_proposal() (16 Aug, moves could never apply) and in
-- sync_supervised_workouts_to_appointments() (16 Aug, 413 of 562 occupied dates
-- held no supervised session at all). Supervised and unsupervised sessions
-- coexisting on one date is the normal shape of a training week, not a clash.
--
-- MEASURED over the next 5 weeks, 17 Aug. Seven pattern-days were refused for
-- no reason, and every one is a real session:
--
--   SUPERVISED, blocked only by that client's own homework
--     Sharon Rambo  Sat 22 Aug  Ankle & Posterior Chain — P1 — Day 2
--     Greg Lennon   Mon  7 Sep  Neurological Rehab — New Day A
--     Greg Lennon   Mon 14 Sep  Neurological Rehab — New Day A
--     Greg Lennon   Mon 21 Sep  Neurological Rehab — New Day A
--
--   HOMEWORK, blocked only by that client's supervised session
--     Greg Lennon   Sat  5 Sep  Daily Reset Walk
--     Greg Lennon   Sat 12 Sep  Daily Reset Walk
--     Greg Lennon   Sat 19 Sep  Daily Reset Walk
--
-- (The handoff written this morning counted three supervised. The fourth is
-- Greg on 21 Sep, which entered the rolling five-week window overnight. The
-- window moved; the finding did not change.)
--
-- The replacement asks whether the SLOT is covered — a session of the same kind
-- already on that date, or that exact session already there. Two supervised
-- sessions in one day is still a genuine collision and is still refused; so is
-- putting the same day_id on twice.
--
-- ── RULE 2: "if we override it leave it alone" ─────────────────────────────
--
-- Rule 1 opens a hole that the old over-broad guard was accidentally covering.
-- Once homework stops counting as occupancy, a pattern-day whose session a
-- HUMAN has already moved off it looks empty — and generation would helpfully
-- put it straight back.
--
-- That is not hypothetical. Sara Prince's Ankle Mobility (Dorsiflexion Focus)
-- is patterned for Wed 19 Aug; she pulled it forward and completed it today,
-- 17 Aug, leaving moved_from_date = 2026-08-19 and moved_by = null (null means
-- a human, per 16 Aug). Without this guard the 19th reads as free and she is
-- handed back the session she has already done — Sara's own 11 Aug complaint,
-- "the app added additional sessions instead of giving me credit", running in
-- reverse.
--
-- So: a pattern-day a session has been moved away from is left alone. New
-- action `skipped_moved_away` rather than reusing `skipped_existing`, because
-- "someone moved this" and "something is already here" are different facts and
-- the log is the only place either one is visible afterwards.
--
-- Generation still only ever INSERTS. It does not update or move an existing
-- row, so nothing hand-placed is rewritten by this function under any branch.
--
-- Not on cron. Dustin runs it by hand.
--
-- Rollback: select def from public.bak_generate_scheduled_workouts_20260817
-- and execute it.

create table if not exists public.bak_generate_scheduled_workouts_20260817 as
select pg_get_functiondef(p.oid) as def, now() as taken_at
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'generate_scheduled_workouts' and n.nspname = 'public';

-- The log's CHECK would reject the new action outright, and this function is
-- the only writer. Widened before the function body, never after it: a statement
-- placed after a dollar-quoted body in one migration is silently dropped (16 Aug).
alter table public.schedule_generation_log
  drop constraint if exists schedule_generation_log_action_check;
alter table public.schedule_generation_log
  add constraint schedule_generation_log_action_check
  check (action = any (array['inserted'::text, 'skipped_existing'::text,
                             'skipped_no_assignment'::text, 'skipped_moved_away'::text]));

create or replace function public.generate_scheduled_workouts(p_weeks integer DEFAULT 5, p_dry_run boolean DEFAULT true, p_client uuid DEFAULT NULL::uuid)
 RETURNS TABLE(batch_id uuid, client_name text, scheduled_date date, weekday smallint, day_label text, supervised boolean, action text, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_batch uuid := gen_random_uuid();
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_start date;
  v_end   date;
begin
  if p_weeks < 1 or p_weeks > 6 then
    raise exception 'p_weeks must be 1..6 (short horizon is deliberate: template edits do not propagate to materialised rows)';
  end if;

  v_start := v_today + 1;                 -- never touch today
  v_end   := v_today + (p_weeks * 7);

  return query
  with dates as (
    select generate_series(v_start, v_end, interval '1 day')::date as d
  ),
  candidates as (
    select ctp.id as pattern_id,
           ctp.client_id,
           c.name as c_name,
           dt.d as sched_date,
           ctp.weekday as wd,
           ctp.day_id,
           ctp.supervised as is_sup,
           ctp.position as pos,
           dy.label as d_label
    from client_training_patterns ctp
    join clients c on c.id = ctp.client_id
    join dates dt on extract(dow from dt.d)::smallint = ctp.weekday
    left join days dy on dy.id = ctp.day_id
    where ctp.is_active
      and c.archived_at is null
      and ctp.effective_from <= dt.d
      and (ctp.effective_to is null or ctp.effective_to >= dt.d)
      and (p_client is null or ctp.client_id = p_client)
  ),
  resolved as (
    select cd.*,
           pa.id as assignment_id,
           -- Is the SLOT covered, not merely the date. A supervised session is
           -- blocked by another supervised session; homework by other homework;
           -- and either by that exact session already being there. A client's
           -- own work never suppresses the session they are booked in for.
           exists (
             select 1 from scheduled_workouts sw
             where sw.client_id = cd.client_id
               and sw.scheduled_date = cd.sched_date
               and sw.deleted_at is null
               and (sw.supervised = cd.is_sup or sw.day_id = cd.day_id)
           ) as slot_already_covered,
           -- "if we override it leave it alone" — this session has been moved
           -- off this date, so do not put it back. Any mover counts: a human's
           -- move must stand, and re-creating one the app moved is a duplicate.
           exists (
             select 1 from scheduled_workouts sw
             where sw.client_id = cd.client_id
               and sw.day_id = cd.day_id
               and sw.moved_from_date = cd.sched_date
               and sw.deleted_at is null
           ) as moved_off_this_date
    from candidates cd
    left join lateral (
      select pa.id from program_assignments pa
      where pa.client_id = cd.client_id and pa.active
      order by pa.assigned_at desc limit 1
    ) pa on true
  ),
  decided as (
    select r.*,
           case
             when r.slot_already_covered      then 'skipped_existing'
             when r.moved_off_this_date       then 'skipped_moved_away'
             when r.assignment_id is null     then 'skipped_no_assignment'
             else 'inserted'
           end as act,
           case
             when r.slot_already_covered  then 'this slot is already filled on this date - hand-placed work wins'
             when r.moved_off_this_date   then 'this session was moved off this date - the move stands'
             when r.assignment_id is null then 'client has no active program_assignment'
             else null
           end as det
    from resolved r
  ),
  ins as (
    insert into scheduled_workouts
      (client_id, assignment_id, day_id, scheduled_date, position, status, source, supervised)
    select d.client_id, d.assignment_id, d.day_id, d.sched_date, d.pos, 'scheduled', 'claude', d.is_sup
    from decided d
    where d.act = 'inserted' and not p_dry_run
    returning id
  ),
  logged as (
    insert into schedule_generation_log
      (generated_batch_id, client_id, pattern_id, scheduled_date, day_id, action, detail)
    select v_batch, d.client_id, d.pattern_id, d.sched_date, d.day_id, d.act, d.det
    from decided d
    where not p_dry_run
    returning id
  )
  select v_batch, d.c_name, d.sched_date, d.wd, d.d_label, d.is_sup, d.act, d.det
  from decided d
  where (select count(*) from ins) >= 0
    and (select count(*) from logged) >= 0
  order by d.c_name, d.sched_date, d.pos;
end;
$function$
