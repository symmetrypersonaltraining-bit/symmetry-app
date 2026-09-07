-- A COMPLETED SESSION HAS TO BE OBSERVABLE
--
-- Dustin, 7 Sep, home showing both of today's sessions on Start and the week at
-- 0% adherence: "I logged my workout earlier... I just relogged n completed it
-- and still won't save."
--
-- It had saved: workout_logs completed at 2:04pm Central with 31 set logs, and
-- today's scheduled_workouts row marked completed and linked to that log. He was
-- looking at a render made before he finished. The screen-side fix is
-- RefreshOnReturn; these are the two things found underneath it, both of which
-- made the problem harder to see than it needed to be.

begin;

-- 1. updated_at WAS DEAD.
--
-- The row that completed today still read 2026-08-12 on updated_at, identical to
-- created_at, because nothing maintained the column. "When did this row become
-- complete" is the first question you ask when a screen and the data disagree,
-- and it could not be answered at all.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists scheduled_workouts_touch_updated_at on public.scheduled_workouts;
create trigger scheduled_workouts_touch_updated_at
  before update on public.scheduled_workouts
  for each row execute function public.touch_updated_at();

-- 2. REALTIME COULD NOT CARRY THE CHANGE.
--
-- RealtimeScheduleSync subscribes to this table and refreshes the route when a
-- row changes - it is the thing meant to turn Start into Done the moment a
-- session is credited. postgres_changes on a table with RLS enabled needs
-- REPLICA IDENTITY FULL; without it old_record cannot be sent. The component is
-- written to no-op silently when realtime hands it nothing, so this failed
-- quietly and looked like nothing at all.
--
-- The cost is a fuller WAL record per update on a table that takes a few hundred
-- writes a day.
alter table public.scheduled_workouts replica identity full;

commit;
