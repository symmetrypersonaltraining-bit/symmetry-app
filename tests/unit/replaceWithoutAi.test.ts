import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Lauren Standefer, 2026-08-13, after swapping the stair master for a walk:
// "it like wouldn't let me replace it without generating a whole thing — is it
// possible to just add it and not have ai make a warm up and all that? Like
// have the option to generate a workout or just switch it to another?"
//
// Both options already existed. They were rendered under `!aiOn`, so turning
// the AI ON removed them — generating and choosing were built as rivals. They
// are not. A client with AI enabled needs "I'll pick, thanks" MORE often, not
// less, because the AI path is the one that adds the warm-up she did not want.

const SRC = fs.readFileSync(
  path.join(process.cwd(), "src/components/OffPlanBanner.tsx"),
  "utf8"
);

test("a client with AI on can still replace a workout without generating one", () => {
  const menus = [...SRC.matchAll(/\{aiOn && mode === "menu" &&/g)];
  assert.ok(menus.length >= 1, "the AI menu is gone entirely");

  // The two non-AI routes must be reachable while aiOn is true. Both are keyed
  // off handlers rather than copy, so rewording the buttons cannot break this.
  const aiMenuAt = SRC.indexOf('{aiOn && mode === "menu" &&');
  const rest = SRC.slice(aiMenuAt);
  assert.match(rest, /onClick=\{openSwap\}/, "picking an existing workout is hidden again when AI is on");
  assert.match(rest, /onClick=\{\(\) => setMode\("type"\)\}/, "logging what you actually did is hidden again when AI is on");
});

test("the AI options are still there — this adds, it does not replace", () => {
  // Dustin: "I want to leave the swap options we have intact."
  for (const m of ['setMode("replace")', 'setMode("equipment")', 'setMode("activity")', "onClick={openLibrary}"]) {
    assert.ok(SRC.includes(m), `the AI option ${m} was removed; this change was meant to be additive`);
  }
});

test("swapping ONE movement inside a session still exists in the logger", () => {
  // The other half of what she asked for, and the half that already worked.
  const logger = fs.readFileSync(
    path.join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
    "utf8"
  );
  assert.match(logger, /function SwapModal\(/, "the per-exercise swap modal is gone");
  assert.match(logger, /setSwapTargetPe\(currentExercise\)/, "nothing opens the per-exercise swap any more");
  assert.match(logger, /title="Swap exercise"/, "the swap control lost its label");
});
