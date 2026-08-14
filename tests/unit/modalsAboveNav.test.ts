import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A MODAL MUST SIT ABOVE THE BOTTOM NAV.
 *
 * Dustin, 14 Aug, with a screenshot of the workout logger's time picker:
 * "can't see button on add custom workout at the bottom its covered."
 *
 * The cause was not the sheet. AppBottomNav is `fixed bottom-0 ... z-50`, and
 * every bottom sheet in the app was ALSO z-50 — and a sheet rendered inside the
 * page renders BEFORE the nav in document order, so at equal z-index the nav
 * wins and parks itself over the sheet's confirm button. The button is there;
 * it is under the navigation bar, and on a phone that is indistinguishable from
 * broken.
 *
 * It was a whole class of bug rather than one screen: eleven modal roots across
 * nine files, all one tie away from the same failure, and it happened to be
 * found on the one where the covered control was the only way out of the sheet.
 *
 * So the rule is now checkable: nothing that covers the screen may share the
 * nav's z-index. The FAB layer is the deliberate exception — it is a floating
 * button, not a modal, and it is SUPPOSED to sit under the nav.
 */

const ROOT = process.cwd();

/** Not a modal: a pointer-events-none layer holding the floating ✦. */
const ALLOWED_AT_NAV_LEVEL = ["src/components/AIAssistant.tsx"];

test("the bottom nav's z-index is still the one this rule is written against", () => {
  const nav = readFileSync(join(ROOT, "src/components/AppBottomNav.tsx"), "utf8");
  assert.match(
    nav,
    /fixed bottom-0[^"]*z-50/,
    "AppBottomNav's z-index changed — this whole test is calibrated to z-50 and needs re-reading",
  );
});

test("no full-screen modal shares the nav's z-index", () => {
  const hits = execSync(
    `grep -rn "fixed inset-0 z-50" src --include=*.tsx || true`,
    { encoding: "utf8", cwd: ROOT },
  )
    .split("\n")
    .filter(Boolean)
    .filter((l) => !ALLOWED_AT_NAV_LEVEL.some((f) => l.startsWith(f)));

  assert.deepEqual(
    hits,
    [],
    "a modal is back at z-50, which the bottom nav wins on document order — its bottom button will be unpressable on a phone:\n" +
      hits.join("\n"),
  );
});

test("the logger's sheets clear the phone's own gesture bar too", () => {
  // Beating the app's nav is not enough on a device whose system bar overlays
  // the viewport — the confirm button needs the inset as well.
  const src = readFileSync(join(ROOT, "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"), "utf8");
  const withInset = (src.match(/env\(safe-area-inset-bottom\)/g) || []).length;
  assert.ok(
    withInset >= 3,
    `only ${withInset} of the logger's sheets pad for the safe-area inset; the confirm button can still land under a gesture bar`,
  );
});
