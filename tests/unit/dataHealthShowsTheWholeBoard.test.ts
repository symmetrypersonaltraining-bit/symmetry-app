import test from "node:test";
import assert from "node:assert/strict";
import { liveChecks, lastCheckedAt, IntegrityRow } from "../../src/lib/dataHealth.ts";

/**
 * A GREEN ALL-CLEAR THAT WAS NOT LOOKING AT THE CRITICALS.
 *
 * /settings/data-health showed the rows whose `ran_at` equalled the newest
 * `ran_at`. That is the whole board on a nightly run, because the cron runs all
 * eight check functions in one transaction and they share a timestamp.
 *
 * It is not the whole board after anybody runs a single check function by hand.
 * On 7 Sep at 20:20 UTC a one-off run wrote three rows; the 11:25 cron that
 * morning had written twenty-three. For the three hours until the next cron the
 * page showed three checks, and the twenty it hid included every critical. Had
 * those three been clean the page would have said "Everything passed" over an
 * unread critical.
 *
 * The fixture below is that afternoon, with the shape of the real rows.
 */

const CRON = "2026-09-08T11:25:00.093Z";
const BY_HAND = "2026-09-08T20:20:19.750Z";

const row = (check_name: string, severity: string, count: number, ran_at: string): IntegrityRow =>
  ({ check_name, severity, count, detail: null, ran_at });

// In the order the page receives them: `.order("ran_at", { ascending: false })`,
// so the three rows somebody wrote by hand arrive first. That ordering is half
// the bug — the old filter took row zero as "the latest run".
const AFTERNOON: IntegrityRow[] = [
  // somebody checking one thing by hand, three hours after the cron
  row("duplicate_scheduled_workout", "warn", 0, BY_HAND),
  row("duplicate_scheduled_workout_by_label", "warn", 0, BY_HAND),
  row("client_coverage_under_14_days", "warn", 0, BY_HAND),
  // the nightly board
  row("gcal_sync_stale_over_90min", "critical", 4, CRON),
  row("completed_session_not_credited", "critical", 0, CRON),
  row("anon_writable_policies", "critical", 0, CRON),
  row("supervised_workout_no_appointment", "warn", 165, CRON),
  row("macro_targets_without_meal_plan", "warn", 20, CRON),
  row("same_workout_name_same_workout_copied", "info", 736, CRON),
];

test("data health — a run of one check by hand does not empty the board", () => {
  const live = liveChecks(AFTERNOON);
  assert.equal(live.length, 9, "every check that has reported recently should be on the board");
});

test("data health — the criticals survive a one-off run made after them", () => {
  const live = liveChecks(AFTERNOON);
  const criticals = live.filter((c) => c.severity === "critical");
  assert.equal(criticals.length, 3);
  // And the failing one is still failing, which is the whole point of the page.
  assert.deepEqual(
    criticals.filter((c) => c.count > 0).map((c) => c.check_name),
    ["gcal_sync_stale_over_90min"],
  );
});

test("data health — 'everything passed' cannot be said while a critical is failing", () => {
  // This is the sentence the old filter could have printed. It is the reason
  // the bug matters rather than merely being untidy.
  const failing = liveChecks(AFTERNOON).filter((c) => c.count > 0);
  assert.ok(failing.length > 0, "the board is not clean and must not read as clean");
});

test("data health — the newest row of each check wins, not the first one seen", () => {
  const twice = [
    row("supervised_workout_no_appointment", "warn", 241, "2026-09-07T23:25:00.000Z"),
    row("supervised_workout_no_appointment", "warn", 165, CRON),
  ];
  assert.equal(liveChecks(twice)[0].count, 165);
  // Order in must not decide it.
  assert.equal(liveChecks([...twice].reverse())[0].count, 165);
});

test("data health — a retired check does not come back from the dead", () => {
  // `scheduled_workout_null_assignment_id` was retired on 3 Sep: all 493 rows
  // were the standard shape. Its last row sits in the table for ever, and
  // reporting it again is re-raising a fault that was deliberately closed.
  const withCorpse = [
    ...AFTERNOON,
    row("scheduled_workout_null_assignment_id", "warn", 493, "2026-09-03T01:37:02.955Z"),
  ];
  const names = liveChecks(withCorpse).map((c) => c.check_name);
  assert.ok(!names.includes("scheduled_workout_null_assignment_id"), "retired five days ago");
  assert.equal(liveChecks(withCorpse).length, 9);
});

test("data health — the window is measured from the data, not from today", () => {
  // If the checker itself stops, the page must still show the last board it
  // produced rather than emptying out and looking clean.
  const old = AFTERNOON.map((r) => ({ ...r, ran_at: r.ran_at.replace("2026-09", "2026-06") }));
  assert.equal(liveChecks(old).length, 9);
});

test("data health — the page still dates itself by the last time anything ran", () => {
  assert.equal(lastCheckedAt(AFTERNOON), BY_HAND);
  assert.equal(lastCheckedAt([]), null);
});
