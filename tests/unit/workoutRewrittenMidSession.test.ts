import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx", "utf8");

// 3 Sep. Dustin: "I was reprogramming mid session. I replaced the workout I was
// actually logging through claude project."
//
// Jennifer's day had every prescribed exercise deleted and recreated four
// minutes into her session. Every tick then wrote a foreign key that no longer
// existed, and she was shown the constraint name.

test("a draft cannot resurrect an exercise the workout no longer has", () => {
  // This is what made the failure survive a reload: the draft handed the dead
  // ids straight back, so reloading landed her in exactly the same place.
  assert.ok(
    !/if \(!merged\[peId\]\) merged\[peId\] = draft\[peId\];/.test(src),
    "hydration copies in draft keys the server day does not have — dead ids survive a reload"
  );
  assert.match(
    src,
    /if \(!merged\[peId\] && prev\[peId\]\) merged\[peId\] = draft\[peId\];/,
    "a draft key must only be restored when the exercise is still in the workout"
  );
});

test("a rewritten workout is explained, not shown as a constraint name", () => {
  assert.match(src, /err\?\.code === "23503"/, "the foreign-key violation must be recognised");
  assert.match(src, /set_logs_prescribed_exercise_id_fkey/, "the specific constraint must be matched");
  assert.match(
    src,
    /Your coach just updated this workout/,
    "the client needs a sentence they can act on, not the constraint name"
  );
});

test("it reloads rather than remapping the sets onto the new exercises", () => {
  // If the workout was replaced, the old sets may not belong to the movements
  // that replaced them. Reassigning them would invent training that never
  // happened, which is worse than losing an unticked set.
  const branch = src.slice(src.indexOf("const staleExercise ="), src.indexOf("const staleExercise =") + 900);
  assert.match(branch, /window\.location\.reload\(\)/, "the stale branch must reload");
  assert.ok(
    !/remap|reassign|closest|matchByPosition/i.test(branch),
    "sets must not be silently remapped onto whatever replaced them"
  );
});
