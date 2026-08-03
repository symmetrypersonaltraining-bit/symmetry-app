import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE UPLOAD BUTTON MUST NOT ASK FOR THE CAMERA.
 *
 * Dustin: "also I need a image upload option in case I take them on diff
 * camera." The button already said "Capture / Upload" — it just could not
 * upload. One input carried capture="environment", and on most Android builds
 * that is honoured by dropping the gallery out of the picker entirely, so a set
 * shot on a real camera and copied to the phone had no way in at all.
 *
 * That is a one-attribute regression that a screenshot cannot catch and a
 * reviewer will not notice, because the markup looks deliberate either way.
 * Hence a test.
 *
 * The poses are asserted in HIS order:
 *   "front relaxed, front double bicep, front lat spread, side chest left,
 *    side tricep left, rear double bicep, rear lat spread, side chest right,
 *    side tricep right, thighs and abs, most muscular"
 * The order is the feature — a run through the list is a rehearsal of the
 * mandatories in the order they are called.
 */

const SRC = readFileSync(join(process.cwd(), "src/components/ProgressPhotos.tsx"), "utf8");

const EXPECTED = [
  "front-relaxed",
  "front-double-biceps",
  "front-lat-spread",
  "side-chest-left",
  "side-triceps-left",
  "rear-double-biceps",
  "rear-lat-spread",
  "side-chest-right",
  "side-triceps-right",
  "abs-and-thighs",
  "most-muscular",
];

function poseKeys(): string[] {
  const block = SRC.slice(SRC.indexOf("const POSES"), SRC.indexOf("// Photos taken under the old"));
  return [...block.matchAll(/\{ key: "([a-z-]+)"/g)].map((m) => m[1]);
}

test("all eleven mandatories are present, in the order they are called", () => {
  assert.deepEqual(poseKeys(), EXPECTED);
});

test("left and right are shot separately", () => {
  // Side chest and side triceps on one side only flatters whichever side is
  // stronger — the opposite of the point at a gym called Symmetry.
  for (const k of ["side-chest-left", "side-chest-right", "side-triceps-left", "side-triceps-right"]) {
    assert.ok(poseKeys().includes(k), `${k} must exist`);
  }
});

test("every pose carries a coaching cue", () => {
  const block = SRC.slice(SRC.indexOf("const POSES"), SRC.indexOf("// Photos taken under the old"));
  const tips = [...block.matchAll(/tip: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tips.length, EXPECTED.length, "one tip per pose");
  for (const t of tips) assert.ok(t.length > 40, `a cue that short is not a cue: "${t}"`);
});

test("the upload input has NO capture attribute; the camera input does", () => {
  // Arrow functions in the props mean "not a >" cannot be the terminator.
  const inputs = [...SRC.matchAll(/<input\s+ref=\{(?:cam|file)Ref\}[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.equal(inputs.length, 2, "expected exactly two file inputs: camera and upload");
  const cam = inputs.find((i) => i.includes("camRef"))!;
  const up = inputs.find((i) => i.includes("fileRef"))!;
  assert.match(cam, /capture=/, "the camera button should still open the camera");
  assert.doesNotMatch(up, /capture=/, "capture on the upload input hides the gallery on Android");
  assert.match(up, /multiple/, "a full set should be selectable at once");
});

test("photos taken under the old six-pose list keep their names", () => {
  // Nothing may render as a bare "Photo" just because the picker changed.
  for (const legacy of ["front-flexed", "side-left", "side-right", "back-relaxed", "back-flexed"]) {
    assert.ok(SRC.includes(`"${legacy}":`), `${legacy} must still resolve to a label`);
  }
});

test("an undecodable file is refused, not stored as a broken JPEG", () => {
  // A RAW file off a real camera uploaded under contentType image/jpeg becomes a
  // permanently broken thumbnail that nobody can explain later.
  assert.match(SRC, /async function compressImage\([^)]*\): Promise<Blob \| null>/);
  assert.match(SRC, /if \(!blob\)/);
  assert.match(SRC, /RAW camera files/);
});
