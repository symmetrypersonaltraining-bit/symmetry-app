import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG A — CORRECTING A LOGGED ACTIVITY LOGGED IT TWICE.
 *
 * Jennifer Day, 30 Jul: two complete days + scheduled_workouts + workout_logs
 * triples, 52 SECONDS apart, both marked completed. "Baby Stroller Walk" 45 min
 * and "Baby Stroller Walk" 120 min. She logged 45, saw it was wrong, and said
 * 120. Her 30 Jul reads 165 minutes across two sessions. She took one walk.
 *
 * The cause is that there is no edit endpoint and there never was. Correcting an
 * activity means re-running /api/workout-ai, and that route only ever inserted.
 * So every correction anyone has made since the feature shipped is sitting in
 * the data as an extra session — inflating adherence, volume and streaks, all
 * of which read workout_logs.
 *
 * THE DANGEROUS DIRECTION IS THE PERMISSIVE ONE. A rule that treats too much as
 * a correction silently deletes a real session — a morning walk overwritten by
 * an evening bike ride, with no error and nothing to notice. That is strictly
 * worse than the duplicate it replaces, because a duplicate is visible and
 * recoverable and a swallowed session is neither. Every assertion here is about
 * keeping the match narrow.
 */

const SRC = readFileSync(join(process.cwd(), "src/app/api/workout-ai/route.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("only an activity can ever reuse a day", () => {
  // `replace` and `equipment` legitimately create a new day every time — they
  // are new workouts, not corrections to one.
  assert.match(CODE, /if \(mode === "activity"\) \{[\s\S]{0,400}?from\("days"\)/,
    "the reuse lookup is no longer gated on mode === 'activity'");
});

test("reuse requires the SAME DAY as well as the same client", () => {
  // Yesterday's walk is not a draft of today's. Without the scheduled_date
  // check, logging the same activity two days running would overwrite the
  // first day's session.
  assert.match(
    CODE,
    /\.eq\("scheduled_date", today\)[\s\S]{0,120}\.is\("deleted_at", null\)/,
    "the reuse candidate is no longer restricted to a row scheduled for today",
  );
});

test("reuse needs a same-name match OR a very recent one, and nothing looser", () => {
  // Two signals, either sufficient:
  //   sameName — "I said 45, I meant 120"
  //   justNow  — Dustin's 6 Aug correction changed the movement NAME too
  //              (Outdoor Walk → Walk (2 Miles)), so a title match alone
  //              would have missed it.
  assert.match(CODE, /const sameName = norm\(p\.label \|\| ""\) === norm\(workout\.title\)/);
  assert.match(CODE, /const justNow = Date\.parse\(p\.created_at\) >= cutoff/);
  assert.match(CODE, /if \(sameName \|\| justNow\)/);
  // The window has to stay short. An hour would start catching genuinely
  // separate sessions.
  const m = CODE.match(/const EDIT_WINDOW_MIN = (\d+)/);
  assert.ok(m, "the edit window is no longer a named constant");
  const mins = Number(m![1]);
  assert.ok(mins > 0 && mins <= 30, `edit window is ${mins} min — over 30 starts swallowing real sessions`);
});

test("a correction UPDATES the log, never adds a second one", () => {
  // This is the half that corrupts the numbers. Streaks and session counts read
  // workout_logs, so a duplicate row is a session the client never did,
  // counted forever.
  assert.match(CODE, /if \(existingLogId\) \{[\s\S]{0,400}?\.from\("workout_logs"\)\s*\.update\(/,
    "a reused day inserts a second workout_logs row again");
  assert.match(CODE, /if \(reusedDayId\) \{[\s\S]{0,300}?from\("scheduled_workouts"\)\s*\.update\(/,
    "a reused day inserts a second scheduled_workouts row again");
});

test("the reuse lookup can never lose a client's session by throwing", () => {
  // Worst case on failure must be the OLD behaviour — a duplicate, which is
  // visible and fixable. An exception escaping here would drop the log
  // entirely, which is not.
  // Anchored on the reuse block itself. Slicing to the next `try {` finds the
  // lookup's OWN try, not the persist block's, so the window is taken from the
  // guard to the assignment that closes the search instead.
  const at = CODE.indexOf('if (mode === "activity")');
  const end = CODE.indexOf("reusedDayId = p.id", at);
  assert.ok(at !== -1 && end > at, "the reuse block has moved — re-anchor this check");
  const block = CODE.slice(at, CODE.indexOf("}", end + 400));
  assert.match(block, /catch \{/, "the de-duplication lookup is no longer wrapped");
});

test("rewriting a reused day cannot orphan logged sets", () => {
  // The rewrite deletes sections, which cascade to prescribed_exercises, which
  // set_logs point at. Safe today only because activity days carry no set_logs
  // — verified as zero across every ai_activity day in the database. If
  // activities ever gain per-set logging this has to change, so the check is
  // pinned to the reason rather than the behaviour.
  assert.match(
    CODE,
    /await admin\.from\("sections"\)\.delete\(\)\.eq\("day_id", dayIdNew\)/,
    "the in-place rewrite changed shape — re-check that no set_logs hang off an activity day",
  );
  assert.ok(
    !/\.from\("set_logs"\)\s*\.delete\(/.test(CODE),
    "this route now deletes set_logs — logged work must never be removed by an edit",
  );
});
