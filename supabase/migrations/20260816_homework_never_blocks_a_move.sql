-- Unsupervised work never blocks a workout from following its appointment.
--
-- ── DUSTIN, 16 AUG ─────────────────────────────────────────────────────────
--
--   "unsupervised workouts should not block a move. I have that set to move
--    workouts as I make schedule changes so that when I pull up the app that
--    day the right workout is there. nothing should block that system, fix it."
--
-- ── WHAT WAS BLOCKING IT ───────────────────────────────────────────────────
--
-- The "do not stack onto an occupied day" guard asked whether ANY live row sat
-- on the target date:
--
--   and not exists (
--     select 1 from scheduled_workouts x
--      where x.client_id = sw.client_id
--        and x.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date
--        and x.deleted_at is null
--   )
--
-- No `supervised` filter. Unsupervised sessions — the work a client does on
-- their own — sit on most dates in most programmes: Sariah Duncan has one on
-- nearly every day of the month. So "is the target date free?" answered NO
-- almost always, and a guard meant to stop two supervised sessions colliding
-- silently blocked the whole mechanism instead.
--
-- This is the third place tonight with the identical bug. The other two:
-- resolve_schedule_proposal() (fixed in 20260816_resolve_moves_the_one_session)
-- where all six pending move proposals were guaranteed no-ops, and
-- generate_scheduled_workouts(), which is left alone here because generating is
-- not moving — it is raised separately.
--
-- ── THE SCHEMA ALREADY SAID SO ─────────────────────────────────────────────
--
-- uq_scheduled_workout_one_per_day is UNIQUE (client_id, day_id,
-- scheduled_date) WHERE deleted_at IS NULL — keyed on day_id, not just the
-- date. Several rows per date are legal by design, which is exactly what a
-- supervised session plus that day's homework is. Every unfiltered "is this
-- date occupied?" check contradicts the constraint the table actually carries.
--
-- ── WHAT STILL BLOCKS A MOVE, DELIBERATELY ─────────────────────────────────
--
-- Only another SUPERVISED session on the target date. Two supervised sessions
-- on one day is a real collision and stays refused; that is the case the guard
-- was written for. Everything else is untouched:
--
--   1. supervised sessions only               (sw.supervised)
--   2. never a logged session                 (sw.workout_log_id is null)
--   3. future only, both sides                (>= tomorrow)
--   4. never override a manual move           (sw.moved_from_date is null)
--   5. the appointment is live                (a.status = 'scheduled')
--   6. only a workout already linked to that appointment (sw.appointment_id)
--
-- Rule 4 is worth a note: on 16 Aug three app paths that move a workout were
-- taught to set moved_from_date (a97d379). That arms rule 4 on moves made from
-- the schedule board, which it was not armed on before — so a session dragged
-- on the board will now be left alone by this job rather than pulled back onto
-- its appointment date. That is a change in which source wins, it is Dustin's
-- call rather than a bug, and it is being put to him separately. Nothing here
-- pre-empts that decision.
--
-- ── MEASURED ───────────────────────────────────────────────────────────────
--
-- Zero candidates at the time of writing, so this changes nothing today; it
-- stops the mechanism failing the next time an appointment moves onto a day
-- that already holds homework, which is most days for most clients.
--
-- Reversible: previous definition verbatim in
-- public.bak_sync_supervised_workouts_20260816.

create or replace function public.sync_supervised_workouts_to_appointments(p_dry_run boolean default false)
 returns table(client text, workout_id uuid, from_date date, to_date date, day_label text, outcome text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_tomorrow date := (now() at time zone 'America/Chicago')::date + 1;
begin
  return query
  with candidate as (
    select sw.id as sw_id,
           sw.client_id,
           c.name as c_name,
           sw.scheduled_date as old_date,
           (a.scheduled_at at time zone 'America/Chicago')::date as new_date,
           d.label as d_label
    from scheduled_workouts sw
    join appointments a on a.id = sw.appointment_id
    join clients c      on c.id = sw.client_id
    left join days d    on d.id = sw.day_id
    where sw.deleted_at is null
      and sw.supervised                                   -- 1. supervised only
      and sw.workout_log_id is null                       -- 2. never a logged session
      and sw.status = 'scheduled'
      and sw.moved_from_date is null                      -- 4. never override a manual move
      and a.status = 'scheduled'                          -- the appointment is live
      and c.archived_at is null
      and sw.scheduled_date >= v_tomorrow                 -- 3. future only, both sides
      and (a.scheduled_at at time zone 'America/Chicago')::date >= v_tomorrow
      and (a.scheduled_at at time zone 'America/Chicago')::date <> sw.scheduled_date
      -- 5. do not stack onto a day that already holds a SUPERVISED session.
      --    Homework is not a collision - it is what most days look like, and
      --    counting it here stopped the whole mechanism working.
      and not exists (
        select 1 from scheduled_workouts x
         where x.client_id = sw.client_id
           and x.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date
           and x.deleted_at is null
           and x.supervised
           and x.id <> sw.id
      )
  ),
  moved as (
    update scheduled_workouts sw
       set scheduled_date  = cd.new_date,
           moved_from_date = cd.old_date,
           updated_at      = now()
      from candidate cd
     where sw.id = cd.sw_id
       and not p_dry_run
    returning sw.id
  )
  select cd.c_name, cd.sw_id, cd.old_date, cd.new_date, cd.d_label,
         case when p_dry_run then 'would_move' else 'moved' end
  from candidate cd
  where (select count(*) from moved) >= 0
  order by cd.c_name, cd.old_date;
end;
$function$;
