// uq_scheduled_workout_one_per_day went live 11 Aug 2026 (Dustin: "shouldn't
// be doing same session twice"). A constraint doing its job must never reach a
// user as raw Postgres — that is precisely what happened to Lauren hours
// earlier, when uq_workout_log_one_completed protected her saved workout and
// she was shown the violation text as a failure.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDuplicateScheduleError, duplicateScheduleMessage, scheduleWriteError,
} from "../../src/lib/scheduleConflict.ts";

const dupe = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "uq_scheduled_workout_one_per_day"',
  details: "Key (client_id, day_id, scheduled_date)=(...) already exists.",
};

test("our index is recognised", () => {
  assert.equal(isDuplicateScheduleError(dupe), true);
});

test("a different unique violation is NOT dressed up as a friendly no-op", () => {
  // Some other constraint breaking is a real bug and has to stay loud.
  const other = { code: "23505", message: 'duplicate key value violates unique constraint "uq_client_email"' };
  assert.equal(isDuplicateScheduleError(other), false);
});

test("a foreign-key failure is not a duplicate", () => {
  // The FK crash of 6 Aug wore the name scheduled_workouts. Matching on the
  // table name alone would have swallowed it.
  const fk = { code: "23503", message: "violates foreign key constraint scheduled_workouts_workout_log_id_fkey" };
  assert.equal(isDuplicateScheduleError(fk), false);
});

test("null, undefined and plain strings do not crash the check", () => {
  assert.equal(isDuplicateScheduleError(null), false);
  assert.equal(isDuplicateScheduleError(undefined), false);
  assert.equal(isDuplicateScheduleError("boom"), false);
});

test("no error means no message", () => {
  assert.equal(scheduleWriteError(null), null);
  assert.equal(scheduleWriteError(undefined), null);
});

test("the message says what happened and fits the button pressed", () => {
  assert.match(scheduleWriteError(dupe, "move")!, /already on the calendar/);
  assert.match(scheduleWriteError(dupe, "move")!, /move/);
  assert.match(scheduleWriteError(dupe, "paste")!, /paste/);
});

test("the message never tells the user to retry a thing that cannot work", () => {
  const m = duplicateScheduleMessage("add");
  assert.equal(/try again/i.test(m), false);
});

test("an unrelated failure keeps its own text and still suggests retrying", () => {
  assert.match(scheduleWriteError({ message: "network down" }, "add")!, /network down/);
  assert.match(scheduleWriteError({}, "add")!, /Try again/);
});
