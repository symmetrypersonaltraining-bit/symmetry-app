// THE WEEK IS THE CENTRAL WEEK, WHEREVER THE CODE IS RUNNING.
//
// Dustin, 22 Aug: "everything in the entire app needs to go by the actual
// calendar in the timezone we are in and must be accurate."
//
// Two places decided which week it was by asking the machine:
//
//   home/page.tsx        `new Date().getDay()` — on Vercel that is the UTC
//                        weekday. From 19:00 Central the server's "now" is
//                        already tomorrow, so from every evening onward the
//                        week boundaries slid forward a day — and on a
//                        SATURDAY evening the strip rolled into next week
//                        entirely, taking the adherence figure with it.
//                        Converting back through toLocaleDateString afterwards
//                        hid it well enough that it read as the app being
//                        flaky after dinner.
//
//   ClientDashboard.tsx  the same call in the browser, so the HANDSET's
//                        weekday, while the date label beside it came from
//                        toCT(). A client outside Central had the ring
//                        highlighting one day and naming another.
//
// The rule is the same on both sides: the calendar we are in decides, not the
// clock the code happens to be running on.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { centralDayOfWeek, centralWeekStart, shiftDate } from "../../src/lib/central-time.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─── the arithmetic ─────────────────────────────────────────────────────────

test("the weekday of a date is the same whatever zone the process is in", () => {
  // Sat 22 Aug 2026 is a Saturday. This must hold with TZ=UTC, which is what
  // the server runs, and it is the case that used to break.
  assert.equal(centralDayOfWeek("2026-08-22"), 6);
  assert.equal(centralDayOfWeek("2026-08-23"), 0);
  assert.equal(centralDayOfWeek("2026-08-24"), 1);
});

test("the week starts on the Sunday, and a Sunday starts its own week", () => {
  assert.equal(centralWeekStart("2026-08-22"), "2026-08-16");
  assert.equal(centralWeekStart("2026-08-23"), "2026-08-23");
  assert.equal(centralWeekStart("2026-08-24"), "2026-08-23");
});

test("it survives a DST boundary, where naive setDate does not", () => {
  // US DST ends Sun 1 Nov 2026. Adding 24h across it lands on the same day
  // twice; string arithmetic cannot.
  assert.equal(shiftDate("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftDate("2026-11-01", 1), "2026-11-02");
  assert.equal(centralWeekStart("2026-11-03"), "2026-11-01");
  // And across the spring forward, Sun 8 Mar 2026.
  assert.equal(shiftDate("2026-03-07", 1), "2026-03-08");
  assert.equal(centralWeekStart("2026-03-10"), "2026-03-08");
});

test("a whole week of days round-trips with no gaps or repeats", () => {
  const start = centralWeekStart("2026-08-22");
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  assert.deepEqual(days, [
    "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19",
    "2026-08-20", "2026-08-21", "2026-08-22",
  ]);
  assert.equal(new Set(days).size, 7);
});

// ─── and the two call sites use it ──────────────────────────────────────────

test("the home page does not ask the server what day it is", () => {
  const c = code(read("src/app/(app)/home/page.tsx"));
  assert.match(c, /centralWeekStart\(today\)/, "the week no longer starts from the Central date");
  assert.ok(!/new Date\(\)\.getDay\(\)/.test(c) && !/todayDate\.getDay\(\)/.test(c),
    "back to the UTC weekday — this is the bug that moved the week every evening");
});

test("the client week strip does not ask the handset what day it is", () => {
  const c = code(read("src/app/(app)/home/ClientDashboard.tsx"));
  assert.match(c, /centralDayOfWeek\(todayStr\)/,
    "the weekday must come from the Central date, not the device");
  assert.match(c, /shiftDate\(displayWeekStart, i\)/,
    "building each day with a Date object reintroduces a zone to be wrong about");
  assert.ok(!/const today = new Date\(\);[\s\S]{0,80}today\.getDay\(\)/.test(c),
    "the handset weekday is back");
});
