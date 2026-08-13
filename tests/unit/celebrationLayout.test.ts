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

/**
 * THE ROTATION AND ITS MODULUS HAVE TO AGREE.
 *
 * `variant = seed % N` picks the concept, and every concept but the last is an
 * `else if (variant === K)`. So N and the set of K are two halves of one fact
 * written in two places, and nothing connects them.
 *
 * Both ways of getting it wrong are silent and neither shows up in review:
 *
 *   N too LOW  — the top concepts are simply unreachable. Ten screens written,
 *                shipped, and never seen by a single client. Nothing errors.
 *   N too HIGH — every unmatched index falls through to the terminal `else`, so
 *                one concept starts appearing several times as often as the
 *                rest. The rotation still "works", it just quietly stops being
 *                a rotation.
 *
 * That is exactly what happened adding these ten: `% 28` was bumped to `% 38`
 * and the blocks written separately. This makes the two agree or fail the build.
 */
test("every index the modulus can produce lands on a concept, and every concept is reachable", () => {
  const mod = CODE.match(/const variant = seed % (\d+);/);
  assert.ok(mod, "the variant rotation is no longer `seed % N` — this guard needs updating with it");
  const n = Number(mod![1]);

  const handled = [...CODE.matchAll(/variant === (\d+)/g)].map((m) => Number(m[1]));
  const set = new Set(handled);
  assert.equal(handled.length, set.size, `a variant index is handled twice: ${handled.join(", ")}`);

  // The terminal `else` catches whatever is left, so the explicit blocks must
  // cover 0..n-2 and the leftover must be exactly one index.
  const missing: number[] = [];
  for (let i = 0; i < n; i++) if (!set.has(i)) missing.push(i);
  assert.equal(
    missing.length,
    1,
    `${missing.length} indices fall through to the terminal else (${missing.join(", ")}) — ` +
      `that concept shows ${missing.length}x as often as the rest. Bump or lower \`seed % ${n}\`.`,
  );

  const unreachable = handled.filter((k) => k >= n);
  assert.deepEqual(
    unreachable,
    [],
    `these concepts are written but can never be picked: ${unreachable.join(", ")} — \`seed % ${n}\` never reaches them`,
  );
});

// A Texas gym. An invoice card once shipped reading "AMOUNT DUE £0.00" because
// the person writing the joke was not thinking about where it would be read.
// Cheap to check, invisible to spot in review, and clients see it full-screen.
test("no foreign currency or metric units in the celebration copy", () => {
  for (const bad of ["£", "€", "¥"]) {
    assert.ok(!CODE.includes(bad), `celebration copy contains "${bad}" — this app is priced and weighed in US units`);
  }
  assert.ok(!/\bkg\b/.test(CODE), "celebration copy says kg — the whole app logs in lb");
});

test("the card still clips its own background art", () => {
  // overflow:hidden on the card is doing real work — the rays, the spotlight
  // gradient and the floor line all bleed past the rounded corners without it.
  // The fix was to stop the card being too small, not to stop it clipping.
  assert.match(CODE, /const bigCard: React\.CSSProperties = \{[^}]*overflow: "hidden"/);
});
