-- THE BALANCE NOBODY COULD SEE UNTIL IT WAS GONE.
--
-- Dustin, 13 Sep 2026, mid-test: "photo didn't work, says credit balance
-- issue" ... "same issue with creating a plan with ai" ... "wtf are we doing??
-- everything im testing is getting worse".
--
-- Every AI call in the app had been failing for an hour with
--
--   400 invalid_request_error -- "Your credit balance is too low to access the
--   Anthropic API."
--
-- and the first signal was features breaking in his hands. The app already
-- meters its OWN spend against a $95/month cap, but that cap has never known
-- anything about the account's actual balance -- so a healthy meter and an
-- empty account look identical from inside.
--
-- There is no balance endpoint on the Messages API to read, so this is a
-- LEDGER: he records what he puts on, the app counts what it has spent since,
-- and the difference is an estimate good enough to warn on. The estimate is
-- honest about being one; the OUTAGE signal beside it is exact, because it is
-- read from ai_usage_log.error and needs no bookkeeping at all.
--
-- Instance-wide, not per trainer: one Anthropic account, one API key, one
-- balance. `added_by` records who, for the history, and gates nothing.

create table if not exists public.ai_credit_topups (
  id          uuid primary key default gen_random_uuid(),
  -- Dollars added. Positive. The first row may instead record what was
  -- already on the account when this started being tracked.
  amount_usd  numeric(10,2) not null check (amount_usd > 0),
  -- The date the credit landed. Spend is counted from the EARLIEST of these,
  -- so leftover credit carries across top-ups instead of being forgotten.
  added_on    date not null default (now() at time zone 'America/Chicago')::date,
  note        text,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists ai_credit_topups_added_on_idx
  on public.ai_credit_topups (added_on);

alter table public.ai_credit_topups enable row level security;

-- Trainers only. A client has no business reading the business's AI bill, and
-- nothing client-facing reads this table.
drop policy if exists ai_credit_topups_trainer_all on public.ai_credit_topups;
create policy ai_credit_topups_trainer_all
  on public.ai_credit_topups
  for all
  to authenticated
  using (exists (select 1 from public.trainers t where t.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.trainers t where t.auth_user_id = auth.uid()));
