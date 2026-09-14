// ============================================================================
// BACK CLOSES WHAT IS ON TOP, ON EVERY SCREEN.
//
// Dustin, 13 Sep: *"Yes fix them all crash safe on logger."*
//
// His rule, set 11 Sep: "When you hit either button, it needs to go back one
// page — the previous screen you were looking at." An overlay IS the screen you
// are looking at; it was not a history entry, so Back popped the whole page.
//
// BackButtonGuard never covered any of it — it only binds inside a Capacitor
// shell, and Capacitor is deliberately out of package.json, so on a real phone
// this is the browser's own Back with nothing listening.
//
// THE ONE THAT WOULD HAVE BEEN A BUG: the workout logger already had its own
// popstate listener for session mode. Adding a second would mean one press does
// two things — closing the swap modal AND dropping out of session mode beneath
// it — because every listener on the window fires. So the logger was moved onto
// the same hook with one combined depth instead.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HOOK = read("src/lib/nav/useBackClosesOverlay.ts");

/** Overlays moved onto the shared hook. */
const ON_THE_HOOK = [
  "src/app/(app)/nutrition/v3/NutritionV3Client.tsx",
  "src/app/(app)/nutrition/GroceryListSheet.tsx",
  "src/app/(app)/nutrition/v3/BarcodeScanner.tsx",
  "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx",
  "src/components/WorkoutDaySheet.tsx",
  "src/components/AddWorkoutButton.tsx",
  "src/components/NotificationCenter.tsx",
  "src/components/FeedbackButton.tsx",
  "src/components/HeaderAssist.tsx",
  "src/components/GoalSetSheet.tsx",
  "src/components/ProgressPhotos.tsx",
];

/** Trainer-side modals, second batch. */
const TRAINER_SIDE = [
  "src/app/(app)/clients/NewClientModal.tsx",
  "src/app/(app)/clients/[clientId]/AssignProgramModal.tsx",
  "src/app/(app)/clients/[clientId]/InviteClientButton.tsx",
  "src/app/(app)/schedule/ScheduleClient.tsx",
  "src/app/(app)/payments/PaymentsClient.tsx",
  "src/app/(app)/recipes/RecipesClient.tsx",
  "src/app/(app)/library/exercises/ExerciseLibraryClient.tsx",
  "src/components/SaturdayReview.tsx",
];

/** Already correct before this, by the same pattern. Left alone deliberately. */
const ALREADY_HANDLED = ["src/components/VideoZoom.tsx", "src/components/ChartZoom.tsx"];

describe("back closes every overlay", () => {
  for (const f of ON_THE_HOOK) {
    it(`${f.split("/").pop()} answers Back`, () => {
      assert.match(read(f), /useBackClosesOverlay\(/, `${f} no longer closes on Back`);
    });
  }

  for (const f of TRAINER_SIDE) {
    it(`${f.split("/").pop()} answers Back`, () => {
      assert.match(read(f), /useBackClosesOverlay\(/, `${f} no longer closes on Back`);
    });
  }

  for (const f of ALREADY_HANDLED) {
    it(`${f.split("/").pop()} still handles Back its own way`, () => {
      assert.match(read(f), /popstate/, `${f} lost its Back handling`);
    });
  }

  it("the logger has exactly ONE back listener", () => {
    // Two listeners on one window means one press does two things. The logger
    // had its own for session mode; it is on the shared hook now.
    const logger = read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx");
    assert.doesNotMatch(
      logger,
      /addEventListener\("popstate"/,
      "the logger registered its own popstate listener again — with the hook also bound, " +
        "one Back press will close an overlay AND drop out of session mode underneath it",
    );
    assert.match(logger, /sessionMode \? 1 : 0/, "session mode must still be a level");
  });

  it("it is crash safe, which was the condition of touching the logger", () => {
    assert.match(HOOK, /typeof window === "undefined"/, "SSR guard gone");
    assert.match(HOOK, /typeof window\.history\.pushState !== "function"/,
      "a browser without pushState must degrade, not throw");
    assert.ok((HOOK.match(/catch \{/g) || []).length >= 3, "the history calls must stay wrapped");
  });

  it("a router navigation does not get undone on unmount", () => {
    // Half these overlays are unmounted by the parent rather than closed, so
    // the entry is handed back on unmount — but a navigation unmounts them too,
    // and calling back() then would cancel the page the person just asked for.
    assert.match(HOOK, /st && typeof st\.symOverlay === "number"/,
      "the unmount hand-back must check the entry on top is still ours");
  });

  it("nothing is pushed with nothing open", () => {
    // backFromHere.ts forbids, in capitals, an invented entry pushed so Back
    // "has somewhere to go" — that was the BackButtonGuard v2/v3 dead press.
    assert.match(HOOK, /if \(depth > pushed\.current\)/);
  });
});
