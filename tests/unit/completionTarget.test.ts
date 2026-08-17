// Finishing a workout must credit the session you actually opened.
//
// Dustin, 17 Aug: "I logged both workouts today..." — screenshot showing both
// still on Start and the week at 0%. His workout had closed the session dated
// 10 AUGUST and left today's open, because the day was forked at 17:02 while he
// was mid-session and completeWorkout matched on `day_id`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chooseCompletionTargets,
  completionVerdict,
  type CompletionCandidate,
} from "../../src/lib/completionTarget.ts";

const LOGGER = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

const TODAY = "2026-08-17";
const SHARED_DAY = "27396d71";   // what the logger loaded at 16:15
const FORKED_DAY = "2669cd97";   // what the row was repointed to at 17:02

const row = (o: Partial<CompletionCandidate> & { id: string }): CompletionCandidate => ({
  day_id: SHARED_DAY,
  scheduled_date: TODAY,
  status: "scheduled",
  deleted_at: null,
  ...o,
});

// ─── his actual session ─────────────────────────────────────────────────────

test("a fork mid-session does not send the credit to last Monday", () => {
  // The opened row is 938635a8. At 17:02 its day_id became the fork, so a
  // day_id lookup finds NOTHING for today — which is exactly what happened.
  const opened = row({ id: "938635a8", day_id: FORKED_DAY });
  const byDayId: CompletionCandidate[] = []; // the logger still holds SHARED_DAY

  const choice = chooseCompletionTargets(opened, byDayId, TODAY);
  assert.deepEqual(choice.ids, ["938635a8"]);
  assert.equal(choice.source, "opened-row");
  assert.equal(choice.crossesDate, false, "today's session must be credited to today");
});

test("without the opened row it would have fallen through — the old behaviour", () => {
  // Same inputs, opened row unavailable: nothing today, so nothing is completed
  // and the caller inserts. It must NOT reach back to an earlier date on its own.
  const choice = chooseCompletionTargets(null, [], TODAY);
  assert.equal(choice.source, "none");
  assert.deepEqual(choice.ids, []);
});

// ─── the opened row wins, and when it must not ──────────────────────────────

test("the opened row is preferred over a day_id match", () => {
  const opened = row({ id: "opened" });
  const choice = chooseCompletionTargets(opened, [row({ id: "other" })], TODAY);
  assert.deepEqual(choice.ids, ["opened"],
    "a day_id match beat the row the client actually opened");
});

test("a soft-deleted opened row is not resurrected", () => {
  const opened = row({ id: "gone", deleted_at: "2026-08-17T14:10:04Z" });
  const choice = chooseCompletionTargets(opened, [row({ id: "live" })], TODAY);
  assert.deepEqual(choice.ids, ["live"]);
  assert.equal(choice.source, "today");
});

test("an already-completed opened row falls through rather than double-counting", () => {
  const opened = row({ id: "done", status: "completed" });
  const choice = chooseCompletionTargets(opened, [row({ id: "live" })], TODAY);
  assert.deepEqual(choice.ids, ["live"]);
});

test("a make-up is flagged as crossing dates rather than done silently", () => {
  // Opening last Thursday's missed session and finishing it today is real and
  // stays supported — but the caller is told, so it can never be mistaken for
  // the fork bug again.
  const opened = row({ id: "missed", scheduled_date: "2026-08-13" });
  const choice = chooseCompletionTargets(opened, [], TODAY);
  assert.deepEqual(choice.ids, ["missed"]);
  assert.equal(choice.crossesDate, true);
});

// ─── twins ──────────────────────────────────────────────────────────────────

test("two rows for the same session today are BOTH completed", () => {
  // Dustin had two identical "Peak — Arms A" cards on 4 Aug. Completing one
  // leaves the other saying "not done" on the home screen.
  const choice = chooseCompletionTargets(null, [row({ id: "a" }), row({ id: "b" })], TODAY);
  assert.deepEqual(choice.ids.sort(), ["a", "b"]);
  assert.equal(choice.source, "today");
});

