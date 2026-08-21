-- Three checks were permanently red, and a permanently red check is a check
-- nobody reads. Nothing in the app surfaced this table at all, so the only cost
-- of a false critical was that it buried a true one — which is what happened.
--
-- 1. anon_writable_policies. THE FALSE ONE.
--    `where 'anon'=any(roles) and qual='true'` — but `qual` is the USING
--    expression, which a SELECT policy has too. So food_catalog_read, a
--    read-only `FOR SELECT USING (true)`, was reported as an anon WRITE for
--    weeks. The one check in this table that would ever mean "somebody can
--    change data they do not own" was firing on a public food catalogue being
--    publicly readable. It now tests the COMMAND, which is the thing that
--    decides whether a policy can write. Reports 0.
--
-- 2. scheduled_day_outside_assigned_program. 1,072 rows and no date filter, so
--    every workout back to July 2024 was compared against the client's
--    CURRENTLY active assignment — finishing a programme turned that client's
--    whole history critical. 772 of the 1,072 were in the past. Scoped to today
--    onward and to clients who are still here: 300, across four named people.
--    It now collects those names, because "1,072" is not something anyone can
--    act on.
--
-- 3. supervised_workout_no_appointment. Critical, 371, and no longer the
--    problem it describes: the mover was changed on 21 Aug to pair a workout to
--    an appointment by client and week rather than needing the stored link, so
--    a missing link stops nothing working. Online-only clients are excluded
--    outright — eleven clients whose workouts must never follow the calendar
--    would otherwise sit in here permanently, by design. Warn, 250.
--
-- appointment_no_supervised_workout gains the same online_only exclusion, for
-- the same reason. 14 -> 1.
--
create or replace function public.run_integrity_checks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  insert into integrity_checks (check_name, severity, count, detail)

  select 'personal_program_without_assignment','critical',count(*),
         jsonb_agg(jsonb_build_object('client',c.name))
  from programs p join clients c on c.id=p.personal_for_client_id
  where p.personal_for_client_id is not null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=p.personal_for_client_id and pa.program_id=p.id and pa.active)

  union all
  -- Today onward only. History drifting out of the active assignment is what
  -- finishing a programme LOOKS like, not a fault.
  select 'scheduled_day_outside_assigned_program','critical',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from scheduled_workouts sw
  join days d on d.id=sw.day_id
  join phases ph on ph.id=d.phase_id
  join clients c on c.id=sw.client_id
  where sw.deleted_at is null
    and sw.scheduled_date >= v_today_ct
    and c.archived_at is null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=sw.client_id and pa.program_id=ph.program_id and pa.active)

  union all
  select 'scheduled_workout_null_assignment_id','warn',count(*),null
  from scheduled_workouts where deleted_at is null and assignment_id is null

  union all
  select 'days_null_client_owner_under_personal_program','warn',count(*),null
  from days d join phases ph on ph.id=d.phase_id join programs p on p.id=ph.program_id
  where p.personal_for_client_id is not null and d.client_owner_id is null

  union all
  -- Warn, not critical, and never for an online-only client.
  select 'supervised_workout_no_appointment','warn',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from scheduled_workouts sw join clients c on c.id=sw.client_id
  where sw.deleted_at is null and sw.supervised and sw.appointment_id is null
    and sw.scheduled_date >= v_today_ct and c.archived_at is null
    and not c.online_only

  union all
  select 'appointment_no_supervised_workout','warn',count(*),
         jsonb_agg(distinct jsonb_build_object('client',c.name))
  from appointments a join clients c on c.id=a.client_id
  where a.status='scheduled' and c.archived_at is null
    and not c.online_only
    and (a.scheduled_at at time zone 'America/Chicago')::date between v_today_ct and v_today_ct+28
    and not exists (select 1 from scheduled_workouts sw
                    where sw.client_id=a.client_id and sw.deleted_at is null and sw.supervised
                      and sw.scheduled_date=(a.scheduled_at at time zone 'America/Chicago')::date)

  union all
  select 'gcal_sync_stale_over_60min','critical',
         case when max(updated_at) < now() - interval '60 minutes' then 1 else 0 end,
         jsonb_build_object('last_sync',max(updated_at))
  from appointments

  union all
  select 'client_coverage_under_14_days','warn',count(*),
         jsonb_agg(jsonb_build_object('client',c.name,'through',x.mx))
  from (select client_id, max(scheduled_date) mx from scheduled_workouts
        where deleted_at is null group by 1) x
  join clients c on c.id=x.client_id
  where c.archived_at is null and x.mx < v_today_ct + 14

  union all
  select 'client_weight_drift_from_metrics','warn',count(*),
         jsonb_agg(jsonb_build_object('client',t.name,'clients_tbl',t.cw,'metrics',t.mw))
  from (select c.name, c.current_weight cw, m.weight mw from clients c
        join lateral (select weight from metrics where client_id=c.id and weight is not null
                      order by metric_date desc limit 1) m on true
        where c.current_weight is not null and abs(c.current_weight-m.weight) >= 1) t

  union all
  select 'macro_targets_without_meal_plan','warn',count(*),null
  from clients c where exists (select 1 from macro_targets mt where mt.client_id=c.id)
    and not exists (select 1 from meal_plans mp where mp.client_id=c.id)

  union all
  select 'placeholder_macro_targets','info',count(*),null
  from macro_targets where calories=1800 and protein=150 and carbs=165 and fats=60

  union all
  select 'duplicate_scheduled_workout','warn',count(*),null
  from (select client_id,scheduled_date,day_id from scheduled_workouts
        where deleted_at is null group by 1,2,3 having count(*)>1) t

  union all
  select 'prescribed_exercise_position_gaps','info',count(*),null
  from (select section_id from prescribed_exercises group by section_id
        having max(position)<>count(*) or min(position)<>1) t

  union all
  -- The COMMAND is what decides whether a policy can write. 'r' is SELECT.
  -- Testing qual='true' instead flagged every public read policy in the schema
  -- as an anon write, which is how the one check that would ever catch a real
  -- hole came to be permanently, meaninglessly red.
  select 'anon_writable_policies','critical',count(*),
         jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'cmd',cmd))
  from pg_policies
  where schemaname='public' and 'anon'=any(roles)
    and cmd in ('INSERT','UPDATE','DELETE','ALL');

  get diagnostics n = row_count;
  return n;
end $function$;
