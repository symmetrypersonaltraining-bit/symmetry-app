// ============================================================================
// "9 READY TO SEND" WAS NINE INVOICES THAT WERE ALREADY PAID.
//
// Dustin, 14 Sep 2026, on the trainer home:
//   *"Wording is not right, 9 are not 'ready to send' they're still in
//     provisional period"*
//
// The card said **"3 sent, not confirmed paid. 9 ready to send."** The 3 were
// right — Grant Weever 14 Sep, Madeleine Coker 15 Sep, Lesly Spencer 18 Sep.
//
// The 9 were eight JULY invoices and one from last Thursday, every one of them
// `notification_status: 'paid'` with a `paid_confirmed_at` on it, the oldest
// sixty-nine days old. The fixtures below are those exact rows.
//
// They qualified because the filter asked one question — `!reminder_sent_at` —
// and a payment he was simply HANDED never gets a reminder_sent_at. So an
// invoice settled in cash passed that test forever, and the count only ever
// grew: it went from 8 to 9 the morning Mary Ellen's first invoice was created
// and marked paid the same day.
//
// A number that only goes up, attached to an instruction to go and chase people
// who already paid you, is worse than no number. It is the Today's Admin
// failure mode written into the one row about money.
//
// HIS WORD FOR IT IS THE STATE THE CARD COULD NOT SEE. Provisional is real
// here: the cycle closes seven days before the due date and the amount moves
// until it does, /api/reminders/send refuses a send before then, and the editor
// badges those rows PROVISIONAL. Thirteen invoices were sitting in exactly that
// state and the card had no way to say so — so the only bucket it could put
// anything in was the wrong one.
//
// AGAINST THE UNFIXED COMPONENT the second test below returns 9, not 0.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  moneyBuckets, moneySub, needsAttention, cycleEnd, isOutstanding,
  type ReminderRow,
} from "@/lib/payments/adminMoney";

const ADMIN = readFileSync(join(process.cwd(), "src/components/TodaysAdmin.tsx"), "utf8");

const TODAY = "2026-09-14";

const row = (r: Partial<ReminderRow> & { due_date: string }): ReminderRow => ({
  reminder_sent_at: null, client_ack_at: null, paid_confirmed_at: null,
  notification_status: "pending", ...r,
});

/** The nine. Paid, never sent a reminder — cash and transfers he was handed. */
const PAID_NEVER_SENT: ReminderRow[] = [
  "2026-07-07", "2026-07-09", "2026-07-09", "2026-07-12", "2026-07-14",
  "2026-07-15", "2026-07-18", "2026-07-21", "2026-09-10",
].map((d) =>
  row({ due_date: d, paid_confirmed_at: d + "T17:00:00Z", notification_status: "paid" }),
);

/** The three that were genuinely outstanding, all reminders already out. */
const SENT_UNCONFIRMED: ReminderRow[] = [
  row({ due_date: "2026-09-14", reminder_sent_at: "2026-09-10T09:56:12Z", notification_status: "sent" }),
  row({ due_date: "2026-09-15", reminder_sent_at: "2026-09-10T21:45:44Z", notification_status: "sent" }),
  row({ due_date: "2026-09-18", reminder_sent_at: "2026-09-14T19:28:09Z", notification_status: "sent" }),
];

/** The thirteen he was actually thinking of: cycle still open, cannot be sent. */
const STILL_PROVISIONAL: ReminderRow[] = [
  "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-27", "2026-09-30",
  "2026-09-30", "2026-10-02", "2026-10-03", "2026-10-03", "2026-10-04",
  "2026-10-09", "2026-10-15", "2026-10-30",
].map((d) => row({ due_date: d }));

const ROSTER = [...PAID_NEVER_SENT, ...SENT_UNCONFIRMED, ...STILL_PROVISIONAL];

