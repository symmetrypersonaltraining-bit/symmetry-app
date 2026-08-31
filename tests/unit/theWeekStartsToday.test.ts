// "5 out of 8?? its Monday the week starts today..."
//
// Dustin, Monday 31 Aug, reading the programming question on his own dashboard:
//
//   "You completed 8 of 9 sessions last week but are sitting at 5 of 8 this
//    week — what got in the way..."
//
// He had trained once. His week was two days old.
//
// NOTHING WAS MISCOUNTED. The weekly sweep runs late on a Saturday and writes
// the copy for the week starting the next day — his row was stamped
// week_start 2026-08-30 and asked_at Saturday 10:55pm CT. At that instant the
// summariser handed the model:
//
//   LAST WEEK          = Aug 16-22   -> 8 of 9
//   THIS WEEK SO FAR   = Aug 23-29   -> 5 of 8   (a COMPLETE week; Sat is day 7)
//
// Both labels were true at 10:55pm on the Saturday. Neither was true by the
// time anybody read them: Aug 23-29 had become last week, and Aug 16-22 the
// week before that. The model used the labels it was given, faithfully.
//
// A number that was true when written and false when read is still false, and
// this one asked him to account for a shortfall that had not happened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lastWeekWindow, thisWeekWindow, weeklyNumbersBlock, type WeekFacts } from "../../src/lib/ai/weekly-numbers.ts";

const SATURDAY = "2026-08-29";   // when the sweep actually ran
const MONDAY = "2026-08-31";     // when he read it

function facts(w: { start: string; end: string; days: number; complete: boolean }): WeekFacts {
  return {
    window: w,
    loggedDays: 0, avg: null, adherence: null, vsTarget: null,
    workoutsDone: 0, workoutsPlanned: 0, weightStart: null, weightEnd: null,
  } as unknown as WeekFacts;
}

test("the two windows the sweep is handed are both finished weeks", () => {
  const last = lastWeekWindow(SATURDAY);
  const current = thisWeekWindow(SATURDAY);
  assert.deepEqual([last.start, last.end], ["2026-08-16", "2026-08-22"]);
  assert.deepEqual([current.start, current.end], ["2026-08-23", "2026-08-29"]);
  // Saturday is day 7 of a Sun-Sat week, so "this week so far" is the whole
  // week. There is nothing partial about it, and by Monday it is simply over.
  assert.equal(current.days, 7);
  assert.equal(current.complete, true);
});

test("the week he was asked about had not started when the copy was written", () => {
  const hisWeek = thisWeekWindow(MONDAY);
  assert.equal(hisWeek.start, "2026-08-30");
  assert.equal(hisWeek.days, 2);
  // The window the copy described ends BEFORE the week he was reading it in
  // begins. Nothing in it can be a fact about his current week.
  assert.ok(thisWeekWindow(SATURDAY).end < hisWeek.start);
});

test("next-week copy never labels a window 'this week'", () => {
  const block = weeklyNumbersBlock(
    facts(lastWeekWindow(SATURDAY)),
    facts(thisWeekWindow(SATURDAY)),
    null, null,
    "nextWeek",
  );
  assert.match(block, /THE WEEK BEFORE LAST/);
  assert.match(block, /LAST WEEK/);
  assert.doesNotMatch(block, /THIS WEEK SO FAR/);
  // And it is told explicitly, because a label alone is a hint.
  assert.match(block, /the client's week starts the day they read this/);
});

test("a live surface is unchanged — there 'this week so far' is the truth", () => {
  const block = weeklyNumbersBlock(
    facts(lastWeekWindow(MONDAY)),
    facts(thisWeekWindow(MONDAY)),
    null, null,
  );
  assert.match(block, /LAST WEEK/);
  assert.match(block, /THIS WEEK SO FAR/);
  assert.doesNotMatch(block, /THE WEEK BEFORE LAST/);
  assert.doesNotMatch(block, /the client's week starts the day they read this/);
});
