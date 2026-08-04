import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE CELEBRATION SCREEN SHEARED ITS OWN CARD IN HALF.
 *
 * Dustin, 2026-08-04, screenshot of Stacie's finish: "things being cut off
 * sloppy in celebration screen". The Apparition card — the rare one, the one
 * that only fires on a big PR — had the top of Dustin's head sliced off, the
 * headline cut through the middle of a word, and the paragraph under it gone
 * completely.
 *
 * Cause: the overlay was one flex column with `overflowY: auto`, and the card
 * carried `flex: 1`. `flex: 1` is shorthand for `1 1 0%` — basis ZERO. So the
 * card never asked for its own height; it took whatever was left after the PR
 * plate, the AI line, the stat row and the coach-units line had taken theirs.
 * On a phone that was less than the card's content, and `overflow: hidden` with
 * `justifyContent: center` trimmed the excess off BOTH ends.
 *
 * And it could not scroll out of it: a child that shrinks to fit never creates
 * overflow, so `overflowY: auto` had nothing to do. The more the app had to
 * celebrate — a PR, plus an AI line, plus the coach-units gag — the more of the
 * card got cut. It failed hardest on exactly the sessions worth celebrating.
 *
 * This is the same family as the workout-logger bugs in loggerLayout.test.ts:
 * a flex child that shrinks when it should have pushed the page into scrolling.
 */

const SRC = readFileSync(join(process.cwd(), "src/components/CelebrationScreen.tsx"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the big card takes its own height and never shrinks below it", () => {
  assert.match(
    CODE,
    /const bigCard: React\.CSSProperties = \{[^}]*flexGrow: 1, flexShrink: 0, flexBasis: "auto"/,
    "bigCard must be grow 1 / shrink 0 / basis auto — `flex: 1` is basis 0 and is what cut the card in half",
  );
  assert.ok(
    !/const bigCard: React\.CSSProperties = \{[^}]*flex: 1,/.test(CODE),
    "`flex: 1` is back on bigCard",
  );
});

test("the scroll lives on an inner box, not the overlay", () => {
  // If the overlay scrolls, the Done button scrolls with it and a tall card
  // puts the only way off this screen below the fold.
  assert.match(CODE, /const scrollArea: React\.CSSProperties = \{\s*flex: "1 1 auto",\s*overflowY: "auto"/);
  // Just the overlay's own declaration — up to its closing `};`, or the check
  // reads straight through into scrollArea and passes on the wrong block.
  const overlayBlock = CODE.slice(CODE.indexOf("const overlay: React.CSSProperties"));
  const overlayDecl = overlayBlock.slice(0, overlayBlock.indexOf("};"));
  assert.match(overlayDecl, /overflow: "hidden"/);
  assert.ok(!/overflowY: "auto"/.test(overlayDecl), "the overlay must not be the scroller");
});

test("Done is pinned outside the scrolling region", () => {
  const scroll = CODE.indexOf("<div style={scrollArea}>");
  const closeScroll = CODE.indexOf("</div>\n      {/* Pinned");
  const doneBar = CODE.indexOf("<div style={doneBar}>");
  assert.ok(scroll !== -1, "the scroll region must exist");
  assert.ok(doneBar > scroll, "Done comes after the scroll region opens");
  assert.ok(
    CODE.indexOf("style={doneBtn}") > doneBar,
    "the Done link belongs inside the pinned bar",
  );
  // And it clears the phone's own bottom bar.
  assert.match(CODE, /env\(safe-area-inset-bottom\)/);
});

test("the card still clips its own background art", () => {
  // overflow:hidden on the card is doing real work — the rays, the spotlight
  // gradient and the floor line all bleed past the rounded corners without it.
  // The fix was to stop the card being too small, not to stop it clipping.
  assert.match(CODE, /const bigCard: React\.CSSProperties = \{[^}]*overflow: "hidden"/);
});