test("rows on another date are not swept in by the today branch", () => {
  const choice = chooseCompletionTargets(
    null,
    [row({ id: "today" }), row({ id: "last-week", scheduled_date: "2026-08-10" })],
    TODAY,
  );
  assert.deepEqual(choice.ids, ["today"], "10 August was credited again");
});

test("a soft-deleted row today is skipped", () => {
  const choice = chooseCompletionTargets(
    null,
    [row({ id: "removed", deleted_at: "2026-08-17T14:10:04Z" }), row({ id: "live" })],
    TODAY,
  );
  assert.deepEqual(choice.ids, ["live"]);
});

// ─── the write has to prove it landed ───────────────────────────────────────

test("a completion that changed nothing must not read as success", () => {
  const v = completionVerdict(["a"], []);
  assert.ok(v, "zero rows changed is not an error in PostgREST — it has to speak up");
  assert.match(v!, /not done/);
});

test("a partial completion still speaks up", () => {
  const v = completionVerdict(["a", "b"], ["a"]);
  assert.ok(v, "one of two left open is a home screen contradicting itself");
  assert.match(v!, /part of today/);
});

test("everything changed is the only silent case", () => {
  assert.equal(completionVerdict(["a", "b"], ["a", "b"]), null);
  assert.equal(completionVerdict([], []), null);
});

test("ids returned that were never expected do not mask a missed row", () => {
  assert.ok(completionVerdict(["a", "b"], ["a", "somebody-else"]),
    "a count check alone would pass this; identity is what matters");
});

// ─── it has to actually be wired in ─────────────────────────────────────────

test("completeWorkout uses the row it was opened from", () => {
  // Bound at the next declaration, NOT at a magic character count. Two guards
  // were fixed for exactly this earlier today: adding comments pushed a marker
  // past a fixed slice and the assertion failed on correct code — and the same
  // brittleness passes a real regression whenever the window clips the marker.
  const i = LOGGER.indexOf("async function completeWorkout");
  assert.ok(i > 0, "completeWorkout is gone");
  const after = i + "async function completeWorkout".length;
  const rest = LOGGER.slice(after);
  const end = rest.search(/\n {2}(?:async )?function |\n {2}const \w+ = /);
  const body = LOGGER.slice(i, end === -1 ? LOGGER.length : after + end);
  assert.match(body, /chooseCompletionTargets\(/,
    "completeWorkout picks its target by day_id again — a fork mid-session will credit the wrong date");
  // Naming `scheduledWorkoutId` is not the same as USING it. The mutation
  // harness proved that: blanking `__opened` to null, and re-deriving `__swIds`
  // from the day_id lookup, both left the suite green while restoring exactly
  // the behaviour that credited 10 August. Assert the wiring, not the mention.
  assert.match(body, /\.eq\("id", scheduledWorkoutId\)/,
    "the opened session is never fetched, so its row cannot be preferred");
  assert.match(body, /const __opened = \(\(__openedRows as CompletionCandidate\[\] \| null\) \?\? \[\]\)\[0\] \?\? null;/,
    "__opened no longer comes from that fetch — the opened row is being discarded");
  assert.match(body, /chooseCompletionTargets\(\s*__opened,/,
    "the opened row is not passed to the chooser, so day_id wins again");
  assert.match(body, /let __swIds: string\[\] = __choice\.ids;/,
    "the targets are taken from the day_id lookup again rather than the chooser");
  // Anchored to the schedule update. The first `.select("id")` in this function
  // belongs to the workout_logs write, so a loose search passes on a completion
  // that checks nothing — the guard would have been testing the wrong statement.
  const upd = body.indexOf('.in("id", __swIds)');
  assert.ok(upd > 0, "the schedule update no longer targets the chosen rows");
  const verdict = body.indexOf("completionVerdict(", upd);
  assert.ok(verdict > upd, "the completion's result is never checked");
  assert.match(body.slice(upd, verdict), /\.select\("id"\)/,
    "the completion does not ask which rows it actually changed");
});
