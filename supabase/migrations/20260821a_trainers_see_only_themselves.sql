-- A trainer can see themselves. Nobody else's row, at all.
--
-- Dustin, 21 Aug, before the test group goes out: "trainers cannot see anyone
-- else's information. So nobody should be able to see other trainers' Venmo
-- tag, or anything, period."
--
-- `trainers_select_trainer` was `USING (is_trainer())` — any trainer read every
-- trainer row: name, email, phone, Venmo username, Zelle email, Cash App tag,
-- pay phone. Nothing in the app ever needed that. Every read in src/ is already
-- scoped to a specific id — the caller's own row, or the row of the client's
-- own trainer — and the one place that reads them all (the focus watchdog cron)
-- uses the service-role client and bypasses RLS entirely.
--
-- The three helpers this rests on — my_trainer_id(), is_trainer(), is_owner() —
-- are all SECURITY DEFINER and read `trainers` themselves, so they keep working
-- with this policy in place. Without that they would deadlock the whole model.
drop policy if exists "trainers_select_trainer" on public.trainers;

create policy "trainer_reads_own_row"
  on public.trainers for select to authenticated
  using (auth_user_id = auth.uid() or id = public.my_trainer_id());

-- The owner still sees the roster. He is running the business; he needs to know
-- who is on it. Separate policy so it is obvious and removable.
create policy "owner_reads_all_trainers"
  on public.trainers for select to authenticated
  using (public.is_owner());

-- `client_reads_own_trainer` already exists and stays untouched: a client must
-- be able to see who their trainer is and where to send money. That is the ONLY
-- cross-row read left, it is one row, and it is the point of the feature.