describe("the money row counts what you can actually send", () => {
  it("a paid invoice is not work, however it was paid", () => {
    // The whole bug in one assertion. None of these ever had a reminder sent,
    // and that is not a reason to chase them — it is how being handed cash
    // looks in this table.
    for (const r of PAID_NEVER_SENT) {
      assert.equal(isOutstanding(r), false, `${r.due_date} is paid and must not be counted`);
    }
  });

  it("nothing is ready to send, because nothing is", () => {
    const b = moneyBuckets(ROSTER, TODAY);
    assert.equal(b.toSend.length, 0, "the nine already-paid July invoices are back in 'ready to send'");
    assert.equal(b.awaiting.length, 3, "the three sent-and-unanswered reminders are the real outstanding ones");
    assert.equal(b.provisional.length, 13, "the invoices whose cycle has not closed must be named, not hidden");
  });

  it("an invoice past its due date and unanswered is overdue", () => {
    const b = moneyBuckets(ROSTER, "2026-09-19");
    assert.equal(b.overdue.length, 3, "all three due dates have passed by the 19th");
    // overdue is a subset of awaiting, not a fourth bucket — the card subtracts
    // one from the other and would double-count them otherwise.
    assert.equal(b.awaiting.length, 3);
  });

  it("the cycle closes seven days before the due date, same as the send route", () => {
    assert.equal(cycleEnd("2026-10-09"), "2026-10-02");
    // A send the card offers must be a send the route accepts. Todd Prine's
    // 9 Oct invoice is refused until 2 Oct, so it cannot read as ready today.
    const b = moneyBuckets([row({ due_date: "2026-10-09" })], "2026-10-01");
    assert.equal(b.toSend.length, 0);
    assert.equal(b.provisional.length, 1);
    // …and the day it closes, it is ready. Not the day after.
    assert.equal(moneyBuckets([row({ due_date: "2026-10-09" })], "2026-10-02").toSend.length, 1);
  });

  it("provisional alone never raises the card", () => {
    // Thirteen invoices he is forbidden to touch is not a list of jobs. If that
    // could put a warning on his home screen the row would be permanent, and a
    // permanent warning is wallpaper.
    assert.equal(needsAttention(moneyBuckets(STILL_PROVISIONAL, TODAY)), false);
    assert.equal(needsAttention(moneyBuckets(ROSTER, TODAY)), true, "three unanswered reminders still count");
  });

  it("the sentence says the true thing, in his words", () => {
    const sub = moneySub(moneyBuckets(ROSTER, TODAY), TODAY);
    assert.match(sub, /^3 sent, not confirmed paid\./);
    assert.doesNotMatch(sub, /ready to send/, "there is nothing to send — do not say there is");
    assert.match(sub, /13 still provisional/, "the state he named must be the state it reports");
    assert.match(sub, /can send from Sep 15/, "and say when the first of them opens, or it invites the question back");
  });

  it("when something IS ready it leads with that", () => {
    const sub = moneySub(moneyBuckets([row({ due_date: "2026-09-16" }), ...STILL_PROVISIONAL], TODAY), TODAY);
    assert.match(sub, /^1 ready to send\./);
  });

  it("a paid row cannot come back as 'sent, not confirmed' either", () => {
    // The other direction of the same hole: paid_confirmed_at was the only
    // thing keeping these out of `awaiting`, so a row marked paid without the
    // timestamp would have appeared there instead.
    const b = moneyBuckets(
      [row({ due_date: "2026-08-09", reminder_sent_at: "2026-08-02T12:00:00Z", notification_status: "paid" })],
      TODAY,
    );
    assert.equal(b.awaiting.length, 0);
    assert.equal(needsAttention(b), false);
  });

  it("paused and skipped are finished business too", () => {
    // Stacie Weever is paused — 9 Oct, no reminder, and he is not billing her.
    // It stayed out of the old count only because its due date was far enough
    // away; a paused invoice inside the week would have been "ready to send".
    const b = moneyBuckets([row({ due_date: "2026-09-16", notification_status: "paused" }),
                            row({ due_date: "2026-09-16", notification_status: "skipped" })], TODAY);
    assert.equal(b.toSend.length, 0);
    assert.equal(b.provisional.length, 0);
  });

  // ── THE WIRING. A correct function the screen does not call fixes nothing. ──
  it("Today's Admin uses it, and no longer has its own idea of the buckets", () => {
    assert.match(ADMIN, /moneyBuckets/, "the component must call the shared function");
    assert.match(ADMIN, /notification_status/, "…which means it has to select the column");
    assert.doesNotMatch(
      ADMIN,
      /!p\.reminder_sent_at && p\.due_date <= addDays/,
      "the filter that counted nine paid invoices is back in the component",
    );
  });
});
