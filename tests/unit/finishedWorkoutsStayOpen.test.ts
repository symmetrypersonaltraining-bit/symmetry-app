// ============================================================================
// A FINISHED WORKOUT REOPENS INTO THE LOGGER, NOT INTO A LOCKED SCREEN.
//
// Lauren, 2 Sep: logged one set of nine on "LS6 Wed — Quad Dominant", hit
// Complete, and could not get back in — the celebration screen was the only
// thing the logger would render. Her logged set was unreachable and the other
// eight could not be done.
//
// Dustin, 2 Sep: "we have to be able to view/edit past workouts always. 3rd
// time on this."
//
// The cause was one flag doing two jobs. `workoutComplete` is seeded from the
// database so a finished session does not offer Cancel — correct, and it stays.
// But the same flag also gated the completion screen, so seeding it turned
// every reopen of a finished workout into a dead end.
//
// Finished is a fact about the row. Just-finished is a moment. Only the moment
// gets a celebration.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));

describe("reopening a finished workout", () => {
  it("does not render the completion screen from the seeded flag", () => {
    assert.ok(
      !/if \(workoutComplete\) \{\s*\n?\s*const symLines/.test(logger),
      "the celebration screen is gated on workoutComplete again — seeded from the database, so every reopen of a finished workout is a dead end",
    );
    assert.match(logger, /if \(justCompleted\) \{/,
      "the completion screen is not gated on a just-finished moment");
  });

  it("only sets just-finished where a workout is actually finished in this visit", () => {
    const setters = logger.match(/setJustCompleted\(true\)/g) || [];
    assert.equal(setters.length, 2,
      `setJustCompleted is called ${setters.length} times; it belongs to the two completeWorkout paths and nowhere else`);
    // discardSession's "already finished, nothing to discard" branch must NOT
    // celebrate — the client is trying to cancel, not finish.
    const discard = logger.slice(
      logger.indexOf("async function discardSession"),
      logger.indexOf("async function completeWorkout"),
    );
    assert.ok(discard.length > 200, "could not isolate discardSession");
    assert.ok(!/setJustCompleted/.test(discard),
      "discardSession throws up the completion screen; it is a cancel path, not a finish");
  });

  it("still hides Cancel on a finished session", () => {
    // The regression this whole flag was introduced for: a live Cancel button
    // sitting on top of a completed session's data.
    assert.match(logger, /\{!workoutComplete && \(/,
      "Cancel is offered on a finished session again");
  });

  it("stops the finish button claiming there is something to complete", () => {
    assert.match(logger, /workoutComplete \? "Save changes/,
      "a reopened finished workout still shows Complete / a progress percentage");
  });
});
