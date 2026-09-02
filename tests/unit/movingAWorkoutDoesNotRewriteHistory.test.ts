// ============================================================================
// MOVING A WORKOUT MOVES THE PLAN, NOT THE RECORD OF WHEN IT WAS TRAINED.
//
// Jenn Day, 1 Sep: "It didn't help. Still can't view previous weeks."
//
// She moved her completed 26 Aug session to 5 Sep. moveScheduledWorkout wrote
// the new date onto the workout_log as well, so a session she had actually
// trained — completed_at 2026-08-26 11:12 CT — claimed to have happened a week
// in the future. Last week showed a gap where a finished workout used to be,
// and she spent a day reporting it as the app being broken.
//
// Dustin, 1 Sep: "ive told you multiple times me n clients can move workouts
// period. why would we not have full control over moving them."
//
// Right — and the move is not the problem. Anyone can move anything anywhere,
// and nothing here restricts that. The bug was that a move also rewrote
// history. The schedule is a plan; the log is a record. They answer different
// questions and a scheduling decision does not get to change when someone
// trained.
//
// An UNFINISHED log still follows the move: it is a shell for work not yet
// done, so its date is part of the plan.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a move does not rewrite a finished session's date", () => {
  const mv = strip(read("src/lib/moveWorkout.ts"));

  it("reads whether the log is already completed", () => {
    assert.match(mv, /workout_logs\(completed/,
      "moveScheduledWorkout cannot tell a finished session from an unfinished one");
  });

  it("only writes log_date when the session is not finished", () => {
    assert.match(mv, /if \(logId && !completed\)/,
      "a completed log's date is still being rewritten by a move");
    // and the write is inside that guard, not somewhere else as well
    const writes = mv.match(/update\(\{ log_date/g) || [];
    assert.equal(writes.length, 1,
      `log_date is written in ${writes.length} places; there must be exactly one, behind the guard`);
  });

  it("does not restrict where a workout may be moved", () => {
    // The first attempt at this fix capped completed workouts at today. That
    // took control Dustin has repeatedly said he and his clients must have.
    // This asserts the restriction has not crept back into either surface.
    const sheet = strip(read("src/components/WorkoutDaySheet.tsx"));
    assert.ok(!/movingDone/.test(sheet),
      "the day sheet is limiting the move window for completed workouts again");
    assert.ok(!/status === "completed" && target > today/.test(sheet),
      "doMove is blocking forward moves of completed workouts again");
    assert.match(sheet, /i <= 56/,
      "the move wheel no longer offers the full forward window");
  });
});
