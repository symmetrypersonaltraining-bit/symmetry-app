// Validation for the Billing & Schedule fields.
//
// Two of these guards exist because of a specific live failure:
//   - Tyler Dorsett's $15 session rate survived his move to a $300 FLAT rate
//     and billed him $60 against a $300 agreement. `clearUnusedFields`.
//   - Madeleine Coker's $75 SESSION rate sat in the monthly fee field for
//     weeks, billing her $75 a month, because no screen could edit either.

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBillingFields,
  fieldsFor,
  clearUnusedFields,
  BILLING_TYPES,
  CADENCES,
} from "../../src/lib/billingFields.ts";

const ok = (p: Record<string, unknown>) =>
  assert.equal(validateBillingFields(p), null, JSON.stringify(p) + " should be accepted");
const bad = (p: Record<string, unknown>, re: RegExp) => {
  const v = validateBillingFields(p);
  assert.ok(v, JSON.stringify(p) + " should be refused");
  assert.match(v!, re);
};

// ─── billing type ───────────────────────────────────────────────────────────

test("every billing type the engine handles is accepted", () => {
  for (const t of BILLING_TYPES) ok({ billing_type: t });
});

test("a billing type the engine does not handle is refused here, not by Postgres", () => {
  // The CHECK constraint would refuse it too — as a 500 carrying raw Postgres
  // text, on a screen about somebody's money.
  bad({ billing_type: "monthly" }, /billing type/);
  bad({ billing_type: "sessions" }, /billing type/);
});

test("every cadence in use is accepted, including twice-a-month", () => {
  for (const c of CADENCES) ok({ billing_cadence: c });
  ok({ billing_cadence: "semimonthly" }); // Sharon Rambo, 7th and 23rd
});

// ─── the numbers ────────────────────────────────────────────────────────────

test("a negative rate is refused", () => {
  bad({ current_fees: -640 }, /negative/);
  bad({ session_rate: -80 }, /negative/);
});

test("zero is allowed — a comped cycle is a real thing", () => {
  ok({ current_fees: 0 });
});

test("sessions per payment must be a sane whole number", () => {
  ok({ expected_sessions_per_cycle: 8 });
  ok({ expected_sessions_per_cycle: 12 });
  ok({ expected_sessions_per_cycle: 4 });
  // A typo'd 80 makes $640 read as $8 a session on the screen Dustin uses to
  // check a rate against itself.
  bad({ expected_sessions_per_cycle: 80 }, /between 1 and 60/);
  bad({ expected_sessions_per_cycle: 0 }, /between 1 and 60/);
  bad({ expected_sessions_per_cycle: 2.5 }, /whole number/);
});

test("days per week is checked in English before Postgres says it in SQL", () => {
  ok({ training_frequency: 3 });
  bad({ training_frequency: 7 }, /between 1 and 6/);
  bad({ training_frequency: 0 }, /between 1 and 6/);
});

test("a payment date has to be a day of the month", () => {
  ok({ billing_anchor_day: 23 });
  ok({ billing_anchor_day: 31 });
  bad({ billing_anchor_day: 47 }, /day of the month/);
  bad({ billing_anchor_day: 0 }, /day of the month/);
});

test("twice a month needs two different dates", () => {
  ok({ billing_anchor_day: 7, billing_anchor_day_2: 23 }); // Sharon
  bad({ billing_anchor_day: 7, billing_anchor_day_2: 7 }, /two different dates/);
});

test("clearing a field is always allowed", () => {
  ok({ session_rate: null });
  ok({ expected_sessions_per_cycle: null });
  ok({ billing_anchor_day_2: null });
  ok({ current_fees: "" });
});

test("only the keys present are judged", () => {
  // A screen saving one field must not be told about another it never touched.
  ok({ notes: "anything" });
  ok({});
});

test("nonsense in a numeric field is caught", () => {
  bad({ session_rate: "eighty" }, /number/);
  bad({ expected_sessions_per_cycle: "lots" }, /whole number/);
});

// ─── which fields each model uses ───────────────────────────────────────────

test("monthly_adjusted needs all three numbers", () => {
  const f = fieldsFor("monthly_adjusted");
  assert.ok(f.rate && f.sessionRate && f.expectedSessions,
    "the rule is rate minus cancellations x session rate — it needs every one");
});

