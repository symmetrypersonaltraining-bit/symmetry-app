// Backlog 2 — the schedule was copying its own duplicates forward.
//
// Four of the six duplicate groups in a 60-day window shared a created_at to
// the microsecond: one insert batch, same session twice. That is copy-week
// reading a week that already held a duplicate and pasting both copies.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeInsertRows, occupiedKeys, type ExistingSlot } from "../../src/lib/scheduleDedupe.ts";

const row = (day_id: string | null, scheduled_date: string) => ({ day_id, scheduled_date });

test("a duplicate inside one pasted batch inserts once", () => {
  const out = dedupeInsertRows([
    row("d1", "2026-08-17"),
    row("d1", "2026-08-17"), // the propagated copy
    row("d2", "2026-08-19"),
  ]);
  assert.deepEqual(out, [row("d1", "2026-08-17"), row("d2", "2026-08-19")]);
});

test("pasting over a week that already has the session adds nothing", () => {
  const existing: ExistingSlot[] = [{ day_id: "d1", scheduled_date: "2026-08-17", deleted_at: null }];
  assert.deepEqual(dedupeInsertRows([row("d1", "2026-08-17")], existing), []);
});

test("pasting tops up the dates that are actually empty", () => {
  const existing: ExistingSlot[] = [{ day_id: "d1", scheduled_date: "2026-08-17", deleted_at: null }];
  const out = dedupeInsertRows([row("d1", "2026-08-17"), row("d2", "2026-08-19")], existing);
  assert.deepEqual(out, [row("d2", "2026-08-19")]);
});

test("a soft-deleted row does not block a paste", () => {
  // Otherwise deleting a session then re-pasting the week looks like the paste
  // silently did nothing.
  const existing: ExistingSlot[] = [{ day_id: "d1", scheduled_date: "2026-08-17", deleted_at: "2026-08-10T00:00:00Z" }];
  assert.deepEqual(dedupeInsertRows([row("d1", "2026-08-17")], existing), [row("d1", "2026-08-17")]);
});

test("the same session on a different date is not a duplicate", () => {
  const existing: ExistingSlot[] = [{ day_id: "d1", scheduled_date: "2026-08-17", deleted_at: null }];
  assert.deepEqual(dedupeInsertRows([row("d1", "2026-08-24")], existing), [row("d1", "2026-08-24")]);
});

test("one-off sessions with no day_id always insert", () => {
  // They have no identity to collide on, and two custom sessions in a day is
  // a normal thing to want.
  const out = dedupeInsertRows([row(null, "2026-08-17"), row(null, "2026-08-17")]);
  assert.equal(out.length, 2);
});

test("the first copy survives, so the row the trainer saw first is kept", () => {
  const out = dedupeInsertRows([
    { day_id: "d1", scheduled_date: "2026-08-17", tag: "first" },
    { day_id: "d1", scheduled_date: "2026-08-17", tag: "second" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].tag, "first");
});

test("occupiedKeys ignores deleted rows", () => {
  const keys = occupiedKeys([
    { day_id: "d1", scheduled_date: "2026-08-17", deleted_at: null },
    { day_id: "d2", scheduled_date: "2026-08-18", deleted_at: "2026-08-10T00:00:00Z" },
  ]);
  assert.equal(keys.size, 1);
  assert.equal(keys.has("d1|2026-08-17"), true);
});
