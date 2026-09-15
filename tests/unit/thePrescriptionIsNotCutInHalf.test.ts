// ============================================================================
// THE PRESCRIPTION IS NOT CUT IN HALF.
//
// Dustin, 15 Sep 2026, a screenshot of Stacie's session — Battle Rope
// Alternating Waves, 11/11, four timed sets on the screen:
//
//   *"Page is cut off on this one."*
//
// The pill row under the movement name was sliced horizontally. You could read
// the top half of "30s on / 30s off" and the top half of "straight into the
// next movement", both apparently sitting behind the Track row.
//
// NOTHING WAS OVERLAPPING. Session mode is a fixed box with four children, and
// exactly one of them is allowed to shrink:
//
//   name + buttons   PINNED   (flex-shrink-0)
//   meta pills       ← the shrinkable scroll box, min-h-0 + flex-shrink:1
//   Track + sets     PINNED
//   footer           PINNED
//
// min-h-0 with flex-shrink:1 lets a box collapse to ZERO. On this exercise the
// name wrapped to three lines, the Timer/Stopwatch switch took a row, and four
// timed sets each took another — so the pinned children claimed nearly the
// whole screen and left the pills about ten pixels. Ten pixels of a pill is
// what he photographed. Scrollable in theory; a graphical fault in practice.
//
// THIS EXACT FAULT HAS HAPPENED BEFORE, ONE ELEMENT HIGHER. Gerard, 8/4: a
// mid-session screenshot with no exercise name anywhere. The name was in this
// same box, the box collapsed, and the name "scrolled into a region with no
// height, so there was nothing to scroll". The fix then was to pin the name.
//
// So the rule this file defends is the one that fix implied and did not finish:
// ANYTHING A CLIENT NEEDS IN ORDER TO DO THE SET IS PINNED. On a timed movement
// "30s on / 30s off" is not decoration, it IS the exercise. The expanded cue
// stays scrollable — it is opt-in, genuinely unbounded, and a sentence about
// the movement rather than the movement itself.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

// The one shrinkable box in session mode. Everything before it in the file is
// pinned; everything inside it can be squeezed to nothing.
const SCROLL_BOX = SRC.indexOf('className="min-h-0 overflow-y-auto"');
const SETS = SRC.indexOf("{/* Sets — a PINNED sibling of the scroll region");

describe("the prescription is not cut in half", () => {
  it("session mode still has exactly one shrinkable box", () => {
    // If a second one ever appears this whole file is reasoning about the
    // wrong element, and would keep passing while the screen broke.
    assert.ok(SCROLL_BOX > -1, "the scroll region is gone — this test needs rewriting, not deleting");
    assert.equal(
      SRC.split('className="min-h-0 overflow-y-auto"').length - 1, 1,
      "more than one shrinkable box in this file",
    );
    assert.ok(SETS > SCROLL_BOX, "the sets must still be a SIBLING below the scroll box, not inside it");
  });

  it("the prescription pill is pinned, not in the box that can collapse", () => {
    const pill = SRC.indexOf("{currentExercise.volume_value}");
    assert.ok(pill > -1, "the prescription pill is gone");
    assert.ok(
      pill < SCROLL_BOX,
      "the prescription is inside the shrinkable box again — it will be sliced in " +
        "half on any exercise whose pinned content fills the screen",
    );
  });

  it("so is the rest instruction, which on a superset is the whole point", () => {
    // "straight into the next movement" was the second sliced pill. A client who
    // cannot read it stands there waiting instead of going.
    const rest = SRC.indexOf("restLabel(currentExercise.rest)");
    assert.ok(rest > -1 && rest < SCROLL_BOX, "the rest pill must be pinned with the rest of the prescription");
  });

  it("the name is still pinned — the 8/4 fix stays fixed", () => {
    const name = SRC.indexOf('{currentExercise.exercises?.name || "Exercise"}');
    assert.ok(name > -1 && name < SCROLL_BOX, "the movement name is back inside the collapsible box");
  });

  it("the expanded cue is what stays scrollable", () => {
    const cue = SRC.indexOf("{showCue && currentExercise.cue &&");
    assert.ok(cue > SCROLL_BOX && cue < SETS, "the cue paragraph belongs inside the scroll box");
  });

  it("an exercise with no prescription does not get a pinned empty row", () => {
    // The row is pinned now, so an empty one is 20px stolen from the sets on
    // every bodyweight movement — and most of them carry none of this.
    assert.match(SRC, /const hasMeta = Boolean\(/, "the row must be conditional");
    assert.match(SRC, /\{hasMeta && \(/, "…and actually gated on it");
  });

  it("nothing here reacts to the keyboard", () => {
    // This file's oldest rule, and the reason it has a test file at all:
    // keyboard-conditioned layout in session mode has caused roughly twenty
    // bugs. The fix above is pure flex structure and must not have smuggled one in.
    const mode = SRC.slice(SRC.indexOf("if (sessionMode && currentExercise)"), SETS);
    assert.doesNotMatch(mode, /keyboardHeight|visualViewport|keyboardOpen/,
      "session-mode layout is reacting to the keyboard");
  });
});
