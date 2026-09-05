import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ASKS_ABOUT_SCHEDULE } from "../../src/lib/ai/weekly-copy-guards";
import { foodStance, nudgeWeekFor } from "../../src/lib/ai/weekly-picture";

// Dustin, 5 Sep 2026: "make sure the questions are varied simple snd stay away
// from asking about schedule changes. I dictate the schedule not clients."
//
// He is describing what actually went out. Of the six programming questions
// written for the week of 30 Aug, FIVE were a version of "what's getting in the
// way of the other days, and would a different schedule fit your life better?"
// — to five different clients. It is what the model falls back on when it has
// nothing specific to point at, which is precisely when the guard is needed.

test("the schedule guard catches what actually went out", () => {
  for (const real of [
    "You've hit 1 of 9 scheduled sessions each of the last two weeks — what's getting in the way, and would a shorter or fewer-day schedule actually fit your life better right now?",
    "You've made it to one session each of the last two weeks — what's getting in the way of the other days, and is there anything about how those sessions are scheduled?",
    "You hit 2 of 3 sessions the week of Aug 16 but none this past week — what got in the way, and is there a day or session format that would be easier to protect right now?",
    "You haven't logged any sessions in the last two weeks — is something about the current schedule making it hard to get in?",
  ]) {
    assert.ok(ASKS_ABOUT_SCHEDULE.test(real), `this went out to a real client and must never go out again: ${real}`);
  }
});

test("the guard does not swallow a question about the actual work", () => {
  // These are the questions the field is FOR. A guard that eats them has turned
  // a fortnightly conversation into permanent silence.
  for (const good of [
    "You've skipped Lower Body twice in two weeks — is something bothering you in that session?",
    "Leg press keeps getting left off — is it the machine, or does it not feel good right now?",
    "How does the incline press feel now compared with a month ago?",
    "Which part of Day 2 do you dread most?",
    "Cable rows have been in every session for a month — still challenging, or too easy now?",
  ]) {
    assert.ok(!ASKS_ABOUT_SCHEDULE.test(good), `this is exactly the question we want and the guard ate it: ${good}`);
  }
});

test("the guard runs in the route, not only in the prompt", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/weekly-ai/route.ts"), "utf8");
  assert.ok(
    /ASKS_ABOUT_SCHEDULE\.test\(question\)/.test(route),
    "the schedule rule lives only in the prompt again — a rule a model can quietly stop following is not a rule",
  );
});

// ── the food-logging stance ────────────────────────────────────────────────
//
// "make sure it does not mention nutrition if they have never logged food too
// much... if they have logged n fell off push it."
//
// Jennifer Day's read for the week of 30 Aug: "there's still nothing in the
// food logger two weeks running" — to a client who has never logged one day.
// The fortnight in the numbers block cannot tell "never started" from "stopped
// last week", so both got the same disappointed sentence, every week.

test("never-logged and lapsed are different situations", () => {
  // Real clients, real counts, 5 Sep 2026.
  assert.equal(foodStance(0, 0), "never", "Jennifer Day, Robert Miller, Grant Weever — never logged a day");
  assert.equal(foodStance(2, 0), "never", "two days ever is somebody who opened the screen once");
  assert.equal(foodStance(27, 0), "lapsed", "Gerard: 27 days logged, then stopped — push this one");
  assert.equal(foodStance(28, 1), "slipping", "Krysta: still logging, thinly");
  assert.equal(foodStance(56, 14), "active", "Lauren: logging daily — coach the numbers");
  assert.equal(foodStance(3, 3), "starting", "just began; do not grade their macros yet");
});

test("the soft nudge is on a fixed cadence, not the model's discretion", () => {
  // "every so often a soft nudge fine but don't keep on it." A model told to
  // nudge "sometimes" nudges every time, so the cadence is computed and handed
  // over as a yes or a no. One week in four.
  const weeks = ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06"];
  const flags = weeks.map(nudgeWeekFor);
  assert.deepEqual(flags, [true, false, false, false, true, false], "the nudge cadence drifted off one-in-four");
  assert.equal(nudgeWeekFor("2026-07-05"), true, "the cadence must hold backwards too, or a replayed run changes it");
});