test("a flat client has no session rate at all", () => {
  const f = fieldsFor("flat");
  assert.equal(f.sessionRate, false);
  assert.equal(f.rate, true);
});

test("switching to flat clears the session rate — Tyler Dorsett", () => {
  // His $15 survived the move to a $300 flat rate and billed him $60.
  const cleared = clearUnusedFields("flat");
  assert.equal(cleared.session_rate, null, "a stale session rate on a flat client is a wrong invoice");
  assert.equal("current_fees" in cleared, false, "flat clients keep their rate");
});

test("switching to sessions-trained clears the monthly rate", () => {
  const cleared = clearUnusedFields("per_session");
  assert.equal(cleared.current_fees, null);
  assert.equal(cleared.expected_sessions_per_cycle, null);
});

test("switching to not-billed clears every money field", () => {
  const cleared = clearUnusedFields("none");
  assert.equal(cleared.current_fees, null);
  assert.equal(cleared.session_rate, null);
  assert.equal(cleared.expected_sessions_per_cycle, null);
  assert.equal(cleared.paid_by_client_id, null);
});

test("someone-else-pays keeps the link and drops the money", () => {
  const cleared = clearUnusedFields("paid_by_other");
  assert.equal("paid_by_client_id" in cleared, false, "the link is the whole point of this type");
  assert.equal(cleared.current_fees, null);
  assert.equal(cleared.session_rate, null);
});

// ─── it has to be wired into the API ────────────────────────────────────────

test("the client PATCH route accepts the billing fields and validates them", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const ROUTE = readFileSync(join(process.cwd(), "src/app/api/clients/[clientId]/route.ts"), "utf8");
  for (const f of ["billing_type", "expected_sessions_per_cycle", "billing_anchor_day",
                   "billing_anchor_day_2", "paid_by_client_id"]) {
    assert.match(ROUTE, new RegExp('"' + f + '"'),
      f + " is not on the allow-list, so the profile screen silently cannot save it");
  }
  assert.match(ROUTE, /validateBillingFields\(updates\)/,
    "the patch is written without being checked");
  assert.match(ROUTE, /\.select\("id"\)/,
    "an update matching zero rows is not an error in PostgREST — the route would report ok:true");
});

// ─── the tab has to be reachable and wired ──────────────────────────────────

test("Billing & Schedule is a real tab on the client profile", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const TABS = readFileSync(join(process.cwd(), "src/app/(app)/clients/[clientId]/ClientProfileTabs.tsx"), "utf8");
  const PAGE = readFileSync(join(process.cwd(), "src/app/(app)/clients/[clientId]/page.tsx"), "utf8");

  assert.match(TABS, /id: "billing" as const/, "the tab is not in the tab bar, so nothing can reach it");
  assert.match(TABS, /tab === "billing" && <BillingScheduleTab client=\{client\} \/>/,
    "the tab renders nothing");
  assert.match(TABS, /import BillingScheduleTab from "\.\/BillingScheduleTab"/);

  // The tab reads these off the client prop. If the page's select drops one,
  // the field renders blank and SAVES blank — silently clearing a live rate.
  for (const col of ["billing_type", "billing_cadence", "session_rate",
                     "expected_sessions_per_cycle", "billing_anchor_day",
                     "billing_anchor_day_2", "training_days"]) {
    assert.ok(PAGE.includes(col),
      col + " is not selected on the profile page — the form would open blank and save blank");
    assert.match(TABS, new RegExp("\\n  " + col + ":"),
      col + " is missing from the Client interface");
  }
});

test("the form nulls the fields its billing type does not use", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const TAB = readFileSync(join(process.cwd(), "src/app/(app)/clients/[clientId]/BillingScheduleTab.tsx"), "utf8");
  assert.match(TAB, /Object\.assign\(patch, clearUnusedFields\(f\.billing_type\)\)/,
    "switching a client to flat would leave their session rate behind — Tyler Dorsett's $15 did exactly that");
  assert.match(TAB, /const local = validateBillingFields\(patch\);/,
    "the form posts without checking, so the server's error is the first thing anyone sees");
  assert.match(TAB, /if \(!res\.ok \|\| !j\?\.ok\)/,
    "a refused save would look identical to a successful one");
});
