import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LOCK THE WORKOUT LOGGER LAYOUT.
 *
 * This screen has produced the same class of bug at least five times:
 *
 *   48d246f  sets compressed by the keyboard, only one set visible
 *   457328e  header-hide condition reintroduced by a concurrent branch
 *   4cb50a1  a visualViewport listener fighting itself in a scroll loop
 *   8654a38  tall exercise pushed the footer and tabs off screen, no way out
 *   8/1      the fix for 8654a38 put the sets in the flexible box, so the
 *            keyboard sheared them in half again
 *
 * Every one of them was someone reasonably rearranging this layout without
 * knowing which properties were load-bearing. Dustin, 8/1: "Make sure that
 * format gets locked in permanently. We can't keep reintroducing that same
 * bug."
 *
 * So the invariants are asserted here rather than described in a comment
 * somebody will edit around. If you are here because this test failed, read
 * the rule it names before changing the assertion — the assertion is the
 * cheap part, the bug it prevents costs Dustin a training session.
 */

const SRC = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

/**
 * The source with comments stripped.
 *
 * The bans below have to be checked against CODE, not prose. The comment
 * explaining why visualViewport is banned necessarily contains the word
 * "visualViewport", and a test that cannot tell those apart punishes the
 * documentation that stops the bug coming back.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Index of a marker, asserting it exists exactly once. */
function at(marker: string, label: string): number {
  const first = SRC.indexOf(marker);
  assert.notEqual(first, -1, `logger layout: expected to find ${label} (${marker})`);
  assert.equal(
    SRC.indexOf(marker, first + 1),
    -1,
    `logger layout: ${label} appears more than once; the order check below cannot be trusted`,
  );
  return first;
}

test("session view is pinned to a stable height, not inset-0", () => {
  // inset-0 resolves against the LAYOUT viewport, which the Android WebView
  // shrinks when the keyboard opens — the whole view reflows and the exercise
  // header disappears. The height comes from useStableViewportHeight, which
  // never adopts a shorter viewport WHILE A KEYBOARD IS UP, so the keyboard
  // covers the bottom of the screen instead of resizing it.
  //
  // 8/10: that hook used to be grow-only, which fixed the keyboard and caused
  // the tab row below to vanish (see the next test). It can now come back down
  // for genuine viewport changes only — three guards, pinned in
  // tests/unit/stableViewportHeight.test.ts. The keyboard rule is unchanged.
  assert.ok(
    SRC.includes("useStableViewportHeight"),
    "logger must pin its height with useStableViewportHeight so the keyboard cannot resize it",
  );
  assert.ok(
    SRC.includes('height: stableH ?? "100dvh"'),
    "session root must use the stable height",
  );
  assert.ok(
    !/className="fixed inset-0 flex flex-col z-\[999\]"/.test(CODE),
    "session root must NOT use inset-0 — the keyboard shrinks that viewport",
  );
});

test("set rows are pinned outside the scroll region, in the right order", () => {
  // The order IS the fix. Sets above notes means the keyboard eats the notes
  // card; notes above sets means it eats a set row. Sets inside the scroll
  // region means they compress. Both have shipped as bugs.
  const scrollRegion = at('{/* /scroll region', "the end of the scroll region");
  const sets = at("{/* Sets — a PINNED sibling", "the pinned sets block");
  const notes = at("{/* Per-exercise notes", "the notes card");
  const spacer = at("{/* Spacer.", "the flex spacer");
  const footer = at("{/* Bottom controls", "the Prev/Next footer");

  assert.ok(scrollRegion < sets, "sets must come AFTER the scroll region closes — inside it they compress");
  assert.ok(sets < notes, "notes must come AFTER the sets — the keyboard is allowed to cover notes, never a set row");
  assert.ok(notes < spacer, "the spacer belongs below the notes so it is what collapses first");
  assert.ok(spacer < footer, "the footer holds the bottom");
});

test("the scroll region does not grow", () => {
  // flex-1 on the scroll box makes it eat every spare pixel and shove the sets
  // to the bottom of the screen, hundreds of px from the exercise they belong
  // to. It takes its natural height and shrinks only when it must.
  assert.ok(
    SRC.includes('flexGrow: 0, flexShrink: 1, flexBasis: "auto"'),
    "the exercise-header scroll box must be flex: 0 1 auto, never flex-1",
  );
});

test("no keyboard-conditioned layout anywhere in the logger", () => {
  // This is the rule that has been broken most often, usually by adding a
  // scroll-the-focused-input handler that then fights the keyboard animation.
  assert.ok(
    !CODE.includes("useKeyboardInset"),
    "the logger must not react to keyboard height — pin the container instead",
  );
  assert.ok(
    !/visualViewport/.test(CODE),
    "no visualViewport listeners in the logger; that is how 4cb50a1's scroll loop happened",
  );
  assert.ok(
    !/scrollIntoView/.test(CODE),
    "no scrollIntoView in the logger; moving the view on focus is what 48d246f removed",
  );
});

test("nothing on this screen has unbounded height", () => {
  // A data-driven block with no cap is how the 7/31 lock-out happened: enough
  // prior notes and the footer went off the bottom with nothing scrollable.
  assert.ok(
    /maxHeight: 96, overflowY: "auto"/.test(SRC),
    "the prior-notes list must stay capped and scrollable, or it can push the footer off screen",
  );
});

test("session mode does not leak its history entry", () => {
  // Entering session mode pushes an entry so Back exits the session instead of
  // the page. Leaving by Cancel/Complete used to leave that entry as the
  // current one, so the next Back popped a dead entry with the same URL and
  // looked like it did nothing.
  assert.ok(
    SRC.includes("poppedByBack"),
    "session-mode back handling must clean up its own history entry when it was not consumed by Back",
  );
});

test("the app tab row is present, and is the last thing in the session view", () => {
  // Removed on 8/1 to buy back height and put straight back at Dustin's
  // request — he uses them mid-session. Then on 8/10 they vanished again
  // WITHOUT anyone editing this file: useStableViewportHeight was grow-only, so
  // any moment the viewport was briefly taller became a permanent pin, the
  // container ended up taller than the screen, and the bottom row hung below
  // the fold. The tab row is the bottom row, so it is what disappeared.
  //
  // Two things are asserted. That the tabs still EXIST, because deleting them
  // is the tempting way to reclaim height and it has been done once. And that
  // they come after the Prev/Next controls, because being last is exactly why
  // they are the canary — anything that overshoots the viewport eats them
  // first, and a reordering would hide that signal.
  const controls = at("{/* Bottom controls (Prev/Next/Complete). */}", "the Prev/Next footer");
  const tabs = at("{/* App tabs.", "the app tab row");
  assert.ok(
    tabs > controls,
    "the app tab row must stay last in the session view — it is the first thing an over-tall container pushes off screen",
  );
  assert.ok(
    /ti-home/.test(SRC) && /ti-salad/.test(SRC),
    "the tab row must still render its links; removing them to reclaim height was tried on 8/1 and reverted",
  );
});
