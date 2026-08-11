// Lauren Standefer, 11 Aug 2026, 10:04am — mid-session, on her phone:
//   "Couldn't finish the workout: duplicate key value violates unique
//    constraint uq_workout_log_one_completed."
//
// Her workout had saved thirty-four seconds earlier. The logger then made a
// SECOND log for the same client/day/date, copied all 24 sets into it, and
// tried to complete that one. The database refused, correctly, and the refusal
// was shown to her as her workout failing.
//
// The bug was an assumption: no log id in hand was treated as no log existing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickExistingLog, type ExistingLog } from "../../src/lib/workoutLogLookup.ts";

test("no rows means insert — the caller creates a fresh log", () => {
  assert.equal(pickExistingLog([]), null);
});

test("a completed log is found instead of inserting a second one", () => {
  // Lauren's case exactly. Before this, the absence of an id meant INSERT.
  const rows: ExistingLog[] = [{ id: "done", completed: true, created_at: "2026-08-11T14:43:24Z" }];
  assert.equal(pickExistingLog(rows)?.id, "done");
});

test("a completed log wins over a NEWER incomplete one", () => {
  // This is the ordering that matters. Lauren's orphan was created 38 seconds
  // AFTER the completed row, so 'most recent' alone would have picked the
  // wrong one and reproduced the bug.
  const rows: ExistingLog[] = [
    { id: "orphan", completed: false, created_at: "2026-08-11T15:04:02Z" },
    { id: "done", completed: true, created_at: "2026-08-11T14:43:24Z" },
  ];
  assert.equal(pickExistingLog(rows)?.id, "done");
  assert.equal(pickExistingLog(rows)?.completed, true);
});

test("with nothing completed, the most recent log is resumed", () => {
  const rows: ExistingLog[] = [
    { id: "older", completed: false, created_at: "2026-08-11T09:00:00Z" },
    { id: "newer", completed: false, created_at: "2026-08-11T11:00:00Z" },
  ];
  assert.equal(pickExistingLog(rows)?.id, "newer");
});

test("input order does not decide the answer", () => {
  // The old scheduled_workouts bug picked a row by UUID order, which made the
  // outcome effectively random. Not repeating that.
  const a: ExistingLog[] = [
    { id: "newer", completed: false, created_at: "2026-08-11T11:00:00Z" },
    { id: "older", completed: false, created_at: "2026-08-11T09:00:00Z" },
  ];
  assert.equal(pickExistingLog(a)?.id, "newer");
});

test("a missing created_at never wins over a real timestamp", () => {
  const rows: ExistingLog[] = [
    { id: "nodate", completed: false },
    { id: "dated", completed: false, created_at: "2026-08-11T09:00:00Z" },
  ];
  assert.equal(pickExistingLog(rows)?.id, "dated");
});

test("completed:null is treated as not completed, not as completed", () => {
  const rows: ExistingLog[] = [
    { id: "a", completed: null, created_at: "2026-08-11T09:00:00Z" },
    { id: "b", completed: true, created_at: "2026-08-11T08:00:00Z" },
  ];
  assert.equal(pickExistingLog(rows)?.id, "b");
});
