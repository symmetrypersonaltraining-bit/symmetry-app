-- Applied to production 2026-08-20 as
-- multitrainer_scope_money_and_notifications_20260820 and, immediately after,
-- link_orphan_assessments_and_scope_unassigned_20260820 and
-- owner_trainer_user_id_20260820. All three are reproduced here verbatim.
--
-- Sixteen policies still named Dustin. The phase-1/2 pass scoped 41 policies to
-- `trainer_can_see_client()`; these were missed, and they are the ones that
-- matter most: money, the calendar money is computed from, and push
-- notifications.
--
-- Each was wrong in BOTH directions at once, which is why neither leaving them
-- nor loosening them to `is_trainer()` was an option:
--
--   Stephanie was locked out. payment_reminders, calendar_payments,
--   billing_adjustments and appointments all tested for Dustin's literal email
--   or literal auth uid, so she could not see, create or send a payment
--   reminder for her own client.
--
--   And is_trainer() would have been worse: she would then see, edit and send
--   EVERY reminder Dustin has open. Dustin, 20 Aug: "there can be no crossover
--   on payments and payment reminders."
--
-- Verified with a live probe before and after: a throwaway client assigned to
-- Stephanie, then counts taken as each trainer. She saw 1 reminder, 1 payment,
-- 1 appointment, 0 billing_adjustments, 0 device_tokens, 0 client_notifications
-- and the full 843-exercise shared library. The owner saw all of it and exactly
-- one trainer_settings row -- his own.

