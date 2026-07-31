-- Weekly programming brief: remember that it's been read.
--
-- Feedback 117353cd — "Give trainer app a summary on first session of each
-- client for the week of what the programming looks like that week, any
-- changes, focus on, etc."
--
-- The brief opens expanded on the FIRST session of a client's week and stays
-- collapsed after that. "After that" has to survive a device change: Dustin
-- starts a session on his phone and finishes it on the gym iPad, so
-- localStorage would re-open the card mid-session on the second device. Stored
-- as the ISO date of the week's Sunday, matching the weekStart the rest of the
-- app computes (see src/lib/weeklyBrief.ts, TrainerWeekDigest).
--
-- Same house style as clients.ai_focus_date and clients.digest_snoozed_until.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS week_brief_seen_week text;

COMMENT ON COLUMN public.clients.week_brief_seen_week IS 'ISO date of the Sunday whose weekly programming brief the trainer has already read for this client. Server-side rather than localStorage so the brief does not re-open on the gym iPad after being read on the phone.';
