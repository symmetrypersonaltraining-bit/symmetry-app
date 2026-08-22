-- WHY THE APP KEPT SAYING HE WAS ON A PROGRAMME HE HAD FINISHED.
--
-- Dustin, 22 Aug: "my corrective is over, bulk starts monday. figure out how
-- this keeps happening and get it fixed. thats been an ongoing issue for a long
-- time. im not really sure why we have 'programs' in the first place but get it
-- fixed so its all accurate."
--
-- It was never a data mess that kept recurring. It is one missing rule, and a
-- second rule nobody had reconciled it with.
--
-- ── RULE ONE THAT WAS MISSING ──────────────────────────────────────────────
-- The app holds the same fact in two unconnected places:
--
--   scheduled_workouts   what is actually on the calendar, day by day
--   program_assignments  which programme the client is "on", with .active
--
-- `scheduled_workouts.assignment_id` is nullable and nothing enforced it, so a
-- programme could be scheduled out for months with no assignment row existing
-- at all. Measured over all future work before this ran:
--
--   Dustin Gautreaux   Hypertrophy Bulk       128 sessions, no assignment row
--   Tyler Dorsett      Hypertrophy Bulk        88 sessions, no assignment row
--   Celeste Lennon     8-Week Hip & Glute      12 sessions, no assignment row
--   Madeleine Coker    Solo Training — 3-Day   78 sessions, assignment inactive
--
-- Everyone else was consistent, which is the tell: this is not drift that
-- accumulates everywhere, it is what happens on the one path where programming
-- is scheduled directly. The calendar was right the whole time — the app had no
-- way to know which programme it belonged to, so it fell back on whatever
-- assignment was still flagged active. For him that was "8-Week Split Block
-- (Jun 2026)" and "Personal Workouts", neither with a single future session.
--
-- ── RULE TWO IT HAD TO BE RECONCILED WITH ──────────────────────────────────
-- `pa_enforce_program_isolation` makes programmes single-client: assigning one
-- that already belongs to somebody else deep-copies phases, days, sections and
-- prescribed exercises, and repoints the assignment at the copy. That is
-- correct — it stops an edit to Tyler's bulk changing Dustin's.
--
-- It also means "create an assignment for this day's programme" can hand back
-- an assignment for a DIFFERENT programme. Dustin and Tyler were both scheduled
-- onto the same 21 Hypertrophy Bulk days; Dustin's assignment took the
-- programme, Tyler's forked it, and Tyler's 88 sessions still pointed at
-- Dustin's copy. So the stamping has to follow the fork, matching days by
-- LABEL — preserved verbatim by the copy, and unique within a programme, which
-- position is not, because positions restart per phase.
--
-- ── THE CALENDAR IS THE SOURCE OF TRUTH ────────────────────────────────────
-- His standing rule for this app, and it decides the shape of the fix. `active`
-- is no longer a thing you set and must remember to unset — it is a statement
-- about what is scheduled. Derived, so it cannot be forgotten, because nobody
-- has to remember it.
--
-- Backups: bak_program_assignments_20260822, bak_sw_assignment_20260822,
-- bak_clients_billing_20260822.

create or replace function public.stamp_scheduled_workout_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_program uuid;
  v_phase   uuid;
  v_label   text;
  v_assign  uuid;
  v_actual  uuid;
  v_newday  uuid;
begin
  if new.assignment_id is not null or new.day_id is null or new.client_id is null then
    return new;
  end if;

  select ph.program_id, ph.id, d.label into v_program, v_phase, v_label
    from public.days d join public.phases ph on ph.id = d.phase_id
   where d.id = new.day_id;

  -- A day with no programme behind it — a one-off, a client-owned day — is
  -- legitimate and stays unassigned rather than being forced into one.
  if v_program is null then
    return new;
  end if;

  select pa.id into v_assign
    from public.program_assignments pa
   where pa.client_id = new.client_id and pa.program_id = v_program
   order by pa.active desc, pa.assigned_at desc
   limit 1;

  if v_assign is null then
    insert into public.program_assignments (client_id, program_id, current_phase_id, active, assigned_at)
    values (new.client_id, v_program, v_phase, true, now())
    returning id into v_assign;

    -- Did the isolation trigger fork it out from under us?
    select program_id into v_actual from public.program_assignments where id = v_assign;
    if v_actual is distinct from v_program then
      select nd.id into v_newday
        from public.phases nph join public.days nd on nd.phase_id = nph.id
       where nph.program_id = v_actual and nd.label = v_label
       limit 1;
      -- Only follow the fork if the matching day is really there. Stamping an
      -- assignment onto a day outside its programme is the exact fault this
      -- exists to prevent, so an unrecognisable copy leaves the row alone and
      -- lets the integrity check report it.
      if v_newday is null then
        return new;
      end if;
      new.day_id := v_newday;
    end if;
  end if;

  new.assignment_id := v_assign;
  return new;
end;
$$;

drop trigger if exists trg_stamp_scheduled_workout_assignment on public.scheduled_workouts;
create trigger trg_stamp_scheduled_workout_assignment
  before insert or update of day_id on public.scheduled_workouts
  for each row execute function public.stamp_scheduled_workout_assignment();

-- Create the assignments that were never made.
insert into public.program_assignments (client_id, program_id, current_phase_id, active, assigned_at)
select distinct on (sw.client_id, ph.program_id)
       sw.client_id, ph.program_id, ph.id, true, now()
  from public.scheduled_workouts sw
  join public.days d   on d.id = sw.day_id
  join public.phases ph on ph.id = d.phase_id
 where sw.deleted_at is null and sw.scheduled_date >= current_date
   and not exists (select 1 from public.program_assignments pa
                    where pa.client_id = sw.client_id and pa.program_id = ph.program_id)
 order by sw.client_id, ph.program_id, sw.scheduled_date;

-- Backfill every row that has none.
update public.scheduled_workouts sw
   set assignment_id = pa.id
  from public.days d
  join public.phases ph on ph.id = d.phase_id
  join public.program_assignments pa on pa.program_id = ph.program_id
 where d.id = sw.day_id and pa.client_id = sw.client_id and sw.assignment_id is null;

-- Active means "has work on the calendar from today onward".
update public.program_assignments pa
   set active = exists (
     select 1 from public.scheduled_workouts sw
      where sw.assignment_id = pa.id and sw.deleted_at is null
        and sw.scheduled_date >= current_date)
 where exists (
   -- Only for clients who have future work at all, so somebody between blocks
   -- does not have every assignment switched off underneath them.
   select 1 from public.scheduled_workouts sw2
    where sw2.client_id = pa.client_id and sw2.deleted_at is null
      and sw2.scheduled_date >= current_date);
