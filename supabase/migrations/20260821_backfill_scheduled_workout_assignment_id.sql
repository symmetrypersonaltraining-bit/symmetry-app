-- The missing paper trail, repaired where it is unambiguous.
--
-- A scheduled workout carries two pointers: day_id, which says WHICH workout to
-- show, and assignment_id, which says which programme assignment put it there.
-- 1,044 rows had the second one empty. Every one of them still had the first,
-- so nothing was broken and no client was missing anything — but anything that
-- asks "what is still scheduled under this programme?" could not see them,
-- which is why the coverage check has been unreliable.
--
-- This ADDS a link. It touches no date, no day, nothing a client sees. Rows are
-- matched through day -> phase -> program to the assignment for the same client
-- and the same programme, and ONLY where exactly one assignment matches. There
-- were no ambiguous cases; 199 rows resolved.
--
-- Backed up first to bak_sw_assignment_backfill_20260821 (id, client, day,
-- assignment, date). Verified afterwards: zero scheduled_date changed.
--
-- 845 remain unlinked, and the shape of what is left is the useful part:
-- everyone except Dustin (128) and Tyler (88) has ONLY past rows left over —
-- old programmes since removed, which is just history and needs nothing.
-- Those two have future workouts from programmes with no assignment record at
-- all. Left alone: which programme they are actually on is a decision, not a
-- repair.
create table if not exists bak_sw_assignment_backfill_20260821 as
select id, client_id, day_id, assignment_id, scheduled_date, now() as backed_up_at
from scheduled_workouts where deleted_at is null and assignment_id is null;

with cand as (
  select sw.id as sw_id,
         (select pa.id from program_assignments pa
           where pa.client_id = sw.client_id and pa.program_id = ph.program_id
           limit 1) as pa_id,
         (select count(*) from program_assignments pa
           where pa.client_id = sw.client_id and pa.program_id = ph.program_id) as matches
  from scheduled_workouts sw
  join days d on d.id = sw.day_id
  join phases ph on ph.id = d.phase_id
  where sw.deleted_at is null and sw.assignment_id is null
)
update scheduled_workouts sw
   set assignment_id = cand.pa_id
  from cand
 where sw.id = cand.sw_id and cand.matches = 1;
