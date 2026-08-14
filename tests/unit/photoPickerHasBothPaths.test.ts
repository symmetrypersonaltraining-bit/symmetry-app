import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A PHOTO ALREADY ON YOUR PHONE MUST BE USABLE.
 *
 * Megan Gautreaux, 14 Aug 2026: "Need a way to add a picture from my phone
 * instead of just take a Pic with camera to log food."
 *
 * `capture="environment"` on a file input opens the camera DIRECTLY. On Android
 * it does not offer a chooser at all — the gallery is simply unreachable, and so
 * is any photo taken with another app. Every food-photo input in the app had it,
 * so the only way to log a meal by photo was to be standing in front of it.
 *
 * The lesson was already learned once and written down. ProgressPhotos.tsx has
 * carried TWO inputs and this exact comment since it shipped:
 *
 *     Camera: capture stays. Upload: capture must NOT be here, or Android
 *     hides the gallery and photos from any other camera cannot get in.
 *
 * Food logging never got it. That is the failure this test exists to prevent —
 * not the attribute itself, which is correct on a camera button, but a surface
 * where the camera is the ONLY way in.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * The FOOD-photo inputs, named.
 *
 * The first version of this test checked per FILE — "does this file contain any
 * capture-free input" — and a mutation proved it toothless: putting capture back
 * on MealPlanClient's quick-log picker still passed, because a DIFFERENT input
 * in the same file had no capture. A file-level heuristic cannot tell which
 * button a person is actually pressing.
 *
 * So the surfaces are named. ProgressPhotos is deliberately absent: it has a
 * genuine two-button camera/upload pair and is the pattern the others copied.
 */
const FOOD_PHOTO_INPUTS: Array<{ file: string; ref: string }> = [
  { file: "src/app/(app)/nutrition/MealPlanClient.tsx", ref: "photoRef" },
  { file: "src/app/(app)/nutrition/MealPlanClient.tsx", ref: "cameraRef" },
  { file: "src/app/(app)/nutrition/v3/NutritionV3Client.tsx", ref: "libRef" },
];

for (const { file, ref } of FOOD_PHOTO_INPUTS) {
  test(`${ref} in ${file.split("/").pop()} can reach the camera roll`, () => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const inputs = src.match(/<input[^>]*type="file"[^>]*>/g) ?? [];
    const mine = inputs.find((i) => i.includes(`{${ref}}`));
    assert.ok(mine, `${ref} no longer names a file input in ${file}`);
    assert.ok(
      !/capture=/.test(mine!),
      `${ref} has capture= again. On Android that opens the camera and hides the ` +
        `gallery entirely, so a photo already on the phone cannot be used to log ` +
        `food — which is exactly what Megan reported on 14 Aug.`,
    );
  });
}

test("the v3 food logger offers both, explicitly", () => {
  // Two rows rather than one chooser, because the two cases genuinely differ:
  // standing over the plate vs. remembering an hour later.
  const src = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(src, /libRef/, "the camera-roll input is gone from the v3 logger");
  assert.match(
    src,
    /Pick a photo you already took/,
    "the camera-roll row is gone — the input exists but nothing reaches it, which is " +
      "the same outcome as not having it",
  );
});
