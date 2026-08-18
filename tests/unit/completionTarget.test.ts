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
  dayFamilyIds,
  isWithinMakeupWindow,
  lineageRoot,
  MAKEUP_WINDOW_DAYS,
  type CompletionCandidate,
} from "../../src/lib/completionTarget.ts";
import { PULL_FORWARD_WINDOW_DAYS } from "../../src/lib/pullForward.ts";

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

// ─── the swap family: Hassan Kareem, 18 Aug ─────────────────────────────────
//
// "hassan has 2 workouts today, I logged one but 2nd one is showing."
//
// A swap at 13:38 forked the shared day f344828c into d89af543 (owner Hassan,
// swapped_from f344828c) and repointed today's scheduled row at the fork. The
// page had been rendered holding the ORIGINAL id, so `scheduledWorkoutId` came
// back null — the opened-row preference had nothing to prefer, and everything
// downstream matched on day_id and reached back to 11 August.

const SHARED = "f344828c";
const FORK = "d89af543";

test("a day forked by a swap resolves back to the shared day it came from", () => {
  const root = lineageRoot(FORK, [{ id: FORK, swapped_from_day_id: SHARED }]);
  assert.equal(root, SHARED);
});

test("a shared day is its own root", () => {
  assert.equal(lineageRoot(SHARED, [{ id: SHARED, swapped_from_day_id: null }]), SHARED);
});

test("opening the shared day still matches the fork today's row was moved to", () => {
  // This is Hassan's exact lookup. Without the family the today query returns
  // nothing and the make-up fallback credits 11 August.
  const ids = dayFamilyIds(SHARED, SHARED, [
    { id: SHARED, swapped_from_day_id: null },
    { id: FORK, swapped_from_day_id: SHARED },
  ]);
  assert.ok(ids.includes(FORK), "the fork is not treated as the same session — 11 August gets credited again");
  assert.ok(ids.includes(SHARED));
});

test("opening the fork still matches a row left on the shared day", () => {
  const ids = dayFamilyIds(FORK, SHARED, [
    { id: FORK, swapped_from_day_id: SHARED },
    { id: SHARED, swapped_from_day_id: null },
  ]);
  assert.ok(ids.includes(SHARED));
  assert.ok(ids.includes(FORK));
});

test("two clients' forks of the same shared day are siblings, not strangers", () => {
  const ids = dayFamilyIds(FORK, SHARED, [
    { id: FORK, swapped_from_day_id: SHARED },
    { id: "someone-else", swapped_from_day_id: SHARED },
  ]);
  assert.ok(ids.includes("someone-else"));
  // Sibling forks belong to other clients; the scheduled_workouts query is
  // still scoped by client_id, so this widens nothing across people.
});

test("an unrelated day is never pulled into the family", () => {
  const ids = dayFamilyIds(SHARED, SHARED, [
    { id: SHARED, swapped_from_day_id: null },
    { id: "different-session", swapped_from_day_id: "some-other-root" },
  ]);
  assert.deepEqual(ids, [SHARED], "completion would close a session the client did not do");
});

test("the root comes from the opened day, not whatever row came back first", () => {
  // `days` returns rows in no particular order, and a sibling fork belonging to
  // another client can arrive ahead of this one. Reading swapped_from off the
  // first row would inherit a stranger's lineage.
  const root = lineageRoot(FORK, [
    { id: "someone-elses-fork", swapped_from_day_id: "a-different-session" },
    { id: FORK, swapped_from_day_id: SHARED },
  ]);
  assert.equal(root, SHARED);
});

test("the opened day is in the family even when `days` returned nothing for it", () => {
  // The fork is readable, its root may not be, or the read may simply fail.
  // Dropping the day the client is standing on sends the completion looking for
  // a session it never opened.
  const ids = dayFamilyIds(FORK, SHARED, []);
  assert.ok(ids.includes(FORK), "the day being logged fell out of its own family");
  assert.ok(ids.includes(SHARED));
});

test("the opened day survives being unable to read `days` at all", () => {
  // RLS, a dropped request, anything. An empty family would become `IN ()`,
  // match nothing, and send every completion straight to the make-up fallback —
  // strictly worse than the bug being fixed.
  assert.deepEqual(dayFamilyIds(SHARED, SHARED, []), [SHARED]);
  assert.equal(lineageRoot(SHARED, []), SHARED);
});

