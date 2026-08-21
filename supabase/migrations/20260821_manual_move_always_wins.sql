-- A workout a human moved stays where the human put it.
--
-- Dustin, 21 Aug: "make sure if anyone moves a workout manually it stays
-- regardless of gcal sessions."
--
-- The mover already claimed to honour this:
--   (sw.moved_from_date is null or sw.moved_by = 'calendar_sync')
-- and it worked only by accident. All seven manual-move paths in the app set
-- moved_from_date and NONE of them sets moved_by, so the guard evaluated to
-- NULL and the row fell out of the WHERE. Correct by luck.
--
-- Where the luck ran out: once calendar_sync moved a row it stamped
-- moved_by = 'calendar_sync'. A human moving that row afterwards set only
-- moved_from_date, leaving moved_by = 'calendar_sync' behind — so the guard
-- PASSED and the next sync dragged the workout back off the day the trainer
-- chose. The paths most likely to hit this are exactly the ones that matter:
-- a session the calendar had already moved once.
--
-- Fixed in the database rather than in seven call sites, so a path added next
-- month is covered without anybody remembering the rule. The sync identifies
-- itself with a transaction-local setting; everything else is, by definition,
-- a person — the board, the calendar, the logger, the AI acting on an
-- instruction. All of them count as manual here: the point is not who typed it,
-- it is that the calendar did not decide it.

create or replace function public.stamp_workout_mover()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_date is distinct from old.scheduled_date then
    if coalesce(current_setting('symmetry.mover', true), '') = 'calendar_sync' then
      new.moved_by := 'calendar_sync';
    else
      new.moved_by := 'manual';
      -- Belt for a path that forgets: with no from-date the guard reads
      -- "never moved" and the sync is free to take the row.
      if new.moved_from_date is null then
        new.moved_from_date := old.scheduled_date;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_workout_mover on public.scheduled_workouts;
create trigger trg_stamp_workout_mover
  before update on public.scheduled_workouts
  for each row
  execute function public.stamp_workout_mover();

comment on function public.stamp_workout_mover() is
  'Records WHO moved a scheduled workout. calendar_sync only when the sync sets symmetry.mover; everything else is manual, and manual is never overridden by the sync.';

-- Existing rows carrying a from-date with no mover are historical human moves.
-- Say so explicitly instead of leaving the guard resting on NULL. (66 rows.)
update public.scheduled_workouts
   set moved_by = 'manual'
 where moved_by is null and moved_from_date is not null;

-- The sync must say it is the sync, or the trigger marks its own work 'manual'
-- and it can never move that row again. set_config(..., true) is
-- transaction-local, so nothing else can inherit the claim.
--
-- Only the first line of the body changes; the query is unchanged from
-- 20260821 and is restated in full because CREATE OR REPLACE has no patch form.

CREATE OR REPLACE FUNCTION public.sync_supervised_workouts_to_appointments(p_dry_run boolean DEFAULT false)
 RETURNS TABLE(client text, workout_id uuid, from_date date, to_date date, day_label text, outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_tomorrow date := (now() at time zone 'America/Chicago')::date + 1;
begin
  perform set_config('symmetry.mover', 'calendar_sync', true);

  return query
  with linked as (
    select sw.id as sw_id, sw.client_id, c.name as c_name,
           sw.scheduled_date as old_date,
           (a.scheduled_at at time zone 'America/Chicago')::date as new_date,
           d.label as d_label, a.id as appt_id
    from scheduled_workouts sw
    join appointments a on a.id = sw.appointment_id
    join clients c      on c.id = sw.client_id
    left join days d    on d.id = sw.day_id
    where sw.deleted_at is null and sw.supervised and sw.workout_log_id is null
      and sw.status = 'scheduled'
      and (sw.moved_from_date is null or sw.moved_by = 'calendar_sync')
      and a.status = 'scheduled' and c.archived_at is null
      and not c.online_only
      and sw.scheduled_date >= v_tomorrow
      and (a.scheduled_at at time zone 'America/Chicago')::date >= v_tomorrow
      and (a.scheduled_at at time zone 'America/Chicago')::date <> sw.scheduled_date
      and not exists (
        select 1 from scheduled_workouts x
         where x.client_id = sw.client_id and x.deleted_at is null and x.supervised
           and x.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date
           and x.id <> sw.id)
  ),
  orphan as (
    select sw.id as sw_id, sw.client_id, c.name as c_name,
           sw.scheduled_date as old_date, d.label as d_label
    from scheduled_workouts sw
    join clients c   on c.id = sw.client_id
    left join days d on d.id = sw.day_id
    where sw.deleted_at is null and sw.supervised and sw.workout_log_id is null
      and sw.status = 'scheduled' and sw.appointment_id is null
      and (sw.moved_from_date is null or sw.moved_by = 'calendar_sync')
      and c.archived_at is null
      and not c.online_only
      and sw.scheduled_date >= v_tomorrow
      and not exists (
        select 1 from appointments a
         where a.client_id = sw.client_id and a.status = 'scheduled'
           and (a.scheduled_at at time zone 'America/Chicago')::date = sw.scheduled_date)
  ),
  uncovered as (
    select a.id as appt_id, a.client_id,
           (a.scheduled_at at time zone 'America/Chicago')::date as new_date
    from appointments a
    join clients c on c.id = a.client_id
    where a.status = 'scheduled' and c.archived_at is null
      and not c.online_only
      and (a.scheduled_at at time zone 'America/Chicago')::date >= v_tomorrow
      and not exists (
        select 1 from scheduled_workouts sw
         where sw.client_id = a.client_id and sw.deleted_at is null and sw.supervised
           and sw.scheduled_date = (a.scheduled_at at time zone 'America/Chicago')::date)
  ),
  paired as (
    select * from (
      select distinct on (sw_id) * from (
        select o.sw_id, o.client_id, o.c_name, o.old_date, u.new_date, o.d_label, u.appt_id,
               abs(u.new_date - o.old_date) as gap
        from orphan o
        join uncovered u
          on u.client_id = o.client_id
         and date_trunc('week', u.new_date) = date_trunc('week', o.old_date)
      ) c order by sw_id, gap, new_date, appt_id
    ) b order by appt_id, gap, old_date, sw_id
  ),
  candidate as (
    select sw_id, client_id, c_name, old_date, new_date, d_label, appt_id from linked
    union all
    select sw_id, client_id, c_name, old_date, new_date, d_label, appt_id from paired
  ),
  moved as (
    update scheduled_workouts sw
       set scheduled_date  = cd.new_date,
           moved_from_date = cd.old_date,
           moved_by        = 'calendar_sync',
           appointment_id  = coalesce(sw.appointment_id, cd.appt_id),
           updated_at      = now()
      from candidate cd
     where sw.id = cd.sw_id and not p_dry_run
    returning sw.id
  )
  select cd.c_name, cd.sw_id, cd.old_date, cd.new_date, cd.d_label,
         case when p_dry_run then 'would_move' else 'moved' end
  from candidate cd
  where (select count(*) from moved) >= 0
  order by cd.c_name, cd.old_date;
end;
$function$;
