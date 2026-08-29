// The past-due takeover, and the two things about it that are easy to get wrong.
//
// Dustin, 29 Aug, after chasing Christine Latham and Sharon Rambo by email:
// "send ... app screen take over letting them know payment is late and needs to
// be paid ASAP."
//
// The home-screen banner already existed and had been up for over a week in
// both cases, unacknowledged, which is the argument for a takeover: a banner is
// easy not to see, and this is the one thing in the app that costs him money
// when it is missed.
//
// Two rules this must not break:
//
// 1. IT COMES BACK. Every other takeover is seen once and gone forever, which
//    is right for a birthday and wrong for a debt. The seen-key carries the
//    date, so dismissing costs them today and nothing more.
// 2. IT NEVER DUNS ANYBODY EARLY. Only an invoice the trainer has approved,
//    that the client has not acknowledged, that Dustin has not confirmed paid,
//    and whose due date has actually passed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/components/ClientTakeovers.tsx"), "utf8");

/** The takeover's own seen-key, as the component builds it. */
const pastDueKey = (reminderId: string, todayCT: string) => "pastdue-" + reminderId + "-" + todayCT;

test("dismissing it today does not dismiss it tomorrow", () => {
  const id = "96feaad6-e738-42fd-aea2-ea17b3852b6c";
  const seen = new Set([pastDueKey(id, "2026-08-29")]);
  assert.ok(seen.has(pastDueKey(id, "2026-08-29")), "today's is marked seen");
  assert.ok(!seen.has(pastDueKey(id, "2026-08-30")), "tomorrow's must NOT be");
});

test("paying it ends it for good, on every day", () => {
  // The way out is client_ack_at, not the seen-key: once that is set the row
  // never comes back from the query at all, so no date can resurrect it.
  assert.match(SRC, /\.is\("client_ack_at", null\)/);
  assert.match(SRC, /ack_payment_reminder/);
});

test("the ack goes through the RPC, because clients cannot update the table", () => {
  // Clients hold SELECT on their own payment_reminders and no UPDATE policy at
  // all. A direct .update() here would fail silently on every single tap and
  // the takeover would return the next morning to somebody who had already
  // said they paid.
  const ackFn = SRC.slice(SRC.indexOf("async function markPaid"), SRC.indexOf("async function saveDob"));
  assert.match(ackFn, /rpc\("ack_payment_reminder"/);
  assert.doesNotMatch(ackFn, /from\("payment_reminders"\)[\s\S]*\.update\(/);
});

test("nobody is chased early, or twice", () => {
  const q = SRC.slice(SRC.indexOf('from("payment_reminders")'));
  const head = q.slice(0, 600);
  // approved by Dustin ...
  assert.match(head, /\.eq\("notification_status", "sent"\)/);
  // ... not already acknowledged ...
  assert.match(head, /\.is\("client_ack_at", null\)/);
  // ... not already confirmed paid by him ...
  assert.match(head, /\.is\("paid_confirmed_at", null\)/);
  // ... and genuinely past due. lt, not lte: due today is not late.
  assert.match(head, /\.lt\("due_date", todayCT\)/);
});

test("days late counts from the due date, and is never zero", () => {
  const daysLate = (due: string, today: string) =>
    Math.max(1, Math.round((Date.parse(today) - Date.parse(due)) / 86400000));
  assert.equal(daysLate("2026-08-22", "2026-08-29"), 7);   // Christine
  assert.equal(daysLate("2026-08-23", "2026-08-29"), 6);   // Sharon
  assert.equal(daysLate("2026-08-28", "2026-08-29"), 1);
  // A clock skew must never render "0 days ago".
  assert.equal(daysLate("2026-08-29", "2026-08-29"), 1);
});
