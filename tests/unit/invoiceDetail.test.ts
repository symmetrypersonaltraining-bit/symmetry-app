// What a client is shown about a bill.
//
// Dustin, 20 Aug: "I want to add full dates trained/cancelled and billing cycle
// on the clients view along w billing records where they or I can pull up past
// invoices w details."
//
// Everything here READS credit_details. It does not recompute — recomputing at
// display time is precisely what produced "8 sessions × $80 = $640" beside an
// amount of $450 on Lesly Spencer's reminder two days ago.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInvoiceDetail, explainAmount, invoiceLines, shortDate } from "../../src/lib/invoiceDetail.ts";

// Grant Weever's real cycle: $640 for 8 sessions at $80. He trained 6 and
// cancelled 2 — both of them genuinely missed, so both are credited.
const GRANT = {
  basis: "monthly_less_missed",
  billing_type: "monthly_adjusted",
  cycle: "2026-07-07 to 2026-08-07",
  rate: "80.00",
  monthly_rate: "640",
  expected_sessions: 8,
  sessions_trained: 6,
  dates_trained: ["2026-08-10", "2026-08-11", "2026-08-20", "2026-08-27", "2026-09-01", "2026-09-03"],
  sessions_cancelled: 2,
  dates_cancelled: ["2026-08-18", "2026-08-25"],
  sessions_credited: 2,
  sessions_extra: 0,
  cancel_deduction: 160,
  provisional: false,
};

test("the cycle is split out of the stored string", () => {
  const d = parseInvoiceDetail(GRANT);
  assert.equal(d.cycleStart, "2026-07-07");
  assert.equal(d.cycleEnd, "2026-08-07");
});

test("dates trained and cancelled both come through", () => {
  const d = parseInvoiceDetail(GRANT);
  assert.equal(d.datesTrained.length, 6);
  assert.equal(d.datesCancelled.length, 2);
  assert.equal(d.cancelDeduction, 160);
});

test("the client sees the same three lines the trainer does", () => {
  // Dustin screenshots his own payments screen to explain a bill. That only
  // works while both screens itemise identically.
  const d = parseInvoiceDetail(GRANT);
  assert.deepEqual(invoiceLines(d, 480), [
    { label: "8 sessions × $80", value: "$640", tone: "base" },
    { label: "2 sessions covered · not charged", value: "− $160", tone: "credit" },
    { label: "Due", value: "$480", tone: "total" },
  ]);
});

test("a cancellation that was made up is not shown as covered", () => {
  // Lesly: 8 of 8 trained, 2 cancelled and both made up inside the cycle. The
  // old rule handed her $160 back for sessions she did not miss.
  const d = parseInvoiceDetail({
    ...GRANT, sessions_trained: 8, sessions_cancelled: 2,
    dates_cancelled: ["2026-08-17", "2026-08-25"],
    sessions_credited: 0, cancel_deduction: 0,
  });
  const lines = invoiceLines(d, 640);
  assert.equal(lines.length, 2, "rate line and total, no credit line");
  assert.equal(lines[0].value, "$640");
  assert.equal(lines[1].value, "$640");
  assert.ok(!lines.some((l) => l.tone === "credit"), "nothing was missed, so nothing is covered");
});

test("sessions above the plan are shown, and shown as free", () => {
  // Tim trained 14 against a 12-session rate. Dustin, 29 Aug: "dont charge
  // extras above plan." A free session he cannot see is a free session he gets
  // no credit for.
  const d = parseInvoiceDetail({
    ...GRANT, expected_sessions: 12, monthly_rate: "840", rate: "70",
    sessions_trained: 14, sessions_cancelled: 0, dates_cancelled: [],
    sessions_credited: 0, sessions_extra: 2, cancel_deduction: 0,
  });
  const lines = invoiceLines(d, 840);
  const extra = lines.find((l) => l.label.includes("above the plan"));
  assert.ok(extra, "the extras must be visible");
  assert.equal(extra!.label, "2 sessions above the plan");
  assert.equal(extra!.value, "not charged");
});

test("a clean cycle shows the rate and nothing subtracted from it", () => {
  const d = parseInvoiceDetail({ ...GRANT, dates_cancelled: [], sessions_cancelled: 0,
                                 sessions_credited: 0, cancel_deduction: 0 });
  assert.deepEqual(invoiceLines(d, 640), [
    { label: "8 sessions × $80", value: "$640", tone: "base" },
    { label: "Due", value: "$640", tone: "total" },
  ]);
});

test("a per-session bill is explained its own way", () => {
  // Todd Prine from 29 Aug: a pilot booked a week at a time.
  const d = parseInvoiceDetail({
    basis: "sessions_trained", cycle: "2026-08-02 to 2026-09-02", rate: "75",
    dates_trained: ["2026-08-03", "2026-08-06"], dates_cancelled: [],
  });
  assert.deepEqual(invoiceLines(d, 150), [
    { label: "2 sessions trained × $75", value: "$150", tone: "base" },
    { label: "Due", value: "$150", tone: "total" },
  ]);
});

