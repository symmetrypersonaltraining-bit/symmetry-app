import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "IT GOES BACK AND IT IS NOT LOGGED."
 *
 * Dustin, 2026-08-04: "workout logger keeps not logging in my app. after I hit
 * finish it goes back n is not logged. happened multiple times today."
 *
 * Three defects, and they compound.
 *
 * 1. completeWorkout had NO error handling. Not a swallowed catch — no catch at
 *    all, just try/finally, plus a bare `catch {}` around the schedule update.
 *    Any failure rejected into nowhere: no message, no retry prompt, the button
 *    went from "Saving…" straight back to "Complete ✓". From the user's side
 *    that is identical to nothing happening, which is precisely how it was
 *    reported — and why it could never be diagnosed from the app.
 *
 * 2. It marked ONE scheduled_workouts row complete (`.order("id").limit(1)`).
 *    The home screen decides "is this logged" purely from
 *    scheduled_workouts.status. Dustin had two rows for the same session on
 *    4 Aug — "Peak — Arms A + Mobility (Tue Aug 4)" existed under both his
 *    Personal Workouts and the Peak Week program. Finish the workout, go back,
 *    and the twin card still says it isn't done. Ordering by UUID also meant
 *    WHICH one got marked was arbitrary.
 *
 * 3. Both server lookups used .maybeSingle(), which in PostgREST does not mean
 *    "one of them" — it ERRORS when more than one row matches. Both errors were
 *    discarded. So two logs for one day meant the logger opened blank, showed
 *    none of the sets already saved, and created a third. Every reopen added
 *    another one.
 *
 * This is the same .maybeSingle() trap that broke program lookups for 25 of 35
 * clients. It fails silently every time, which is what earns it a test.
 */

const LOGGER = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);
const PAGE = readFileSync(join(process.cwd(), "src/app/(app)/workout/[dayId]/page.tsx"), "utf8");
const CODE = LOGGER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function completeBody(): string {
  const start = CODE.indexOf("async function completeWorkout()");
  assert.notEqual(start, -1, "completeWorkout must exist");
  const end = CODE.indexOf("\n  }", CODE.indexOf("finally { setSaving(false); }", start));
  return CODE.slice(start, end);
}

test("finishing a workout cannot fail silently", () => {
  const body = completeBody();
  assert.match(body, /catch \(e\)/, "completeWorkout must catch — a rejected promise is invisible to the user");
  assert.match(body, /setCompleteError\(/, "the failure has to reach the screen");
  assert.ok(
    !/\}\s*catch\s*\{\s*\}/.test(body),
    "an empty catch is how this bug lasted: the schedule update swallowed everything",
  );
});

test("every write in the finish path is checked", () => {
  const body = completeBody();
  // An unchecked update returns { error } and carries on perfectly happily,
  // leaving the calendar and the log disagreeing about whether it happened.
  for (const guard of ["if (logErr) throw logErr", "if (__swErr) throw __swErr", "if (__insErr) throw __insErr"]) {
    assert.ok(body.includes(guard), `missing check: ${guard}`);
  }
});

test("the error is visible on both places Finish exists", () => {
  // The session view has its own footer button and the day-card view has
  // another. A fix applied to one and missed on the other is the single most
  // repeated mistake in this file.
  const occurrences = [...CODE.matchAll(/completeError/g)].length;
  assert.ok(occurrences >= 6, `completeError should appear on both surfaces, saw ${occurrences}`);
  assert.match(CODE, /completeError \? "Try again/, "the button itself must show the failure");
});

test("finishing completes EVERY scheduled row for that day, not the first", () => {
  const body = completeBody();
  assert.match(body, /\.in\("id", __swIds\)/, "all matching rows, or a twin card still reads as not logged");
  assert.ok(
    !/\.eq\("scheduled_date", __today\)\s*\.order\("id"\)\s*\.limit\(1\)/.test(body),
    "limit(1) is the bug: it leaves the duplicate card saying the workout was never done",
  );
  assert.match(body, /\.is\("deleted_at", null\)/, "a removed session must not come back as completed");
});

test("the server never uses maybeSingle where two rows are possible", () => {
  // PostgREST's maybeSingle ERRORS on >1 row. Both of these can legitimately
  // match twice, and both discarded the error.
  const logLookup = PAGE_CODE.slice(
    PAGE_CODE.indexOf('.from("workout_logs")'),
    PAGE_CODE.indexOf('.from("scheduled_workouts")', PAGE_CODE.indexOf('.from("workout_logs")')),
  );
  assert.ok(!/maybeSingle/.test(logLookup), "today's-log lookup must tolerate more than one log");
  assert.match(logLookup, /\.limit\(1\)/);
  assert.match(logLookup, /\.order\("completed", \{ ascending: false \}\)/, "a finished log wins over an open one");
  assert.match(PAGE_CODE, /if \(existingLogErr\)/, "and the error must not be dropped on the floor");
});

test("the trainer's own client row is found by id, not by their name", () => {
  // .ilike("name", "%Dustin%").maybeSingle() — the day a client named Dustin
  // signs up, the trainer's own logger gets clientId = null and every write
  // fails. Which looks exactly like this bug.
  assert.ok(!/ilike\("name", "%Dustin%"\)/.test(PAGE_CODE), "never identify a person by a substring of their name");
  assert.match(PAGE_CODE, /\.eq\("auth_user_id", user\.id\)/);
});
