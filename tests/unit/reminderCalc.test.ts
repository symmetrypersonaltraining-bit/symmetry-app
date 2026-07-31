import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcReminder,
  resolveBillingType,
  previousDueDate,
  nextDueDate,
  reminderSendDate,
  ReminderCalcInput,
} from "../../src/lib/reminder-calc";

// amount = sessions_trained x session_rate. Count what happened.
// Cancellations are display only and are NEVER deducted.

const base = (over: Partial<ReminderCalcInput> = {}): ReminderCalcInput => ({
  fee: 600,
  sessionRate: 75,
  cadence: "monthly",
  dueDate: "2026-08-02",
  sessionsTrained: 8,
  billingType: "per_session",
  cancelledFull: 0,
  cancelledHalf: 0,
  lastCycleApprovedOn: null,
  draftAmount: 600,
  override: false,
  ...over,
});

test("Dustin's rule: 8 sessions at $75 = $600", () => {
  const r = calcReminder(base());
  assert.equal(r.expected, 600);
  assert.deepEqual(r.blocking, []);
});

test("cancellations are NOT deducted and NOT billed", () => {
  const withCancels = calcReminder(base({ cancelledFull: 2, cancelledHalf: 1 }));
  const without = calcReminder(base());
  assert.equal(withCancels.expected, without.expected, "cancels must not change the amount");
  assert.equal(withCancels.expected, 600);
  // still surfaced for display
  assert.equal(withCancels.cancelledFull, 2);
  assert.equal(withCancels.cancelledHalf, 1);
  // and never as credits
  assert.equal(withCancels.autoCredits, 0);
  assert.equal(withCancels.totalCredits, 0);
});

test("the session count drives the amount, not the fee on file", () => {
  // fee on file says $900/mo but only 2 sessions were trained -- the gap that
  // WAS the overbilling. We bill what happened.
  const r = calcReminder(base({ fee: 900, sessionsTrained: 2, draftAmount: 150 }));
  assert.equal(r.expected, 150);
  assert.deepEqual(r.blocking, []);
});

test("zero sessions bills $0 and warns rather than blocking", () => {
  const r = calcReminder(base({ sessionsTrained: 0, draftAmount: 0 }));
  assert.equal(r.expected, 0);
  assert.deepEqual(r.blocking, []);
  assert.ok(r.warnings.some((w) => w.includes("No sessions trained")));
});

test("per_session with no session rate BLOCKS", () => {
  const r = calcReminder(base({ sessionRate: null, draftAmount: 0 }));
  assert.ok(r.blocking.some((b) => b.includes("no session rate on file")));
});

test("per_session no longer blocks on a missing fee on file", () => {
  const r = calcReminder(base({ fee: null }));
  assert.deepEqual(r.blocking, [], "current_fees is irrelevant to per_session billing");
  assert.equal(r.expected, 600);
});

test("flat billing ignores sessions entirely and bills the fee", () => {
  const r = calcReminder(
    base({ billingType: "flat", fee: 1500, sessionsTrained: 3, cadence: "quarterly", draftAmount: 1500 })
  );
  assert.equal(r.expected, 1500, "Jennifer Day pays $1500/quarter regardless");
  assert.deepEqual(r.blocking, []);
});

test("flat billing with no fee on file BLOCKS", () => {
  const r = calcReminder(base({ billingType: "flat", fee: null, draftAmount: 0 }));
  assert.ok(r.blocking.some((b) => b.includes("no fee on file")));
});

test("flat billing surfaces cancels as reference only", () => {
  const r = calcReminder(base({ billingType: "flat", fee: 300, cancelledFull: 2, draftAmount: 300 }));
  assert.equal(r.expected, 300);
  assert.ok(r.warnings.some((w) => w.includes("full fee billed")));
});

test("billing_type='none' returns not-applicable and never blocks", () => {
  const r = calcReminder(base({ billingType: "none", sessionRate: null, fee: null, draftAmount: 999 }));
  assert.equal(r.notApplicable, true);
  assert.equal(r.expected, 0);
  assert.deepEqual(r.blocking, [], "couples who pay together never block a queue");
  assert.deepEqual(r.warnings, []);
});

test("the 'last payment differs from fee on file' warning is gone", () => {
  // Varying amounts are the design now, so this warning was pure noise.
  const r = calcReminder(base({ lastPaymentAmount: 425, fee: 600 }));
  assert.ok(!r.warnings.some((w) => w.includes("differs from fee on file")));
});

test("a draft that disagrees with the calculation blocks, unless overridden", () => {
  const blocked = calcReminder(base({ draftAmount: 500 }));
  assert.ok(blocked.blocking.length > 0);
  assert.ok(blocked.blocking[0].includes("8 sessions x $75"), "message shows the basis");

  const overridden = calcReminder(base({ draftAmount: 500, override: true }));
  assert.deepEqual(overridden.blocking, []);
  assert.ok(overridden.warnings.some((w) => w.includes("OVERRIDDEN")));
});

test("rounding is to cents", () => {
  const r = calcReminder(base({ sessionRate: 33.33, sessionsTrained: 3, draftAmount: 99.99 }));
  assert.equal(r.expected, 99.99);
});

test("resolveBillingType falls back to the legacy flatBilling flag", () => {
  assert.equal(resolveBillingType({ flatBilling: true }), "flat");
  assert.equal(resolveBillingType({ flatBilling: false }), "per_session");
  assert.equal(resolveBillingType({}), "per_session");
  assert.equal(resolveBillingType({ billingType: "none", flatBilling: true }), "none");
});

test("the send-anchored cycle window is unchanged", () => {
  const r = calcReminder(base({ dueDate: "2026-08-02", cadence: "monthly" }));
  assert.equal(r.cycleEnd, "2026-07-26", "window closes 7 days before due");
  assert.equal(r.cycleStart, "2026-06-25", "starts at the previous cycle's send date");
});

test("the prior-approval date must NOT move the window start", () => {
  // Regression: it used to, and that dropped real sessions out of every cycle.
  // Todd Prine's prior reminder was approved 2026-07-03, which pushed the start
  // past the session he trained that day — the previous cycle had already closed
  // on 07-02, so it was billed by nobody. Cycles must tile: (prev send, this send].
  const withApproval = calcReminder(base({ lastCycleApprovedOn: "2026-07-05" }));
  const without = calcReminder(base());
  assert.equal(withApproval.cycleStart, without.cycleStart);
  assert.equal(withApproval.cycleStart, "2026-06-25");
});

test("consecutive cycles tile the timeline with no gap and no overlap", () => {
  const july = calcReminder(base({ dueDate: "2026-07-09" }));
  const august = calcReminder(base({ dueDate: "2026-08-09" }));
  assert.equal(july.cycleEnd, august.cycleStart,
    "August opens exactly where July closed, so no session falls between them");
});

test("cadence arithmetic still round-trips", () => {
  assert.equal(previousDueDate("2026-08-02", "weekly"), "2026-07-26");
  assert.equal(previousDueDate("2026-08-02", "biweekly"), "2026-07-19");
  assert.equal(previousDueDate("2026-08-02", "quarterly"), "2026-05-02");
  assert.equal(previousDueDate("2026-08-02", "monthly"), "2026-07-02");
  assert.equal(nextDueDate("2026-08-02", "quarterly"), "2026-11-02");
  assert.equal(reminderSendDate("2026-08-02"), "2026-07-26");
});
