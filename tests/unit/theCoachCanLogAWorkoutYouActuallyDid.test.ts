// ============================================================================
// THE COACH CAN LOG A WORKOUT YOU ACTUALLY DID.
//
// Dustin, 13 Sep, 3:12pm Central: *"log a 3 mile hike for my cardio today"* —
// answered "Done.", wrote nothing, found three hours later by opening the
// Workout tab and seeing "Rest day".
//
// The previous commit stopped it claiming the write. This one gives it the
// write, because the honest version of that turn — "I can't do that" — is still
// a coach that cannot do the most ordinary thing a client reports.
//
// WHY NONE OF THE NINE EXISTING TOOLS COULD:
//
//   i_did_do_that    needs a SCHEDULED session to mark done. 13 Sep was a rest
//                    day with nothing on it.
//   add_my_workout   needs a day_id already in their library. A hike is not in
//                    anyone's library.
//   move / swap      need something to move.
//
// So `toolsUsed` came back 0 and the whole workout pass was discarded by
// design — working exactly as built, with a hole in the middle of it.
//
// THE WRITE IS NOT NEW. "+ Add workout" has done this since 14 Aug, through
// /api/workout-manual: a client-owned day, a completed workout_log carrying the
// client's own words, and a scheduled_workouts row. That write now lives in
// lib/workouts/manualWorkout.ts and BOTH callers use it. A second copy is how
// offplan_workout_logs happened — a table nothing on the schedule reads, which
// swallowed Todd Prine's run and told him it was saved.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ACTIONS = read("src/lib/ai/clientActions.ts");
const LIB = read("src/lib/workouts/manualWorkout.ts");
const ROUTE = read("src/app/api/workout-manual/route.ts");
const ACT = read("src/app/api/nutrition-ai/act/route.ts");

describe("the coach can log a workout you actually did", () => {
  it("the tool exists and says which of the three it is", () => {
    assert.match(ACTIONS, /name: "log_a_workout_i_did"/, "the tool is gone");
    const at = ACTIONS.indexOf('name: "log_a_workout_i_did"');
    const desc = ACTIONS.slice(at, at + 1600);
    // The failure this replaces was the model picking nothing. The next failure
    // would be it picking the wrong one, so the description has to draw the line.
    assert.match(desc, /i_did_do_that/, "must say when to use i_did_do_that instead");
    assert.match(desc, /add_my_workout/, "…and add_my_workout");
    assert.match(desc, /hike|walk|run/i, "name the cases, so it is recognisable");
  });

  it("it writes through the SHARED function, not a second copy", () => {
    assert.match(ACTIONS, /createManualWorkout/, "the tool must call the shared write");
    assert.match(LIB, /export async function createManualWorkout/, "which must be exported from the lib");
    assert.match(ROUTE, /createManualWorkout\(/, "and the route must use the same one");

    // The specific regression: a copy of the insert living in THIS handler.
    // Scoped to it deliberately — add_my_workout has its own scheduled_workouts
    // insert and always has, which is a different tool doing a different job.
    const at = ACTIONS.indexOf('if (name === "log_a_workout_i_did")');
    const body = ACTIONS.slice(at, at + 1400);
    assert.doesNotMatch(
      body,
      /\.from\("(?:scheduled_workouts|workout_logs|days|sections)"\)/,
      "this handler is writing the workout tables itself — that is the second copy this avoids",
    );
  });

  it("a session cannot already have been done on a day that has not happened", () => {
    const at = ACTIONS.indexOf('if (name === "log_a_workout_i_did")');
    assert.ok(at > -1, "the handler is missing");
    const body = ACTIONS.slice(at, at + 2600);
    assert.match(body, /date > today/, "the future-date guard is gone");
    assert.match(body, /markDone: true/, "a session they already did is logged as completed");
  });

  // The original version of the test above also asserted `exercises: []` — that
  // a typed session carries no movements and its note is the whole record. That
  // was true for about two hours. Dustin, the same evening: *"when ai writes a
  // workout we tell it, app shoukd build that workout in the clients personal
  // workout library to be used again."* An empty day cannot be that — it is
  // filtered out of library-search and opens an empty logger. The rule that
  // replaced it, and why, is in anAiWrittenWorkoutGoesInTheLibrary.test.ts.

  it("their own words are kept, because for a typed session that IS the workout", () => {
    const at = ACTIONS.indexOf('if (name === "log_a_workout_i_did")');
    const body = ACTIONS.slice(at, at + 1400);
    assert.match(body, /note/, "the note must be passed through");
    // Falling back to the title beats writing null: a bare title on the
    // calendar is what the route's own comment calls out as the failure.
    assert.match(body, /\|\| title/, "an empty note must fall back to the title, never to nothing");
  });

  it("the tool pass is TOLD that reporting a session is a tool call", () => {
    // Item E in the act route: adding look_up_movement without widening this
    // sentence left the movement path exactly as it was. The sentence lists
    // QUESTIONS, and "I did a hike" is not a question — which is precisely why
    // no tool ran on 13 Sep.
    assert.match(ACT, /log_a_workout_i_did/, "the prompt must name the tool");
    assert.match(
      ACT,
      /TELLING YOU THEY DID SOMETHING IS A TOOL CALL/,
      "without this the model keeps reading the turn as chat and nothing is written",
    );
    // Matched on one line: the prompt is a concatenation of template literals,
    // so the sentence is split across a `+` and a needle spanning the break
    // would fail for a reason that has nothing to do with the rule.
    assert.match(ACT, /Never confirm a session in words/i,
      "the model must be told not to say it logged something without calling a tool");
  });

  it("the route kept its request validation rather than losing it in the move", () => {
    // The extraction must not have quietly dropped the guards that live at the
    // HTTP edge — they are what stop a direct POST doing what the picker cannot.
    assert.match(ROUTE, /body\.markDone && date > CT_TODAY\(\)/, "the future-date guard left the route");
    assert.match(ROUTE, /if \(!exercises\.length && !\(body\.markDone && note\)\)/, "the exercise guard left the route");
    assert.match(ROUTE, /resolveAiScope/, "the ownership check left the route");
  });
});
