-- Billing rebuild, 20 Aug 2026. Applied to production the same day; this file
-- is the record. Two migrations were run: the schema/backfill and this recalc.
--
-- THE RULE, in Dustin's words:
--   "for clients that pay a monthly rate and train in person, for example $640
--    for 2 x a week, their monthly on due date is $640 minus any cancelled
--    sessions based on that monthly rate divided by the number of sessions (8)
--    in this case. cancelled sessions are only to be deducted when i mark them
--    cancelled (orange) in my gcal."
--
--     amount = monthly rate - (cancelled x session rate) - (half-price x rate/2)
--
-- WHY. The 31 July rule was `sessions_trained x rate`. Measured against the
-- payment markers in his own Google Calendar on 20 Aug, 16 of 20 open reminders
-- disagreed: $2,660 under-billed, $318 over. Sharon Rambo alone was out by $450
-- because 'semimonthly' fell through the cadence CASE to a monthly window.
--
-- Backups taken before anything ran:
--   bak_clients_billing_20260820
--   bak_recalc_pending_payment_reminders_20260820

-- ── schema ──────────────────────────────────────────────────────────────────
alter table public.clients drop constraint if exists clients_billing_type_check;
alter table public.clients add constraint clients_billing_type_check
  check (billing_type in ('monthly_adjusted','flat','per_session','paid_by_other','none'));

alter table public.clients add column if not exists expected_sessions_per_cycle int;
alter table public.clients add column if not exists billing_anchor_day int;
alter table public.clients add column if not exists billing_anchor_day_2 int;
alter table public.clients add column if not exists billing_anchor_weekday int;
alter table public.clients add column if not exists paid_by_client_id uuid
  references public.clients(id) on delete set null;

alter table public.clients drop constraint if exists clients_anchor_day_check;
alter table public.clients add constraint clients_anchor_day_check check (
  (billing_anchor_day   is null or billing_anchor_day   between 1 and 31) and
  (billing_anchor_day_2 is null or billing_anchor_day_2 between 1 and 31) and
  (billing_anchor_weekday is null or billing_anchor_weekday between 0 and 6)
);

alter table public.payment_reminders
  add column if not exists half_price_sessions int not null default 0;

comment on column public.clients.expected_sessions_per_cycle is
  'Sessions the monthly/cycle rate buys. Fixed by the trainer, never derived from how many slots a calendar month happens to contain - a month with five Mondays does not make the rate stretch further.';
comment on column public.clients.billing_type is
  'monthly_adjusted = rate minus (orange-cancelled x session_rate). flat = the rate, always, calendar ignored. per_session = sessions trained x rate. paid_by_other = billed on paid_by_client_id''s invoice. none = not billed.';
comment on column public.payment_reminders.half_price_sessions is
  'Sessions run remotely at half rate while the trainer was away. Set by hand only - never inferred from the calendar - and preserved by every recalculation.';

-- The recalc function body lives in the applied migration
-- `billing_recalc_monthly_adjusted_20260820`; see supabase/schema/baseline.sql
-- after the next dump for the authoritative text.
