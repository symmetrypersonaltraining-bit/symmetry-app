-- Three tables where "any trainer" was the wrong audience.
--
-- app_flags: `USING (is_trainer())` FOR ALL, so any trainer could flip a switch
-- that changes the app for every trainer and every client. Dustin, 21 Aug:
-- owner only. Trainers still READ them — the tutorial gate and the coach gate
-- are read client-side and must keep working — they just cannot change them.
drop policy if exists "trainer_write_app_flags" on public.app_flags;

create policy "trainers_read_app_flags"
  on public.app_flags for select to authenticated
  using (public.is_trainer());

create policy "owner_writes_app_flags"
  on public.app_flags for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- gcal_sync_runs: one trainer could read every trainer's calendar-sync
-- activity — when they synced, what failed, the response bodies. Owner only;
-- it is an operational log, and the person who fixes a broken sync is him.
drop policy if exists "gcal_sync_runs_trainer_read" on public.gcal_sync_runs;

create policy "owner_reads_gcal_sync_runs"
  on public.gcal_sync_runs for select to authenticated
  using (public.is_owner());

-- integrity_checks: a trainer-read policy was added earlier the same day to get
-- the dashboard reporting, and it was too wide by the same measure — the detail
-- column names clients by name, and those clients belong to other trainers.
-- Owner only. Today's Admin simply draws no integrity row for a non-owner,
-- which is right: these are whole-database faults and he is the one who fixes
-- them.
drop policy if exists "Trainers read integrity checks" on public.integrity_checks;
drop policy if exists "trainer_all_integrity_checks" on public.integrity_checks;

create policy "owner_reads_integrity_checks"
  on public.integrity_checks for select to authenticated
  using (public.is_owner());
