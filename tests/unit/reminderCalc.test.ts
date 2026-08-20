import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcReminder,
  resolveBillingType,
  previousDueDate,
  nextDueDate,
  reminderSendDate,
  ReminderCalcInput,
  billedRateOf,
  describeAdjustment,
} from "../../src/lib/reminder-calc";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EDITOR = readFileSync(join(process.cwd(), "src/components/ReminderEditor.tsx"), "utf8");

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
  assert.ok(r.warnings.some((w) => w.includes("the full rate is billed")),
    "Tyler, Robert and Bobbie meet Dustin on the calendar and it must never move their rate");
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


// ─── a sent bill does not re-itemise itself when the rate changes ────────────
//
// Lesly Spencer, 18 Aug. Her rate went 75 -> 80 for the cycle starting 11 Aug,
// and her ALREADY-SENT 18 Aug reminder — calculated at 75 — instantly began
// displaying "8 sessions × $80 = $640" beside an amount that said otherwise.
// One row contradicting itself, on the screen Dustin screenshots for clients.

test("a sent reminder itemises at the rate it was billed at", () => {
  assert.equal(billedRateOf("75", 80), 75, "her 18 Aug bill re-priced itself at the new rate");
});

test("a reminder with no stored rate falls back to the client's", () => {
  assert.equal(billedRateOf(null, 80), 80);
  assert.equal(billedRateOf(undefined, 80), 80);
  assert.equal(billedRateOf("", 80), 80);
});

test("a nonsense stored rate does not win", () => {
  // An empty string is 0 through Number(), and 0 would render "8 sessions × $0".
  assert.equal(billedRateOf("0", 80), 80);
  assert.equal(billedRateOf("abc", 80), 80);
  assert.equal(billedRateOf(-75, 80), 80);
});

test("a numeric stored rate works as well as a string one", () => {
  // The RPC writes it as text, the editor writes it as text, but nothing stops
  // a number arriving from a hand-written row.
  assert.equal(billedRateOf(75, 80), 75);
});

test("no client rate and no stored rate is null, not zero", () => {
  assert.equal(billedRateOf(null, null), null);
});

// ─── showing the client what they were given ────────────────────────────────
//
// Dustin, 18 Aug, billing Lesly 6 of 8 sessions: "create a reminder in app so I
// can screenshot the dates n show her I gave her 2 free."

test("two sessions covered is described as two sessions", () => {
  const adj = describeAdjustment(600, 450, 75);
  assert.ok(adj);
  assert.equal(adj!.sessions, 2);
  assert.equal(adj!.amount, 150);
  assert.equal(adj!.direction, "covered");
});

test("an amount that matches says nothing at all", () => {
  assert.equal(describeAdjustment(600, 600, 75), null);
});

test("a discount that is not whole sessions is reported in dollars", () => {
  // $50 off a $75 rate is not two-thirds of a session to anybody.
  const adj = describeAdjustment(600, 550, 75);
  assert.ok(adj);
  assert.equal(adj!.sessions, null, "claimed a fractional session");
  assert.equal(adj!.amount, 50);
});

test("billing MORE than the itemisation is not called a discount", () => {
  const adj = describeAdjustment(450, 600, 75);
  assert.ok(adj);
  assert.equal(adj!.direction, "added");
  assert.equal(adj!.amount, 150);
});

test("a missing rate still reports the dollar gap", () => {
  const adj = describeAdjustment(600, 450, null);
  assert.ok(adj);
  assert.equal(adj!.sessions, null);
  assert.equal(adj!.amount, 150);
});

test("floating point pennies do not invent an adjustment", () => {
  assert.equal(describeAdjustment(0.1 + 0.2, 0.3, 75), null);
});

// ─── it has to be wired into the screen ─────────────────────────────────────

test("the payments screen itemises with the billed rate, not the client's", () => {
  assert.match(EDITOR, /sessions × \$" \+ \(r\.billedRate \?\? "\?"\)/,
    "the itemisation reads the client's CURRENT rate again — a rate rise rewrites sent bills");
  assert.match(EDITOR, /sessionRate: r\.billedRate,/,
    "calcReminder is fed the client's current rate, so `expected` re-prices sent bills");
  assert.match(EDITOR, /billedRateOf\(\s*storedIsNewShape && r\.notification_status !== "pending" \? cd\.rate : null,/,
    "billedRate no longer freezes on send / no longer follows the client while pending");
});

test("the adjustment line is rendered", () => {
  assert.match(EDITOR, /describeAdjustment\(calc\.expected, r\.amount_due, r\.billedRate\)/,
    "nothing tells the client the two sessions were covered");
  assert.match(EDITOR, /" covered" : " added"/,
    "a discount and a surcharge would read identically");
});

test("a sent reminder still shows the message the client sees", () => {
  // The textarea only renders while !sent, so once approved the client-facing
  // line vanished from the very screen that gets screenshotted TO the client.
  assert.match(EDITOR, /\{sent && r\.sms_message && \(/,
    "the client-facing message is invisible once the reminder is sent");
});

// ─── THE RULE, 20 Aug 2026 ──────────────────────────────────────────────────
//
// Dustin: "$640 for 2 x a week, their monthly on due date is $640 minus any
// cancelled sessions based on that monthly rate divided by the number of
// sessions (8) in this case. cancelled sessions are only to be deducted when i
// mark them cancelled (orange) in my gcal."
//
// Every fixture below is a real client's real numbers.

const adj = (over: Partial<ReminderCalcInput> = {}): ReminderCalcInput =>
  base({ billingType: "monthly_adjusted", ...over });

test("Grant Weever: $640, four cancelled at $80, pays $320", () => {
  const r = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 4, sessionsTrained: 5, draftAmount: 320 }));
  assert.equal(r.expected, 320);
  assert.equal(r.cancelDeduction, 320);
  assert.equal(r.baseRate, 640);
  assert.deepEqual(r.blocking, []);
});

