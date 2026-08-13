import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Lauren, on an iPhone, 2026-08-13: "can't scroll down to log weight."
//
// Her screenshot showed the Body Weight sheet with the chart and the tiles
// visible, the "View Full Progress" button — the way to logging — sliced off
// under the bottom nav, and the coach's face sitting on top of her Low tile.
// Three separate faults in one sheet, none of which reproduce on a desktop.

const SRC = fs.readFileSync(
  path.join(process.cwd(), "src/app/(app)/home/ClientDashboard.tsx"),
  "utf8"
);
const SHEET = SRC.slice(SRC.indexOf("fixed inset-0") - 400, SRC.indexOf("View Full Progress"));

test("the sheet is sized to the visible viewport, not the iOS large one", () => {
  // `85vh` on iOS measures against the viewport as it would be with the browser
  // chrome hidden. The panel ends up taller than the screen, its bottom is below
  // the fold, and there is nothing to scroll because the PANEL is not
  // overflowing — the viewport is. That is the whole "can't scroll down".
  assert.doesNotMatch(SHEET, /maxHeight: "\d+vh"/, "the metric sheet is back on vh and will overflow on iPhone");
  assert.match(SHEET, /maxHeight: "\d+dvh"/, "the metric sheet must be sized in dvh");
});

test("its bottom clears the fixed bottom nav and the home indicator", () => {
  assert.match(
    SHEET,
    /paddingBottom: "calc\(env\(safe-area-inset-bottom\) \+ \d+px\)"/,
    "the sheet's last control sits under the bottom nav again"
  );
});

test("it sits above the floating coach, like every other sheet", () => {
  // The coach fab is z-1100. A sheet below that gets a cartoon face drawn on it.
  assert.match(SHEET, /z-\[1200\]/, "the metric sheet is below the coach button again");
  assert.doesNotMatch(SHEET, /inset-0 z-50\b/, "z-50 is under the floating coach");
});
