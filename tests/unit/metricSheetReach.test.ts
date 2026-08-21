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

// The scrolling was only the symptom. Fixing the sheet's height got Lauren to
// the button, and the button was "View Full Progress" — a read-only dashboard.
//
// /log is a complete weigh-in and cardio screen that has been in the app the
// whole time with NOTHING linking to it: no button, no nav item, and the one
// deep link that pointed at logging (/progress?log=weight, from the Sunday
// reminder) went to a page that never read the parameter. A client could not
// enter a weight from anywhere.
test("there is a route from the app to the screen that takes a weigh-in", () => {
  // Comments do not ship, and both of these fixes document the old behaviour by
  // quoting it — a naive search matches its own explanation.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /href="\/log"/, "the metric sheet no longer offers a way to log a weigh-in");
  const logAt = code.indexOf('href="/log"');
  const progressAt = code.indexOf("View Full Progress");
  assert.ok(logAt < progressAt, "logging should come before the chart on a card somebody opened by tapping their weight");
});

test("the weigh-in nudge points at a screen that can take the number", () => {
  // SundayWeighInReminder (a full-screen Sunday takeover) was removed 21 Aug —
  // WeighInNudge already did the same job as a card, and the takeover also
  // fired at the trainer inside /client-preview. The property this test exists
  // to protect is unchanged: whatever asks for a weigh-in must lead somewhere
  // that actually records one.
  assert.ok(
    !fs.existsSync(path.join(process.cwd(), "src/components/SundayWeighInReminder.tsx")),
    "the Sunday weigh-in takeover is back",
  );
  const nudge = fs
    .readFileSync(path.join(process.cwd(), "src/components/WeighInNudge.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(nudge, /progress\?log=weight/, "the nudge points at a parameter no page reads");
  assert.match(nudge, /href="\/log-bodyfat"/, "the weigh-in nudge does not lead to a screen that saves a metric");
});

test("/log still exists and still writes a metric", () => {
  const log = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/log/LogClient.tsx"), "utf8");
  assert.match(log, /from\("metrics"\)\s*\.upsert\(/s, "the weigh-in screen no longer saves anything");
});