test("sessions TRAINED never move the amount", () => {
  // Stacie trained 9 against an 8-session rate. The old rule billed her $720.
  const nine = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 0, sessionsTrained: 9, draftAmount: 640 }));
  const five = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 0, sessionsTrained: 5, draftAmount: 640 }));
  assert.equal(nine.expected, 640, "training extra sessions charged the client more");
  assert.equal(five.expected, 640, "training fewer sessions with no cancellation reduced the bill");
});

test("Hassan Kareem: $990, five cancelled at $82.50, pays $577.50", () => {
  const r = calcReminder(adj({ fee: 990, sessionRate: 82.5, expectedSessions: 12,
    cancelledFull: 5, sessionsTrained: 6, draftAmount: 577.5 }));
  assert.equal(r.expected, 577.5);
});

test("nobody cancelling pays the rate exactly", () => {
  const r = calcReminder(adj({ fee: 900, sessionRate: 75, expectedSessions: 12,
    cancelledFull: 0, sessionsTrained: 12, draftAmount: 900 }));
  assert.equal(r.expected, 900);
  assert.equal(r.cancelDeduction, 0);
});

test("deductions can never take a bill below zero", () => {
  const r = calcReminder(adj({ fee: 350, sessionRate: 87.5, expectedSessions: 4,
    cancelledFull: 6, sessionsTrained: 0, draftAmount: 0 }));
  assert.equal(r.expected, 0, "a negative invoice is not a thing");
  assert.ok(r.warnings.some((w) => /exceed the rate/.test(w)),
    "six cancels against a four-session rate has to say something");
});

// ─── half price while he is away ────────────────────────────────────────────
//
// "only time i will bill half price is when im on vacation and i am going to
// train them from the app. this will be done manually so ill need an option
// for that somehow."

test("a remote session at half price takes off half the session rate", () => {
  const r = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 0, halfPriceSessions: 2, sessionsTrained: 8, draftAmount: 560 }));
  assert.equal(r.halfPriceDeduction, 80);
  assert.equal(r.expected, 560);
});

test("half price and cancellations both come off", () => {
  const r = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 1, halfPriceSessions: 2, sessionsTrained: 5, draftAmount: 480 }));
  assert.equal(r.cancelDeduction, 80);
  assert.equal(r.halfPriceDeduction, 80);
  assert.equal(r.expected, 480);
});

test("half price is never applied on its own", () => {
  // It is manual by design. Zero unless Dustin sets it.
  const r = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 0, sessionsTrained: 8, draftAmount: 640 }));
  assert.equal(r.halfPriceDeduction, 0);
});

// ─── the three numbers have to agree with each other ────────────────────────

test("a rate that does not divide into the session count is flagged", () => {
  // Madeleine Coker's $75 session rate ended up in the monthly fee field. The
  // row still calculated cleanly; it was simply the wrong $75.
  const r = calcReminder(adj({ fee: 75, sessionRate: 75, expectedSessions: 8,
    cancelledFull: 0, sessionsTrained: 0, draftAmount: 75 }));
  assert.ok(r.warnings.some((w) => /sessions, but 8 are set/.test(w)));
});

test("rates that do agree say nothing", () => {
  const r = calcReminder(adj({ fee: 990, sessionRate: 82.5, expectedSessions: 12,
    cancelledFull: 0, sessionsTrained: 12, draftAmount: 990 }));
  assert.ok(!r.warnings.some((w) => /are set/.test(w)));
});

// ─── blocking ───────────────────────────────────────────────────────────────

test("no session rate blocks, because the deduction cannot be worked out", () => {
  const r = calcReminder(adj({ fee: 640, sessionRate: null, expectedSessions: 8,
    cancelledFull: 3, draftAmount: 640 }));
  assert.ok(r.blocking.some((b) => /session rate/.test(b)),
    "without a rate this would silently bill the full $640 for a month with three cancels");
});

test("no monthly rate blocks", () => {
  const r = calcReminder(adj({ fee: null, sessionRate: 80, expectedSessions: 8, draftAmount: 0 }));
  assert.ok(r.blocking.some((b) => /monthly rate/.test(b)));
});

test("paid_by_other is not billed and never blocks", () => {
  const r = calcReminder(base({ billingType: "paid_by_other", fee: null, sessionRate: null, draftAmount: 350 }));
  assert.equal(r.notApplicable, true);
  assert.deepEqual(r.blocking, []);
});

test("an override still downgrades the mismatch to a warning", () => {
  const r = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 0, draftAmount: 450, override: true }));
  assert.deepEqual(r.blocking, []);
  assert.ok(r.warnings.some((w) => /OVERRIDDEN/.test(w)));
});

test("the mismatch message explains the rule, not a session count", () => {
  const r = calcReminder(adj({ fee: 640, sessionRate: 80, expectedSessions: 8,
    cancelledFull: 2, sessionsTrained: 6, draftAmount: 999 }));
  assert.ok(r.blocking.some((b) => /\$640 less 2 cancelled x \$80/.test(b)),
    "a blocked amount has to say what the right number was made of");
});
