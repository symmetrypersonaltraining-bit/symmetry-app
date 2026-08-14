import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * YOU CAN BUILD A WORKOUT FROM THE SCREEN THAT IS ABOUT DAYS.
 *
 * app_feedback 73fcd284, 6 Aug: "Nedd full add workout custom from schedule
 * page not just pick from library."
 *
 * The day sheet on /schedule offered exactly two things — Cardio and Strength —
 * and both were ways to LOG something that had already happened. There was no
 * way to put a workout ON a day from the one screen entirely about which day
 * things are on. A trainer planning Thursday had to leave, go to the client's
 * profile, and pick the date again there.
 *
 * The fix is deliberately not a new builder. ManualWorkoutBuilder already
 * existed, already took a date, and was already mounted on Home, the workout
 * tab and the client profile — it was simply absent here. Reusing it is what
 * keeps a hand-built workout ONE shape everywhere: same route, same five
 * tables, same rows the logger and the history and the progress charts read.
 * A second builder would be a second set of bugs and a second thing to keep
 * in step.
 */

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SCHEDULE = strip(readFileSync(join(ROOT, "src/app/(app)/schedule/ScheduleClient.tsx"), "utf8"));

test("the schedule day sheet can build a workout", () => {
  assert.match(SCHEDULE, /import ManualWorkoutBuilder from "@\/components\/ManualWorkoutBuilder";/);
  assert.match(SCHEDULE, /"choose" \| "cardio" \| "strength" \| "build"/);
  assert.match(SCHEDULE, /logStep === "build"/);
  assert.match(SCHEDULE, /Build a workout for this day/);
});

test("it builds for the day that was tapped, not for today", () => {
  // The whole point. A builder that silently used today would be worse than no
  // builder — it would put Thursday's session on Monday and look like it worked.
  assert.match(SCHEDULE, /date=\{selectedDate\}/);
});

test("it reuses the existing builder rather than growing a second one", () => {
  // If this ever fails because somebody hand-rolled a form here, the two will
  // drift and a workout built on this screen will stop matching one built on
  // Home — different rows, different logger behaviour, same name.
  assert.ok(
    !/\/api\/workout-manual/.test(SCHEDULE),
    "the schedule page now calls the workout route directly instead of going through ManualWorkoutBuilder",
  );
});

test("finishing closes the sheet and refreshes the calendar", () => {
  // Without the refresh the new workout is in the database and absent from the
  // month grid, which reads as "it didn't save".
  assert.match(SCHEDULE, /onDone=\{\(\) => \{ setSelectedDate\(null\); setLogStep\("choose"\); router\.refresh\(\); \}\}/);
});

test("the one-day log options are still there and still first", () => {
  // Logging what already happened is the common case; building is the addition.
  assert.ok(SCHEDULE.indexOf('setLogStep("cardio")') < SCHEDULE.indexOf('setLogStep("build")'));
  assert.ok(SCHEDULE.indexOf('setLogStep("strength")') < SCHEDULE.indexOf('setLogStep("build")'));
});
