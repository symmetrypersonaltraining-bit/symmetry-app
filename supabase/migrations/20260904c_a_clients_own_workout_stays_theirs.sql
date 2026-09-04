-- LIBRARY VISIBILITY, AS DUSTIN STATED IT (4 Sep):
--
--   "i want all workouts from my library visible for all clients. for workouts
--    created and saved by a client it should only be visible to that client in
--    their personal library."
--
-- The first half already worked (client_reads_shared_library, 3 Sep). The
-- second half leaked, and this is the hole: `client_own_days` granted every day
-- of every programme a client is ASSIGNED to, with no regard for who created
-- the day. Several clients share one programme row — "Solo Training — 3-Day" is
-- assigned to a handful of people — so a workout stamped with one client's
-- `client_owner_id` was readable by all of them.
--
-- Measured before the fix: 21 day-rows were reachable by the wrong client.
-- Madeleine Coker could read Gerard's and Sharon's entire personal solo
-- programmes — nineteen days whose LABELS carry their injuries ("Low Back Day
-- (back is talking today)", "Dizzy Day (lightheaded, everything seated)",
-- "Left Leg Quiet"). None of them were scheduled for her, so nothing legitimate
-- is lost by closing it.
--
-- The rule now lives on the policy: a day reached through a programme
-- assignment belongs either to nobody (the trainer's library) or to the reader.
-- A day scheduled FOR a client is still readable through client_sched_days,
-- which is correct — being told to do a workout is its own grant.
drop policy if exists client_own_days on public.days;

create policy client_own_days on public.days
  for select
  using (
    (client_owner_id is null or client_owner_id = my_client_id())
    and exists (
      select 1
      from phases ph
      join program_assignments pa on pa.program_id = ph.program_id
      join clients c on c.id = pa.client_id
      where ph.id = days.phase_id
        and c.auth_user_id = (select auth.uid())
    )
  );
