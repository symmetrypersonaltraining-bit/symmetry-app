import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A WRITE NOBODY CONFIRMS IS A WRITE THE PERSON ASSUMES FAILED.
 *
 * Todd Prine, 14 Aug 2026, 1:07pm: "Tried to just type my run in for a workout
 * and I don't think it saved."
 *
 * It had saved. The row was in offplan_workout_logs at 1:05pm — two minutes
 * before he messaged — with his full text: "Norwegian 4x4 run, 26min, 2.31
 * miles, 4 min on, 3 off (walk)...". Nothing was broken in the database.
 *
 * What was broken is that `addCustom()` inserted the row and then called
 * `window.location.reload()`, and NOTHING on the home screen renders
 * offplan_workout_logs. So the page came back byte-for-byte identical to the
 * one he had just typed into. No toast, no row, no change. The only rational
 * conclusion available to him was that it had failed.
 *
 * This is the mirror image of the six writes found earlier the same day. Those
 * failed silently; this one SUCCEEDED silently. Both leave the person with no
 * idea what actually happened, and the second is worse in one specific way:
 * the natural next move is to log it again.
 */

const ROOT = process.cwd();

function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

function read(rel: string): string {
  return codeOnly(readFileSync(join(ROOT, rel), "utf8"));
}

test("logging a workout by typing it tells you it worked", () => {
  const src = read("src/components/AddWorkoutButton.tsx");
  const start = src.indexOf("async function addCustom()");
  assert.ok(start > -1, "addCustom is gone");
  const fn = src.slice(start, start + 1400);

  assert.match(
    fn,
    /setSaved\(/,
    "addCustom no longer records what was saved, so the sheet cannot confirm it. " +
      "It previously reloaded the page instead — and since nothing on home renders " +
      "offplan_workout_logs, the screen came back identical and a real client " +
      "reported a successful save as a failure.",
  );

  assert.ok(
    !/window\.location\.reload\(\)/.test(fn),
    "addCustom reloads the page again. A reload is indistinguishable from doing " +
      "nothing when no surface displays the row that was just written.",
  );
});

test("the confirmation shows what was logged, not just that something was", () => {
  // "Saved!" on its own does not answer the question the person actually has,
  // which is whether the thing they typed is the thing that got stored.
  const src = read("src/components/AddWorkoutButton.tsx");
  assert.match(src, /\{saved\s*\?/, "the saved state no longer drives the UI");
  assert.match(
    src,
    /\{saved\}/,
    "the confirmation no longer echoes the logged text back. Showing their own " +
      "words is what makes it believable.",
  );
});

/**
 * A NOTE ON A MOVEMENT IS A NOTE, NOT A QUESTION.
 *
 * Dustin, 14 Aug: "the notes on movements in workout logger is sending to me as
 * a 'question' — that should go in as notes to the ai to see when we program
 * and should be labeled accordingly."
 *
 * Two separate bugs sat behind that sentence:
 *
 *   1. LABEL. Every client note was prefixed "[Question · <movement>]" into his
 *      inbox, so "went up to 110, felt easy" — which is programming information
 *      — arrived looking like an unanswered question, and set the client up to
 *      expect a reply that was never coming.
 *
 *   2. REACH. The note was stored in exercise_notes, but the workout designer
 *      at /api/workout-ai read trainer_notes ONLY. So the client's own words
 *      about a movement could not influence the next workout built for them.
 *      Stored, surfaced, and inert.
 */

test("a client's note on a movement is labelled as a note", () => {
  const logger = read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx");
  assert.ok(
    !/\[Question · \$\{exName\}\]/.test(logger),
    "client movement notes are being sent to the trainer as '[Question · X]' again. " +
      "They are observations to programme from, not questions awaiting a reply.",
  );
  assert.match(
    logger,
    /\[Training note · \$\{exName\}\]/,
    "the movement-note label is gone. Dustin needs to see WHICH movement a note " +
      "is about without opening the logger.",
  );
});

test("the workout designer can actually see the client's movement notes", () => {
  const route = read("src/app/api/workout-ai/route.ts");
  assert.match(
    route,
    /from\("exercise_notes"\)/,
    "buildContext no longer reads exercise_notes, so a client writing 'this one " +
      "bothers my shoulder' is writing into a table the workout designer cannot " +
      "see. The note gets stored, shown to Dustin, and changes nothing.",
  );
  assert.match(
    route,
    /\.eq\("author", "client"\)/,
    "the exercise_notes read is no longer scoped to author='client'. Trainer-authored " +
      "notes already arrive via trainer_notes; including both feeds the same guidance " +
      "twice and weights it double.",
  );
});

test("the client's notes stay distinguishable from the trainer's", () => {
  // These must not merge into one list. "This hurts" from a client is evidence
  // to work around; a line from Dustin is a prescription. Flattening them lets
  // a passing client comment outrank the coach.
  const route = read("src/app/api/workout-ai/route.ts");
  assert.match(route, /Trainer's programming notes/, "the trainer's note block lost its label");
  assert.match(
    route,
    /CLIENT's own notes/,
    "the client's notes are no longer labelled separately in the prompt — they read " +
      "as instructions from the coach rather than as reports from the person training.",
  );
});

test("what you logged is still there when you look again", () => {
  /**
   * The confirmation in AddWorkoutButton stops the moment of doubt. It does not
   * stop the doubt RETURNING tomorrow, when Todd opens the app and his run is
   * nowhere on the screen — which was the actual state of things: nothing on
   * home rendered offplan_workout_logs at all, and the only component that did
   * (OffPlanBanner) mounts inside a specific workout's logger page, which is
   * not where anyone would think to look for a run they typed in from home.
   *
   * OffPlanToday is the fix, and it is deliberately ADDITIVE: its own card,
   * fetching its own data, rendering null when empty. Dustin's standing rule on
   * this dashboard — the reason the Goals work was built the same way — is that
   * nothing new may put an existing card at risk.
   */
  const card = read("src/components/OffPlanToday.tsx");
  assert.match(card, /from\("offplan_workout_logs"\)/, "OffPlanToday no longer reads the table it exists to show");
  assert.match(
    card,
    /if \(!rows\.length\) return null/,
    "OffPlanToday renders something when there is nothing logged — an empty card on " +
      "every rest day is noise, and noise is what gets a card ignored on the day it matters",
  );
  assert.match(
    card,
    /r\.details \|\| r\.description/,
    "the card shows `description`, which is truncated to 80 characters at write time. " +
      "Showing someone a clipped version of what they typed is its own quiet 'did that " +
      "save properly?' — `details` holds the full text",
  );

  const home = read("src/app/(app)/home/ClientDashboard.tsx");
  assert.match(
    home,
    /<OffPlanToday\s*\/>/,
    "OffPlanToday is not mounted on the home screen. Todd typed his run in from home; " +
      "that is where it has to appear.",
  );
});
