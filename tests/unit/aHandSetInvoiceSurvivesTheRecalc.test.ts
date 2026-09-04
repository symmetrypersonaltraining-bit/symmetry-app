// A NUMBER A PERSON SET ON PURPOSE IS NOT A NUMBER TO RECOMPUTE.
//
// Dustin, 4 Sep, on Hassan: he moved from 3 days a week to 5 mid-cycle, having
// already paid $495 for the 15 Aug – 15 Sep cycle at the old rate. What he still
// owed was the 2 extra days a week from 31 Aug to 15 Sep at the new $77 — five
// sessions, $385, back-charged against the 22 Aug payment.
//
// That was written onto the invoice with the dates in the note. Then
// recalc_pending_payment_reminders() ran — 3x a day on cron, and again after
// every Google Calendar sync — and replaced $385 with $1,155: the ordinary
// monthly_adjusted answer, 1540 - 385. The note still described a back-charge.
// The amount had quietly become a full month's invoice.
//
// Nothing in the row said a person had decided the figure, so the recalc could
// not tell a computed amount from a decided one. Now it can.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const COL = read("supabase/migrations/20260904a_payment_reminders_manual_amount.sql");
const FN = read("supabase/migrations/20260904b_recalc_skips_manual_amounts.sql");
/** Statements only. The header of that file QUOTES the predicate it adds, so a
 *  check against the raw text passes on a file that merely describes the change
 *  — which is exactly the failure this file is about. Caught by deleting the
 *  real line and watching the test stay green. */
const fn = FN.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("the flag exists and defaults to off", () => {
  // Default false, not null: a three-state flag on a money column is a bug
  // waiting for whichever branch forgot the third state.
  assert.match(COL, /add column if not exists manual_amount boolean not null default false/);
});

test("the recalc skips a row a person set", () => {
  assert.match(fn, /and r\.manual_amount is not true/, "the recalc will overwrite a hand-set amount again");
});

test("nothing else about the recalc moved", () => {
  // The guards that were already there are what stop it touching an invoice
  // that has been approved or already emailed.
  for (const guard of [
    /r\.notification_status = 'pending'/,
    /r\.approved_at\s+is null/,
    /r\.email_sent_at is null/,
    /r\.sms_sent_at\s+is null/,
  ]) assert.match(FN, guard);
  // And the arithmetic itself: monthly rate less credited cancellations, floored
  // at zero. Sessions above plan are NOT charged — the monthly rate caps the
  // month, which Dustin confirmed on 4 Sep is the rule and not an omission.
  assert.match(FN, /greatest\(0, round\(coalesce\(cp\.current_fees, 0\)\s*\n\s*- cp\.n_credited \* coalesce\(cp\.session_rate, 0\), 2\)\)/);
  assert.match(FN, /least\(c\.n_ca, greatest\(0, coalesce\(c\.plan_n, 0\) - c\.n_tr\)\) as n_credited/);
});

test("the whole function body is in the migration, not pointed at", () => {
  // supabase/schema/baseline.sql held the superseded 31-July rule for this same
  // function while production ran the 20-Aug one, because the migration that
  // changed it only described the change. A reader could not tell which was
  // live. This file is the record.
  assert.match(FN, /CREATE OR REPLACE FUNCTION public\.recalc_pending_payment_reminders\(\)/);
  assert.match(FN, /\$function\$;/);
  assert.ok(FN.split("\n").length > 100, "the body was replaced by a pointer again");
});
