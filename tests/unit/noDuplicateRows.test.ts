import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE DUPLICATE-ROW BUG, AND WHY DELETING ROWS NEVER FIXED IT.
 *
 * Dustin, 2026-08-13: "id like you to figure out why we keep getting these
 * duplicated rows whatever that is and fix the damn problem bc it seems to be a
 * very consistent problem throughout the app in general."
 *
 * It had been "fixed" twice by deleting rows, and returned within a day both
 * times. Sweeping every table that could hold duplicates gave a perfect
 * correlation:
 *
 *   metrics             HAS a unique index  →   0 duplicates
 *   scheduled_workouts  HAS a unique index  →   0 duplicates
 *   days                NO unique index     → 109 extra rows
 *
 * Every table the DATABASE protects is clean. Every table left to the
 * discipline of whoever writes the insert is not — and those inserts get
 * written ad hoc, by different sessions, weeks apart. The fix is therefore a
 * constraint, not a cleanup, and this file exists to stop the constraint being
 * quietly dropped by someone whose migration it inconveniences.
 */

const MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20260813_days_uniqueness.sql"),
  "utf8",
);
const SQL = MIG.replace(/^\s*--.*$/gm, "");

test("days carries a uniqueness constraint at all", () => {
  assert.match(
    SQL,
    /create unique index if not exists uq_days_no_identical_twin\s+on public\.days \(client_owner_id, phase_id, label, position\)/,
    "the days uniqueness index is gone — the duplicate bug is back the moment anyone loops a build",
  );
});

test("NULLS NOT DISTINCT is present, because without it the index does nothing", () => {
  // The half that makes it work at all. Postgres treats every NULL as distinct
  // in a unique index by default, so a plain index would ignore library days
  // entirely — and those have client_owner_id NULL, which is exactly the set a
  // bulk build duplicates.
  //
  // Not hypothetical: workout_logs has had `uq_workout_log_one_completed ON
  // (client_id, day_id, log_date)` for months. It looks correct. It has never
  // fired on the rows that matter, because their day_id is NULL.
  assert.match(
    SQL,
    /nulls not distinct/i,
    "NULLS NOT DISTINCT was dropped — the index still exists and now silently does nothing for library days",
  );
});

test("the key is the one that was measured, not the one that looks tidier", () => {
  // (phase_id, position) is the obvious narrower key and it is wrong: checked
  // against live data it flags 68 groups and 201 perfectly legitimate rows.
  // The chosen key flagged exactly the 9 genuine duplicate groups.
  const idx = SQL.slice(SQL.indexOf("uq_days_no_identical_twin"));
  assert.ok(
    idx.includes("client_owner_id") && idx.includes("label"),
    "the index key narrowed to something that will reject legitimate rows",
  );
});

test("workout_logs is NOT given the same treatment", () => {
  // The trap. workout_logs showed 52 "duplicate" groups against days' 9, so it
  // reads as the bigger problem. It is not a problem at all.
  //
  // Robert Miller, 2024-08-31, four rows on one date with day_id NULL:
  //   Stage 1 Elliptical 33min · Cutting Shoulders and Arms 4min ·
  //   Cutting Back 48min · Stage 1 Stairmaster 31min
  //
  // He trained four times. Every one of the 52 groups has distinct notes and
  // durations. Adding the matching constraint would delete three of his four
  // sessions, and it would look like tidying up.
  assert.ok(
    !/create unique index[^;]*on public\.workout_logs[^;]*nulls not distinct/is.test(MIG),
    "a NULL-covering unique index was added to workout_logs — that deletes real multi-session days",
  );
});

test("the correct build pattern is written down next to the constraint", () => {
  // The constraint stops the bug; the pattern stops the next person hitting it
  // and wondering why their insert fails. One template, many occurrences.
  assert.match(MIG, /insert into days[\s\S]{0,200}?ONCE/i, "the correct pattern was removed from the migration");
  assert.match(MIG, /insert into scheduled_workouts[\s\S]{0,200}?per date/i);
  assert.match(MIG, /The day is the TEMPLATE/i, "the one-template-many-occurrences note is gone");
});
