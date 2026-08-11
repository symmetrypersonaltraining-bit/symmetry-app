// Doing a planned session early must consume its slot, not add a second one.
//
// Sara Prince, 11 Aug: "Did hip and ankle mobility Sunday to get a head start.
// The app added additional sessions to Sunday instead of giving me credit for
// two week mobility sessions."
//
// Her week went from 7 planned sessions to 9, three done, and the app told her
// she was at 30% adherence for being AHEAD of schedule. Getting on with your
// programme early should never read as falling behind.

import test from "node:test";
import assert from "node:assert/strict";
import {
  findSlotToPullForward,
  PULL_FORWARD_WINDOW_DAYS,
  type SlotCandidate,
} from "../../src/lib/pullForward.ts";

const HIP = "93cc7dc3";
const ANKLE = "eb5df3f4";
const SUNDAY = "2026-08-09";

const row = (o: Partial<SlotCandidate> & { id: string; scheduled_date: string }): SlotCandidate => ({
  day_id: HIP,
  status: "scheduled",
  deleted_at: null,
  ...o,
});

// ─── Sara's actual week ─────────────────────────────────────────────────────

test("her Sunday hip mobility consumes the NEXT hip slot, not a later one", () => {
  // Real data: Hip Impingement was scheduled Mon 10, Wed 12 and Thu 13.
  const week = [
    row({ id: "mon", scheduled_date: "2026-08-10" }),
    row({ id: "wed", scheduled_date: "2026-08-12" }),
    row({ id: "thu", scheduled_date: "2026-08-13" }),
  ];
  const hit = findSlotToPullForward(week, HIP, SUNDAY);
  assert.equal(hit?.id, "mon", "must take the soonest, so the calendar stays dense at the front");
});

test("her Sunday ankle mobility takes the ankle slot, never the hip one", () => {
  const week = [
    row({ id: "hip-mon", scheduled_date: "2026-08-10", day_id: HIP }),
    row({ id: "ankle-wed", scheduled_date: "2026-08-12", day_id: ANKLE }),
  ];
  assert.equal(findSlotToPullForward(week, ANKLE, SUNDAY)?.id, "ankle-wed");
});

// ─── what it must never take ────────────────────────────────────────────────

test("never steals a session that is already completed", () => {
  const week = [row({ id: "done", scheduled_date: "2026-08-12", status: "completed" })];
  assert.equal(findSlotToPullForward(week, HIP, SUNDAY), null);
});

test("never revives a soft-deleted row", () => {
  const week = [row({ id: "gone", scheduled_date: "2026-08-12", deleted_at: "2026-08-10T00:00:00Z" })];
  assert.equal(findSlotToPullForward(week, HIP, SUNDAY), null);
});

test("never pulls from the PAST — a missed session is a different problem", () => {
  // Consuming a slot they already failed to do would quietly erase the miss.
  const week = [row({ id: "sat", scheduled_date: "2026-08-08" })];
  assert.equal(findSlotToPullForward(week, HIP, SUNDAY), null);
});

test("never reaches past a week — an extra session stays an EXTRA session", () => {
  // Sara's complaint in reverse: silently deleting work she still owes next
  // week because she did a bonus round this week.
  const week = [row({ id: "next-week", scheduled_date: "2026-08-20" })];
  assert.equal(findSlotToPullForward(week, HIP, SUNDAY), null);
});

test("the boundary is inclusive at exactly one week, and out past it", () => {
  const inside = [row({ id: "edge", scheduled_date: "2026-08-16" })]; // +7
  assert.equal(findSlotToPullForward(inside, HIP, SUNDAY)?.id, "edge");
  const outside = [row({ id: "past-edge", scheduled_date: "2026-08-17" })]; // +8
  assert.equal(findSlotToPullForward(outside, HIP, SUNDAY), null);
});

test("a session that is not on the plan at all just gets added", () => {
  assert.equal(findSlotToPullForward([], HIP, SUNDAY), null);
});

test("the window stays a week — it is the whole judgement call", () => {
  assert.equal(PULL_FORWARD_WINDOW_DAYS, 7);
});
