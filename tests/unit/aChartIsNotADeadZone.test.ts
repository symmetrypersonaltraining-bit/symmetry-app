// The page would not scroll where a chart was.
//
// touchAction: "none" tells the browser "this element handles its own
// gestures", so a finger landing on the chart moved nothing. On a phone these
// charts are most of the width of the screen, so the client's own home page had
// a dead band across the middle of it.
//
// The home chart had no touch handlers at all — onMouseLeave was the only one —
// so it was buying nothing. The goal chart genuinely scrubs on touch, so it
// keeps the horizontal gesture and gives back the vertical one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
// Comments explaining why a rule exists must not be mistaken for breaking it.
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(join(root, p), "utf8"));

test("the home weight chart does not claim gestures it never handles", () => {
  const src = read("src/app/(app)/home/ClientDashboard.tsx");
  assert.ok(!/touchAction: "none"/.test(src),
    "a chart with no touch handlers must not block scrolling");
});

test("a chart that does not scrub has no touch handlers to justify it", () => {
  // If someone adds scrubbing later, this fails and they must revisit the
  // touchAction decision deliberately rather than by copy-paste.
  const src = read("src/app/(app)/home/ClientDashboard.tsx");
  assert.ok(!/onTouchStart|onTouchMove/.test(src),
    "this chart now handles touch — pick pan-y rather than leaving it unset");
});

test("the goal chart keeps its scrub and gives back the scroll", () => {
  const src = read("src/components/GoalCard.tsx");
  assert.match(src, /touchAction: "pan-y"/, "vertical scroll is still blocked");
  assert.match(src, /onTouchMove=\{onMove\}/, "the scrub was removed along with the block");
});
