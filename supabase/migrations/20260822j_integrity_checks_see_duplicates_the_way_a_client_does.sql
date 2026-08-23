-- run_integrity_checks already has a `duplicate_scheduled_workout` check. It
-- groups by day_id, and that is exactly why it sat green while Celeste Lennon
-- had TWELVE doubled walks on her calendar between 4 Sep and 11 Oct.
--
-- pa_enforce_program_isolation deep-copies a programme when it is assigned to a
-- second client. The copy has its own days, with their own ids and the SAME
-- labels. So two rows that read "Daily Reset Walk · Daily Reset Walk" on one
-- day are two different day_ids, and a check keyed on day_id cannot see them.
-- The client sees the label. So does the check now.
--
-- Second check: the state that produced it. Celeste held two ACTIVE assignments
-- to two copies of "8-Week Hip & Glute Block", so anything generating forward
-- work generated it twice. There is no forked_from_id on programs to tell the
-- two copies apart, which is why this is a warn to look at rather than a
-- constraint to enforce.
--
-- A separate function rather than an edit, deliberately: run_integrity_checks
-- is 5,368 characters of working SQL and retyping it to append two blocks is
-- how every check in it ends up silently broken. Cron job 17 calls both:
--   select cron.alter_job(17, command =>
--     'select public.run_integrity_checks(); select public.run_scheduling_integrity_checks();');

create or replace function public.run_scheduling_integrity_checks()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer := 0;
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  insert into integrity_checks (check_name, severity, count, detail)

  -- What the client actually sees: the same workout NAME twice in one day.
  select 'duplicate_scheduled_workout_by_label', 'warn', count(*),
         jsonb_agg(jsonb_build_object('client', t.name, 'date', t.scheduled_date, 'label', t.label))
  from (
    select c.name, sw.scheduled_date, d.label
    from scheduled_workouts sw
    join clients c on c.id = sw.client_id
    join days d on d.id = sw.day_id
    where sw.deleted_at is null
      and sw.scheduled_date >= v_today_ct
      and c.archived_at is null
    group by c.name, sw.scheduled_date, d.label
    having count(*) > 1
  ) t

  union all

  -- Two live assignments to two copies of one programme. Everything that
  -- generates forward work then generates it twice.
  select 'two_active_assignments_to_one_programme', 'warn', count(*),
         jsonb_agg(jsonb_build_object('client', t.name, 'programme', t.program_name, 'assignments', t.n))
  from (
    select c.name, p.name as program_name, count(*) as n
    from program_assignments pa
    join programs p on p.id = pa.program_id
    join clients c on c.id = pa.client_id
    where pa.active and c.archived_at is null
    group by c.name, p.name
    having count(*) > 1
  ) t;

  get diagnostics n = row_count;
  return n;
end;
$$;
