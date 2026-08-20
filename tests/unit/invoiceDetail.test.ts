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
import { parseInvoiceDetail, explainAmount, shortDate } from "../../src/lib/invoiceDetail.ts";

// Grant Weever's real cycle: $640, four cancelled at $80.
const GRANT = {
  basis: "monthly_less_cancellations",
  billing_type: "monthly_adjusted",
  cycle: "2026-07-07 to 2026-08-07",
  rate: "80.00",
  monthly_rate: "640",
  expected_sessions: 8,
  sessions_trained: 5,
  dates_trained: ["2026-07-09", "2026-07-14", "2026-07-16", "2026-07-21", "2026-07-23"],
  sessions_cancelled: 4,
  dates_cancelled: ["2026-07-10", "2026-07-28", "2026-08-04", "2026-08-06"],
  cancel_deduction: 320,
  half_price_sessions: 0,
  half_price_deduction: 0,
  provisional: false,
};

test("the cycle is split out of the stored string", () => {
  const d = parseInvoiceDetail(GRANT);
  assert.equal(d.cycleStart, "2026-07-07");
  assert.equal(d.cycleEnd, "2026-08-07");
});

test("dates trained and cancelled both come through", () => {
  const d = parseInvoiceDetail(GRANT);
  assert.equal(d.datesTrained.length, 5);
  assert.equal(d.datesCancelled.length, 4);
  assert.equal(d.cancelDeduction, 320);
});

test("the one-liner explains the rule, not the schema", () => {
  const d = parseInvoiceDetail(GRANT);
  assert.equal(explainAmount(d, 320), "$640 − 4 cancelled ($320) = $320");
});

test("a clean cycle says so rather than showing a subtraction of nothing", () => {
  const d = parseInvoiceDetail({ ...GRANT, dates_cancelled: [], sessions_cancelled: 0, cancel_deduction: 0 });
  assert.equal(explainAmount(d, 640), "$640 — nothing cancelled this cycle");
});

test("half-price remote sessions appear in the explanation", () => {
  const d = parseInvoiceDetail({ ...GRANT, half_price_sessions: 2, half_price_deduction: 80 });
  assert.match(explainAmount(d, 240)!, /2 at half rate \(\$80\)/);
});

test("a sessions-trained bill is explained its own way", () => {
  const d = parseInvoiceDetail({
    basis: "sessions_trained", cycle: "2026-07-01 to 2026-08-01", rate: "75",
    dates_trained: ["2026-07-02", "2026-07-04"], dates_cancelled: [],
  });
  assert.equal(explainAmount(d, 150), "2 sessions × $75 = $150");
});

test("a flat bill needs no explanation and is given none", () => {
  const d = parseInvoiceDetail({ basis: "flat", cycle: "2026-07-25 to 2026-08-25", monthly_rate: "350" });
  assert.equal(explainAmount(d, 350), null, "a flat rate explains itself");
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