test("the family has no duplicates", () => {
  const ids = dayFamilyIds(FORK, SHARED, [
    { id: FORK, swapped_from_day_id: SHARED },
    { id: FORK, swapped_from_day_id: SHARED },
    { id: SHARED, swapped_from_day_id: null },
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test("completeWorkout matches the whole swap family, not one day id", () => {
  const i = LOGGER.indexOf("async function completeWorkout");
  const after = i + "async function completeWorkout".length;
  const rest = LOGGER.slice(after);
  const end = rest.search(/\n {2}(?:async )?function |\n {2}const \w+ = /);
  const body = LOGGER.slice(i, end === -1 ? LOGGER.length : after + end);

  assert.match(body, /const __dayIds = dayFamilyIds\(day\.id, __root, __kin\)/,
    "the family is not computed — a swap mid-session sends the credit to another week again");
  assert.match(body, /const __root = lineageRoot\(day\.id, __kin\)/,
    "the lineage root is not resolved, so opening a fork cannot find the shared day");
  // The three lookups that used to key off day.id. Any one of them left on an
  // equality match is a door back to Hassan's 11 August credit.
  assert.equal((body.match(/\.in\("day_id", __dayIds\)/g) || []).length, 3,
    "a scheduled_workouts lookup still matches a single day_id");
  assert.doesNotMatch(body, /\.eq\("day_id", day\.id\)/,
    "a lookup is still matching one day id");
  assert.match(body, /findSlotToPullForward\(\(__futureRows as SlotCandidate\[\]\) \|\| \[\], __dayIds, __today\)/,
    "pull-forward still matches one day id, so a forked session done early inserts a second card");
  // No filter-string concatenation in the completion path.
  assert.doesNotMatch(body, /\.or\(`/,
    "a PostgREST filter is being built by string concatenation from a route param");
});

// ─── how far back the fallback may reach ────────────────────────────────────
//
// Found while confirming Hassan's repair. Real rows, all of them:
//   Todd Prine    scheduled 2026-06-23  logged 2026-08-14  — 52 days
//   Jennifer Day  scheduled 2026-06-22  logged 2026-08-03  — 42 days
//   Stacie Weever scheduled 2026-06-23  logged 2026-08-04  — 42 days

test("a session done today does not close one from six weeks ago", () => {
  assert.equal(isWithinMakeupWindow("2026-06-23", "2026-08-14"), false, "Todd Prine's 23 June");
  assert.equal(isWithinMakeupWindow("2026-06-22", "2026-08-03"), false, "Jennifer Day's 22 June");
});

test("yesterday's missed session is still a make-up", () => {
  assert.equal(isWithinMakeupWindow("2026-08-17", "2026-08-18"), true);
  assert.equal(isWithinMakeupWindow("2026-08-13", "2026-08-18"), true);
});

test("the window is inclusive at exactly a week, and shut past it", () => {
  assert.equal(isWithinMakeupWindow("2026-08-11", "2026-08-18"), true);
  assert.equal(isWithinMakeupWindow("2026-08-10", "2026-08-18"), false);
});

test("the same day is within the window", () => {
  assert.equal(isWithinMakeupWindow("2026-08-18", "2026-08-18"), true);
});

test("a FUTURE date is not a make-up", () => {
  // The pull-forward path handles doing a session early, and it MOVES the row
  // rather than completing it in place. Letting this branch claim it too would
  // credit a session on a day it was not done.
  assert.equal(isWithinMakeupWindow("2026-08-19", "2026-08-18"), false);
});

test("the make-up window matches the pull-forward window", () => {
  // Same judgement pointed in opposite directions. If one moves, both should,
  // and a silent divergence would make "early" and "late" behave differently
  // for no reason anyone could explain to a client.
  assert.equal(MAKEUP_WINDOW_DAYS, PULL_FORWARD_WINDOW_DAYS);
});

test("deliberately opening an old card is NOT bounded", () => {
  // Madeleine Coker, 6 Aug: "Trying to log my cardio for yesterday and it keeps
  // completing my cardio for today instead." Opening a specific old card takes
  // the opened-row branch, which has no distance limit — the bound is only on
  // the fallback, which fires when nothing was opened at all.
  const choice = chooseCompletionTargets(
    row({ id: "very-old", scheduled_date: "2026-06-23" }), [], TODAY);
  assert.deepEqual(choice.ids, ["very-old"]);
  assert.equal(choice.crossesDate, true);
});

test("completeWorkout bounds the reach-back", () => {
  const i = LOGGER.indexOf("async function completeWorkout");
  const after = i + "async function completeWorkout".length;
  const rest = LOGGER.slice(after);
  const end = rest.search(/\n {2}(?:async )?function |\n {2}const \w+ = /);
  const body = LOGGER.slice(i, end === -1 ? LOGGER.length : after + end);
  assert.match(body, /if \(__past && isWithinMakeupWindow\(__past\.scheduled_date, __today\)\) __swIds = \[__past\.id\];/,
    "the fallback can walk back to any date again — Todd Prine's 23 June");
  assert.match(body, /\.select\("id, scheduled_date"\)/,
    "the fallback stopped selecting the date it is about to be judged on");
});
