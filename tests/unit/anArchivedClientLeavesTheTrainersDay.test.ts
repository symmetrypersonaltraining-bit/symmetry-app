import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AN ARCHIVED CLIENT LEAVES THE TRAINER'S DAY.
 *
 * Dustin, 10 Sep, 7:13am, with three names on Today's Sessions: *"I need to
 * know why Tyler, Troy and Christine are in my schedule. Troy n christine are
 * archived."*
 *
 * Christine was archived on 31 Aug. Archiving sets `clients.archived_at` and
 * nothing else — her programme kept its 35 future rows, nine of them flagged
 * with-you, and the trainer home read the SCHEDULE and never the roster. So she
 * sat on his day every Wednesday and Thursday for as long as her programme ran.
 * Bobbie Page and Robert Miller were the same shape, one flag away from
 * surfacing.
 *
 * The home page already fetches the active roster (`clients`, archived_at is
 * null). This pins that every schedule-derived read on the trainer home is
 * gated on it: the appointment calendar, today's workouts, the with-you
 * fallback, and the programmed-workout calendar layer.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PAGE = code(read("src/app/(app)/home/page.tsx"));
const TRAINER = PAGE.slice(
  PAGE.indexOf("if (isTrainer && !isInClientMode) {"),
  PAGE.indexOf("<TrainerHome"),
);

test("the active roster is turned into the filter once", () => {
  assert.match(TRAINER, /const activeIds = new Set\(/, "activeIds must be built from the roster read");
  assert.match(TRAINER, /\(clients \|\| \[\]\)/, "and from `clients`, which is the archived_at-is-null read");
});

test("every schedule-derived loop on the trainer home is gated on it", () => {
  const loops: [string, RegExp][] = [
    ["appointments",         /for \(const a of apptRows \|\| \[\]\) \{[\s\S]{0,120}activeIds\.has\(/],
    ["today's workouts",     /for \(const w of todayWorkoutRows \|\| \[\]\) \{\s*const row = w as any;\s*if \(!row\.client_id \|\| !activeIds\.has\(row\.client_id\)\) continue;/],
    ["the with-you fallback", /if \(row\.supervised !== true \|\| !row\.client_id\) continue;\s*if \(!activeIds\.has\(row\.client_id\)\) continue;/],
    ["the calendar layer",   /for \(const w of workoutRows \|\| \[\]\) \{[\s\S]{0,120}activeIds\.has\(/],
  ];
  for (const [name, re] of loops) {
    assert.match(TRAINER, re, `${name} is not gated on the active roster — an archived client's rows reach the screen`);
  }
});

test("the gate is the roster, not a second query", () => {
  // One read of clients, already there. A second `.from("clients")` here would
  // be a second definition of "active" that could drift from the first.
  const reads = TRAINER.match(/\.from\("clients"\)/g) || [];
  assert.equal(reads.length, 1, "exactly one clients read in the trainer branch");
});
