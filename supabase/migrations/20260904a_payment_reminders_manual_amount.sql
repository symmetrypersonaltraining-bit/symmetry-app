-- A HAND-SET AMOUNT MUST SURVIVE THE RECALC.
--
-- Dustin, 4 Sep, on Hassan: "he already paid me the original 8/22 payment at
-- his 3 x a week rate... he currently owes 2 extra days a week at the new 5 x a
-- week rate ($77/session) from 8/31 to 9/15 to back pay against his 8/22
-- payment."
--
-- That back-charge is $385 — five extra sessions at $77. It was written into
-- the invoice, correctly, with the dates listed in the note. Then
-- recalc_pending_payment_reminders() ran (3x a day on cron, and after every
-- Google Calendar sync) and replaced it with $1,155: the standard
-- monthly_adjusted answer of 1540 - 385. The note still described a
-- back-charge; the amount had silently become a full month's invoice.
--
-- Nothing in the table said "a person set this on purpose", so the recalc had
-- no way to tell a computed amount from a decided one. This is that flag.
alter table public.payment_reminders
  add column if not exists manual_amount boolean not null default false;

comment on column public.payment_reminders.manual_amount is
  'TRUE when a person set amount_due deliberately (a back-charge, a one-off adjustment, a negotiated figure). recalc_pending_payment_reminders() skips these rows completely — it will not touch amount_due or credit_details.';
