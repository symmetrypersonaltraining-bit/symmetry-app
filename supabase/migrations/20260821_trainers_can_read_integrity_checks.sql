-- The dashboard cannot report what it cannot read.
--
-- integrity_checks had RLS on and NOT ONE policy, so every browser read
-- returned an empty set. That is a large part of why a check could fail from
-- 16 Aug with nobody the wiser: even had something tried to display it, it
-- would have shown nothing and looked healthy.
--
-- Read-only, trainers only. Rows are written by run_integrity_checks(), which
-- is SECURITY DEFINER and bypasses this; nothing else should ever insert here,
-- and no client should ever see it — the detail column names other people's
-- clients.
create policy "Trainers read integrity checks"
  on public.integrity_checks
  for select
  to authenticated
  using (public.is_trainer());
