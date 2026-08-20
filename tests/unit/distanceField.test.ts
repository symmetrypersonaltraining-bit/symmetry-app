// Distance as a tracked field. Dustin, 12 Aug: "suitecase do distance."
//
// It could not simply be switched on: `distance` was not in the logger's chip
// list, so setting it on a movement produced a set row with NO inputs at all.
//
// The unit split is the part worth testing. set_logs.distance_meters is metric
// and predates this; the app shows imperial everywhere. Storing feet in a
// column named _meters is the silent unit bug that turns up months later in a
// chart nobody can explain.

import { test } from "node:test";
import assert from "node:assert/strict";
import { feetToMeters, metersToFeet } from "../../src/lib/distanceField.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("feet typed in become metres stored", () => {
  assert.equal(feetToMeters("20"), 6.096);
  assert.equal(feetToMeters("100"), 30.48);
});

test("metres stored come back as the feet that were typed", () => {
  for (const ft of ["20", "50", "100", "7.5"]) {
    assert.equal(metersToFeet(feetToMeters(ft)), ft.replace(/\.0$/, ""));
  }
});

test("an empty or half-typed box stores nothing, not zero", () => {
  // A 0 would claim the carry covered no distance.
  for (const v of ["", "   ", null, undefined, "abc", "-5"]) {
    assert.equal(feetToMeters(v as string), null, `${JSON.stringify(v)} must not become a number`);
  }
});

test("zero is a real value and survives", () => {
  assert.equal(feetToMeters("0"), 0);
  assert.equal(metersToFeet(0), "0");
});

test("nothing stored shows an empty box", () => {
  assert.equal(metersToFeet(null), "");
  assert.equal(metersToFeet(undefined), "");
  assert.equal(metersToFeet(NaN), "");
});

test("the logger actually renders and saves the field", () => {
  // Without all three of these, switching a movement to distance gives a set
  // row with no input — which is why it could not just be set in the library.
  const src = readFileSync(
    join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"), "utf8");
  assert.match(src, /"weight", "reps", "time", "distance", "each_side"/, "distance must be an offered chip");
  assert.match(src, /xFields\.includes\("distance"\)/, "session mode must render a distance input");
  assert.match(src, /sFields\.includes\("distance"\)/, "list mode must render a distance input");
  assert.equal(
    (src.match(/distance_meters: feetToMeters\(s\.distance\)/g) ?? []).length, 3,
    // Three since 20 Aug: logSet, logAllCurrentSets, and saveTypedSet — the
    // on-blur write for a set that has been typed but not ticked. Missing any
    // one of them loses distance in that path only, which is the hardest kind
    // of loss to notice.
    "EVERY set writer must persist distance — there are three, and missing one loses data in that mode only",
  );
});
