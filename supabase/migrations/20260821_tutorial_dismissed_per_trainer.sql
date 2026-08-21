-- A trainer who has finished the walkthrough can put it away.
--
-- Deliberately NOT app_flags.trainer_tutorial_live: that switch is global, so
-- Dustin turning it off after his own run would take the guide away from the
-- next trainer being onboarded — the one person who actually needs it. This is
-- per trainer, keyed to the auth user, so it follows them across devices and
-- costs the others nothing.
--
-- Nullable on purpose. NULL = never dismissed = show it. A timestamp rather
-- than a boolean because "when did they decide they were done" is worth
-- knowing later and costs the same to store.
--
-- No new policy needed: trainer_settings already carries "Trainer manages own
-- settings" FOR ALL USING (auth.uid() = user_id), which covers this column.
alter table public.trainer_settings
  add column if not exists tutorial_dismissed_at timestamptz;

comment on column public.trainer_settings.tutorial_dismissed_at is
  'When this trainer hid the setup guide. NULL = still showing. Per-trainer; the global on/off is app_flags.trainer_tutorial_live.';
