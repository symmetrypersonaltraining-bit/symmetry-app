// Guard: the streak the AI quotes is not silently capped by a fetch window.
//
// `assembleTrainingContext` builds the line the client reads in Coach's Read:
//
//   "Current completed-session streak: N days."
//
// N was counted off the same 30-day array as the adherence numbers, so it could
// never exceed 30. A client on a 31-day run would be told 30 — and told 30 the
// next day, and the next, the number frozen while they kept training, with
// nothing on screen to say why. The first time it mattered would be the day it
// mattered most.
//
// Measured before fixing, because "could happen" is not a reason on its own:
//
//   with sw as (select distinct client_id, scheduled_date d
//               from scheduled_workouts where status='completed' and deleted_at is null),
//        g  as (select client_id, d, d - (row_number() over
//               (partition by client_id order by d))::int grp from sw)
//   select name, count(*) from g join clients using... group by name, grp
//   order by count(*) desc;
//   → Claudine Ocon, 20 consecutive days, 25 Jul – 13 Aug.
//
// Two thirds of the way to the ceiling, by one of 29 clients. The streak now
// has its own wide query; `done30/total30` on the next line still reads the
// 30-day fetch, because those must stay 30-day numbers.
//
// ── The other half of this, deliberately NOT changed ──────────────────────
//
// There are THREE streak calculations in the app and they use TWO sources.
// MetricCards and ClientWeekSummary count `workout_logs.completed` — everything
// the client did. This one counts `scheduled_workouts.status='completed'` —
// only what was on the plan. Over 90 days those two disagree on 92 client-days
// across 21 of 29 clients.
//
// But checked against the database, **no client's streak differs today**, so
// nobody is currently being shown two different numbers. Unifying them changes
// what the AI says to every client on the strength of a latent inconsistency,
// which is not a 4am decision. It is written up for Dustin instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = readFileSync(join(process.cwd(), "src/lib/ai/coach-context.ts"), "utf8");
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fn = code.slice(code.indexOf("export async function assembleTrainingContext"));

test("the streak has its own window, wider than the adherence one", () => {
  assert.match(fn, /const winStreak = ctShiftDays\(today, -\d{3,}\)/, "the streak window is gone or is under 100 days");
  assert.match(fn, /\.gte\("scheduled_date", winStreak\)/, "nothing fetches with it");
});

test("the streak is counted off the wide fetch, not the 30-day one", () => {
  // This is the whole bug: `sw` is the 30-day array.
  assert.match(fn, /const completedDates = \(\(streakRes\.data/);
  assert.doesNotMatch(
    fn,
    /const completedDates = Array\.from\(new Set\(sw\./,
    "the streak is being counted off the 30-day adherence array again — capped at 30",
  );
});

test("the 30-day adherence numbers still come from the 30-day fetch", () => {
  // The fix must not have widened these: "last 30 days X/Y" has to mean 30.
  assert.match(fn, /const total30 = sw\.length;/);
  assert.match(fn, /const done30 = sw\.filter/);
  assert.match(fn, /\.gte\("scheduled_date", win30\)/);
});

test("the wide query asks only for completed days", () => {
  // It exists to walk backwards through completions. Pulling every row for a
  // year to filter in JS would be the same answer at many times the cost.
  // Anchored on the wide fetch's own gte, walking BACK only as far as the
  // previous `db` — a window that reaches into the adherence fetch above would
  // be satisfied by that query's filters instead of this one's.
  const at = fn.indexOf('.gte("scheduled_date", winStreak)');
  assert.ok(at > 0, "the wide fetch is gone");
  const start = fn.lastIndexOf('.from("scheduled_workouts")', at);
  const block = fn.slice(start, at + 120);
  assert.match(block, /\.eq\("status", "completed"\)/, "the wide fetch is not narrowed to completed rows");
  assert.match(block, /\.is\("deleted_at", null\)/, "deleted sessions would extend a streak that was actually broken");
  // And BOTH scheduled_workouts fetches must still exclude deleted rows.
  const guarded = (fn.match(/\.is\("deleted_at", null\)/g) || []).length;
  assert.equal(guarded, 2, `${guarded} of the 2 scheduled_workouts fetches exclude deleted sessions`);
});

test("the streak still anchors on today-or-yesterday", () => {
  // Without it a real run reads as 0 every morning until the day's session is
  // logged — which is exactly when someone opens the app to look at it.
  assert.match(fn, /if \(!setD\.has\(cursor\)\) cursor = ctShiftDays\(cursor, -1\);/);
});
