-- The calendar sync can move the same session more than once.
--
-- ── THE SELF-BLOCK ─────────────────────────────────────────────────────────
--
-- sync_supervised_workouts_to_appointments() skips any row that has been moved:
--
--   and sw.moved_from_date is null      -- 4. never override a manual move
--
-- and its own UPDATE sets that column:
--
--   set scheduled_date = cd.new_date, moved_from_date = cd.old_date
--
-- So the job could move each session exactly ONCE, ever. The first time an
-- appointment moved, the workout followed; every time after that it was skipped
-- by a rule aimed at manual moves, because the job could not tell its own work
-- from a person's. A client who reschedules twice — which is most of them —
-- silently stopped being followed after the first change.
--
-- Dustin, 16 Aug: "nothing should block that system." This was the last thing
-- blocking it, and it was the system blocking itself.
--
-- ── WHY NOT JUST DROP RULE 4 ───────────────────────────────────────────────
--
-- Because Dustin was asked directly which should win when he drags a session on
-- the schedule board and the appointment later moves, and he chose: HIS DRAG
-- STICKS. Rule 4 is what implements that. It cannot be removed; it has to learn
-- the difference between a move a person made and a move this job made.
--
-- ── HOW, WITHOUT TOUCHING A SINGLE APP PATH ────────────────────────────────
--
-- A new nullable column, scheduled_workouts.moved_by, and the job stamps
-- 'calendar_sync' on its own moves. Rule 4 becomes:
--
--   and (sw.moved_from_date is null or sw.moved_by = 'calendar_sync')
--
--   never moved                → eligible, exactly as before
--   moved by this job          → eligible again, which is the fix
--   moved by anything else     → skipped, so Dustin's drag sticks
--
-- NULL means human. That default is deliberate and it is why no app code
-- changes here: the seven paths in the app that move a workout all leave
-- moved_by null, so every one of them is treated as a person and left alone. A
-- path that forgot to set a marker would otherwise have had its move quietly
-- undone by the next cron tick — the failure mode is silent, so the default has
-- to be the safe one rather than the tidy one.
--
-- The 31 rows already carrying a moved_from_date keep moved_by null and are
-- therefore treated as manual. None of them is appointment-linked, so none was
-- ever a candidate; no backfill is needed and none is guessed at.
--
-- ── MEASURED ───────────────────────────────────────────────────────────────
--
--   31 rows have ever been moved
--    0 of those are linked to an appointment
--    0 are currently frozen by this
--
-- Latent, not active — the job has not successfully moved anything yet, because
-- until today's earlier fix the occupancy guard refused 73% of the calendar.
-- That fix is exactly what makes this one matter: the moment the job starts
-- working, every session it moves would have frozen against all future calendar
-- changes.
--
-- Reversible: previous definition verbatim in
-- public.bak_sync_supervised_workouts_20260816. The column is additive and
-- nullable; dropping it restores the previous behaviour on its own.

alter table public.scheduled_workouts
  add column if not exists moved_by text;

comment on column public.scheduled_workouts.moved_by is
  'Who last moved this row. NULL means a human (or unknown), which is the safe default: the calendar sync leaves those alone. Only ''calendar_sync'' marks a move the nightly job made itself, which is what lets it move the same session again when the appointment changes a second time.';

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
      -- 4. never override a move a PERSON made. NULL moved_by means human, so
      --    every app path is left alone without having to mark itself. Only
      --    this job's own moves are eligible to move again.
      and (sw.moved_from_date is null or sw.moved_by = 'calendar_sync')
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
           moved_by        = 'calendar_sync',
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