-- ── helper: the same question, asked about an auth account ─────────────────
create or replace function public.trainer_can_see_auth_user(p_uid uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_uid is null then false
    when p_uid = auth.uid() then true              -- always your own devices
    when not public.is_trainer() then false
    when public.is_owner() then true
    else exists (
      select 1 from public.clients c
      where c.auth_user_id = p_uid and c.trainer_id = public.my_trainer_id()
    )
  end;
$$;
revoke all on function public.trainer_can_see_auth_user(uuid) from public;
grant execute on function public.trainer_can_see_auth_user(uuid) to authenticated, service_role;

-- ── MONEY ──────────────────────────────────────────────────────────────────
drop policy if exists "Trainer manages payment reminders" on public.payment_reminders;
drop policy if exists "trainer manages payment_reminders" on public.payment_reminders;
create policy trainer_scoped_payment_reminders on public.payment_reminders
  for all to authenticated
  using (public.trainer_can_see_client(client_id))
  with check (public.trainer_can_see_client(client_id));

drop policy if exists trainer_all_calendar_payments on public.calendar_payments;
create policy trainer_scoped_calendar_payments on public.calendar_payments
  for all to authenticated
  using (public.trainer_can_see_client(client_id))
  with check (public.trainer_can_see_client(client_id));

drop policy if exists "Trainer manages billing adjustments" on public.billing_adjustments;
create policy trainer_scoped_billing_adjustments on public.billing_adjustments
  for all to authenticated
  using (public.trainer_can_see_client(client_id))
  with check (public.trainer_can_see_client(client_id));

-- ── THE CALENDAR THE MONEY IS COMPUTED FROM ────────────────────────────────
drop policy if exists trainer_all_appointments on public.appointments;
create policy trainer_scoped_appointments on public.appointments
  for all to authenticated
  using (public.trainer_can_see_client(client_id))
  with check (public.trainer_can_see_client(client_id));

-- ── NOTIFICATIONS ──────────────────────────────────────────────────────────
-- device_tokens was is_trainer() for ALL commands: any trainer could read and
-- write EVERY push token in the system, including the other trainer's phone.
drop policy if exists trainer_all_device_tokens on public.device_tokens;
create policy trainer_scoped_device_tokens on public.device_tokens
  for all to authenticated
  using (public.trainer_can_see_auth_user(user_id))
  with check (public.trainer_can_see_auth_user(user_id));

-- ── CLIENT RECORDS ─────────────────────────────────────────────────────────
drop policy if exists "trainer manages private profiles" on public.client_private_profiles;
drop policy if exists trainer_all_client_private_profiles on public.client_private_profiles;
create policy trainer_scoped_private_profiles on public.client_private_profiles
  for all to authenticated
  using (public.trainer_can_see_client(client_id))
  with check (public.trainer_can_see_client(client_id));

drop policy if exists cpf_own_read on public.client_program_feedback;
create policy cpf_own_read on public.client_program_feedback
  for select to authenticated
  using (client_id = public.my_client_id() or public.trainer_can_see_client(client_id));

drop policy if exists trainer_reads_patterns on public.client_training_patterns;
create policy trainer_scoped_patterns on public.client_training_patterns
  for select to authenticated
  using (public.trainer_can_see_client(client_id));

drop policy if exists wfd_trainer_read on public.weekly_focus_drafts;
drop policy if exists wfd_trainer_write on public.weekly_focus_drafts;
create policy wfd_trainer_read on public.weekly_focus_drafts
  for select to authenticated
  using (public.trainer_can_see_client(client_id));
create policy wfd_trainer_write on public.weekly_focus_drafts
  for update to authenticated
  using (public.trainer_can_see_client(client_id))
  with check (public.trainer_can_see_client(client_id));

drop policy if exists trainer_reads_generation_log on public.schedule_generation_log;
create policy trainer_scoped_generation_log on public.schedule_generation_log
  for select to authenticated
  using (public.trainer_can_see_client(client_id));

drop policy if exists ai_action_log_trainer_read on public.ai_action_log;
create policy ai_action_log_trainer_read on public.ai_action_log
  for select to authenticated
  using (public.trainer_can_see_client(client_id));

-- ── A TRAINER'S OWN SETTINGS ARE THEIR OWN ─────────────────────────────────
-- "Trainer manages own settings" (auth.uid() = user_id) already covers what
-- anyone needs. The extra policy granted the owner ALL commands on EVERY row --
-- and this table stores Google refresh tokens in plaintext, so it let one
-- trainer read the credential to another trainer's entire calendar. Policies OR
-- together, so this was pure additional reach with nothing depending on it:
-- every server path that needs cross-trainer access holds the service role.
drop policy if exists "trainer manages trainer_settings" on public.trainer_settings;

-- ── ORPHANED ASSESSMENTS ───────────────────────────────────────────────────
-- The probe found Stephanie could read 2 client_assessments. Both were Dustin's
-- clients -- Sharon Rambo and Robby Burns -- whose intake records had never been
-- linked to their client rows. `trainer_can_see_client(NULL)` resolves to "any
-- trainer", which is right for a genuinely unassigned row and wrong for one
-- that is unassigned only because of a missing link. These carry medical
-- clearance, injuries, medications and pain history.
create table if not exists public.bak_client_assessments_orphan_20260820 as
  select * from public.client_assessments where client_id is null;

update public.client_assessments
   set client_id = '2d878e84-9749-40da-a353-6724ec742d0f'
 where id = '3a72f890-3ef4-4e0f-84be-b3e2951cc1f2' and client_id is null;

update public.client_assessments
   set client_id = 'fddace26-7c30-49e8-b0c9-b6727ffa74e6'
 where id = 'ffb424ca-dd1d-4b64-97d5-a42549d50839' and client_id is null;

-- Until it is assigned, an intake belongs to the business, not to whichever
-- trainer happens to open the page. If Stephanie ever runs her own intake this
-- needs a creator column rather than a loosened policy -- a shared queue and a
-- private record are different things and should not be told apart by a NULL.
drop policy if exists "trainer manages assessments" on public.client_assessments;
drop policy if exists trainer_scoped_assessments on public.client_assessments;
create policy trainer_scoped_assessments on public.client_assessments
  for all to authenticated
  using (case when client_id is null then public.is_owner()
              else public.trainer_can_see_client(client_id) end)
  with check (case when client_id is null then public.is_owner()
                   else public.trainer_can_see_client(client_id) end);

-- ── A DELIBERATE FALLBACK INSTEAD OF AN ARBITRARY ONE ──────────────────────
-- `trainer_user_id()` is trainer_settings LIMIT 1 with no ORDER BY plus a
-- hardcoded address. It is used where the code means "if we cannot work out
-- this client's own coach, send it somewhere sensible" -- and somewhere
-- sensible is the business owner, named as such, not a coin flip.
create or replace function public.owner_trainer_user_id()
returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select t.auth_user_id
  from public.trainers t
  where t.role = 'owner' and t.active and t.auth_user_id is not null
  limit 1;
$$;
revoke all on function public.owner_trainer_user_id() from public;
grant execute on function public.owner_trainer_user_id() to authenticated, service_role;

notify pgrst, 'reload schema';
