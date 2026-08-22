-- The trainer's schedule took 1.8 seconds because RLS re-derived "who am I"
-- for every row.
--
-- Measured against production, 22 Aug. The all-clients schedule query scans
-- 2334 rows in a 60-day window and spends 1803ms of its 1806ms inside
--
--     Filter: (trainer_can_see_client(client_id) OR (client_id = my_client_id()))
--
-- trainer_can_see_client() is STABLE, but it is called with a DIFFERENT
-- argument on every row, so Postgres cannot reuse the result — and each call
-- runs is_trainer(), is_owner() and my_trainer_id(), every one of which queries
-- `trainers` and auth.users. About 0.77ms per row, a few thousand times over.
--
-- None of that work depends on the row. Who the caller is, whether they are the
-- owner, and which trainer they are are the same for every row in the
-- statement. Wrapping each in a scalar sub-select makes Postgres evaluate it
-- ONCE as an InitPlan, and turns the per-client check into a hash set built
-- once instead of an EXISTS per row.
--
--     before   Execution Time: 1806.344 ms
--     after    Execution Time:    4.502 ms
--
-- THE PREDICATE IS THE SAME PREDICATE. trainer_can_see_client(x) is:
--
--     x is null            -> is_trainer()
--     not is_trainer()     -> false
--     is_owner()           -> true
--     otherwise            -> exists(client x belonging to my_trainer_id())
--
-- and that is what is written out below, in that order. The leading
-- is_trainer() carries the second line, so a non-trainer still gets nothing
-- even in the impossible case of is_owner() being true without it.
--
-- Verified by fingerprint rather than by reading it. Before and after, for five
-- principals, `md5(string_agg(id order by id))` over every visible row:
--
--     owner (Dustin)        5333 rows   05cdbd85…   unchanged
--     trainer (Stephanie)    254 rows   bdc41a7a…   unchanged
--     a client (Jada)         88 rows   aa5a6118…   unchanged
--     a trainer with no clients  0 rows              unchanged
--     a signed-in stranger       0 rows              unchanged
--
-- ALTER, never DROP + CREATE. Dustin was mid-session with a client when this
-- was applied — "im in a session so as long as it wont crash my logger get it
-- done please". A dropped policy is not a slow policy, it is a policy that
-- denies every row, and the gap between two statements would have been a window
-- where the logger could not read the workout he was writing into. ALTER POLICY
-- swaps the expression in one atomic statement.
--
-- The function is left alone: policies on forty-odd other tables call it, and
-- this change is about where it is CALLED FROM, not what it says. Those tables
-- have the same shape and the same fix available; scheduled_workouts is the one
-- that was measured to hurt.

alter policy trainer_all_scheduled_workouts on public.scheduled_workouts
  using (
    (select public.is_trainer())
    and (
      client_id is null
      or (select public.is_owner())
      or client_id in (
           select c.id from public.clients c
           where c.trainer_id = (select public.my_trainer_id())
         )
    )
  )
  with check (
    (select public.is_trainer())
    and (
      client_id is null
      or (select public.is_owner())
      or client_id in (
           select c.id from public.clients c
           where c.trainer_id = (select public.my_trainer_id())
         )
    )
  );

-- Same treatment, same reasoning. A client reading their own schedule is a
-- small query, but this is the policy the LOGGER reads and writes through on
-- every set.
alter policy client_rw_scheduled_workouts on public.scheduled_workouts
  using (client_id = (select public.my_client_id()))
  with check (client_id = (select public.my_client_id()));