test("a flat bill says the cancellations were not deducted", () => {
  // Jennifer Day is quarterly flat and cancelled four. Saying nothing invites
  // the question; saying "not deducted" answers it before it is asked.
  const d = parseInvoiceDetail({
    basis: "flat", cycle: "2026-07-23 to 2026-10-23", monthly_rate: "1500",
    dates_cancelled: ["2026-07-30", "2026-08-10", "2026-08-13", "2026-08-20"],
  });
  const lines = invoiceLines(d, 1500);
  assert.equal(lines[1].label, "4 cancelled");
  assert.equal(lines[1].value, "not deducted");
});

test("a row with no detail behind it explains nothing rather than guessing", () => {
  assert.deepEqual(invoiceLines(parseInvoiceDetail({ basis: "" }), 100), []);
  assert.equal(explainAmount(parseInvoiceDetail({ basis: "" }), 100), null);
});

test("older rows written under the 20 Aug rule still render", () => {
  // sessions_credited did not exist before 29 Aug. A paid invoice from last
  // month must not lose its credit line just because the schema moved on.
  const d = parseInvoiceDetail({
    basis: "monthly_less_cancellations", rate: "80", monthly_rate: "640",
    expected_sessions: 8, dates_trained: [], dates_cancelled: ["2026-07-10", "2026-07-28"],
    cancel_deduction: 160,
  });
  const lines = invoiceLines(d, 480);
  assert.equal(lines[1].label, "2 sessions covered · not charged");
  assert.equal(lines[1].value, "− $160");
});

// ─── it must never throw on a bad row ───────────────────────────────────────

test("a malformed credit_details degrades to no detail, not a crash", () => {
  for (const junk of [null, undefined, "", 0, [], "not json", { cycle: 12345 }]) {
    const d = parseInvoiceDetail(junk);
    assert.equal(d.cycleStart, null);
    assert.deepEqual(d.datesTrained, []);
    assert.equal(explainAmount(d, 100), null);
  }
});

test("dates that are not strings are dropped rather than rendered as [object Object]", () => {
  const d = parseInvoiceDetail({ ...GRANT, dates_trained: ["2026-07-09", 42, null, { a: 1 }] });
  assert.deepEqual(d.datesTrained, ["2026-07-09"]);
});

test("a missing monthly rate produces no half-finished sentence", () => {
  const d = parseInvoiceDetail({ ...GRANT, monthly_rate: null });
  assert.equal(explainAmount(d, 320), null);
});

test("half_price falls back to the column when the jsonb has not caught up", () => {
  const d = parseInvoiceDetail({ ...GRANT, half_price_sessions: undefined }, 3);
  assert.equal(d.halfPriceSessions, 3);
});

// ─── dates render in Central, not a day early ───────────────────────────────

test("a date-only string does not slip back a day", () => {
  // Parsed at midnight UTC this renders as the previous day in Central — the
  // same bug already fixed once in the reminder email.
  assert.equal(shortDate("2026-08-13"), "Aug 13");
  assert.equal(shortDate("2026-01-01"), "Jan 1");
});

test("an unparseable date is shown as-is rather than as Invalid Date", () => {
  assert.equal(shortDate("not-a-date"), "not-a-date");
});

// ─── wired into both screens ────────────────────────────────────────────────

test("the client's payment banner shows cycle, dates and cancellations", () => {
  const B = readFileSync(join(process.cwd(), "src/components/PaymentDueBanner.tsx"), "utf8");
  assert.match(B, /parseInvoiceDetail\(r\.credit_details, r\.half_price_sessions\)/,
    "the banner does not read the stored detail");
  assert.match(B, /half_price_sessions/, "the select does not fetch it");
  for (const bit of ["Trained \\(", "Cancelled \\(", "det.cycleStart"]) {
    assert.match(B, new RegExp(bit), "the client still cannot see " + bit);
  }
  assert.doesNotMatch(B, /credit_details\?\.sessions/,
    "the dead pre-August credits key is back — nothing has written it since the rule changed");
});

test("billing records are reachable from both sides", () => {
  const SETTINGS = readFileSync(join(process.cwd(), "src/app/(app)/settings/SettingsClient.tsx"), "utf8");
  const TAB = readFileSync(join(process.cwd(), "src/app/(app)/clients/[clientId]/BillingScheduleTab.tsx"), "utf8");
  assert.match(SETTINGS, /<BillingHistory \/>/, "a client has no way to see past bills");
  assert.match(TAB, /<BillingHistory clientId=\{client\.id\} \/>/, "the trainer has no way to see past bills");

  const H = readFileSync(join(process.cwd(), "src/components/BillingHistory.tsx"), "utf8");
  assert.match(H, /\.in\("notification_status", \["sent", "paid"\]\)/,
    "drafts are being shown as records — a pending row is recalculated on every sync and would change by itself");
});
