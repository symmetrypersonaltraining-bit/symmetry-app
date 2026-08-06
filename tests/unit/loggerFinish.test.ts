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

/**
 * "IT KEEPS COMPLETING MY CARDIO FOR TODAY INSTEAD."
 *
 * Madeleine Coker, 2026-08-06 06:35: "Trying to log my cardio for yesterday and
 * it keeps completing my cardio for today instead."
 *
 * Exactly what the data showed. She tapped the 5 Aug cardio card at 06:30 on
 * the 6th and the app:
 *
 *   - wrote the workout_log with log_date = 6 Aug
 *   - marked the 6th's cardio card completed
 *   - left the 5th's card still "scheduled"
 *
 * So her make-up vanished and a day she had not trained got credited. Doing it
 * again would keep re-closing today, which is why "it KEEPS completing".
 *
 * The logger had no idea which day it was logging. It asked the clock, in three
 * separate places — the log insert, the scheduled-row match, and the
 * existing-log lookup. The scheduled_workouts row it was opened from knows the
 * answer, and page.tsx was already reading that row and throwing the date away.
 *
 * One value, threaded through. A card from the past records against the day it
 * was FOR; a card from the future records against today, because that is when
 * the work actually happened.
 */
test("the logger knows which day it is logging, and does not ask the clock", () => {
  const page = PAGE_CODE;
  assert.match(page, /\.select\("day_id, scheduled_date"\)/, "the scheduled date must be read, not discarded");
  assert.match(
    page,
    /const sessionDate = scheduledDate && scheduledDate < today \? scheduledDate : today;/,
    "past card → its own date; future card → today",
  );
  assert.match(page, /sessionDate=\{sessionDate\}/, "and it has to reach the logger");
});

test("nothing in the finish path reads the clock any more", () => {
  // Three call sites each asked "what is today?" independently. That is the
  // same shape as every other bug in this file: one fact, computed in more than
  // one place, drifting apart.
  assert.match(CODE, /log_date: sessionDate,/, "the log row belongs to the session date");
  assert.match(CODE, /const __today = sessionDate;/, "so does the scheduled row it closes");
  assert.ok(
    !/toLocaleDateString\("en-CA"/.test(CODE),
    "the logger must not compute today for itself; sessionDate is the single answer",
  );
});

test("the page finds the log for THAT day, not 'today or later'", () => {
  // .gte("log_date", today) could never match yesterday's log, so a make-up
  // opened a blank screen and made a second row.
  assert.match(PAGE_CODE, /\.eq\("log_date", sessionDate\)/);
  assert.ok(!/\.gte\("log_date", today\)/.test(PAGE_CODE), "the old today-or-later window is back");
  assert.match(PAGE_CODE, /\.eq\("scheduled_date", sessionDate\)/);
});

/**
 * "VIOLATES FOREIGN KEY CONSTRAINT SCHEDULED_WORKOUTS_WORKOUT_LOG_ID_FKEY."
 *
 * Dustin, 2026-08-06, 11 exercises into Knee Stability P2 Day 2:
 * "Couldn't finish the workout: insert or update on table scheduled_workouts
 * violates foreign key constraint scheduled_workouts_workout_log_id_fkey.
 * Your sets are saved — tap Complete again."
 *
 * The sets were not saved, and tapping again could never work.
 *
 * ensureWorkoutLog short-circuited on any id it already held — including one
 * rehydrated from the localStorage draft, which is a claim about the database
 * and not a fact. The row was gone. What followed:
 *
 *   - the workout_logs UPDATE ran .eq("id", <dead id>), matched no rows, and
 *     PostgREST called that success
 *   - the scheduled_workouts write pointed at the same dead id and the foreign
 *     key caught it there
 *
 * So the error named a table that had nothing to do with the cause, two steps
 * downstream. And because the draft is re-read on every mount, "tap Complete
 * again" handed back the identical dead id — permanently stuck. set_logs
 * carries the same foreign key, so nothing was being written either.
 */
test("a resumed workout log id is verified before it is trusted", () => {
  assert.match(
    CODE,
    /const \{ data: alive \} = await supabase\s*\n?\s*\.from\("workout_logs"\)\.select\("id"\)\.eq\("id", workoutLogId\)\.maybeSingle\(\);/,
    "a draft-restored id must be checked against the database, not assumed live",
  );
  assert.ok(
    !/if \(workoutLogId\) return workoutLogId;/.test(CODE),
    "the bare short-circuit is back — that is the bug",
  );
});

test("a dead id is discarded and the session continues on a fresh log", () => {
  // Stranding the user mid-workout is not an acceptable answer either. The sets
  // are in component state and get written against the new row.
  assert.match(CODE, /setWorkoutLogId\(null\);\s*\n\s*__clearDraft\(\);/);
});

test("an update that matches no rows is treated as the failure it is", () => {
  // This is what let the real cause travel two steps before surfacing.
  assert.match(CODE, /\.eq\("id", logId\)\.select\("id"\)/);
  assert.match(CODE, /if \(!logRows \|\| !logRows\.length\) throw new Error\(/);
});
