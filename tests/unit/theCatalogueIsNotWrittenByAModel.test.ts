// A MODEL DOES NOT GET TO WRITE food_catalog.
//
// The rule the whole nutrition stack rests on (src/lib/nutrition/foodResolve.ts):
// a macro figure comes from a food_catalog row, never from a model. Found 4 Sep,
// sweeping every path after Dustin: "I dont want to find this accuracy problem
// again anywhere. find it from every path n get it fixed."
//
// /api/nutrition-ai/verify-food inverted that rule at its source. On a "high"
// confidence reply it overwrote a row's protein, carbs, fats and kcal with the
// model's numbers and set verified = true — the flag describeCandidates renders
// as [USDA] and PICK_SYSTEM tells the picker to prefer. It would have made a
// Haiku recollection indistinguishable from a lab measurement, to a model that
// had been told to trust the flag.
//
// Nothing validated the reply either. And the basis could move silently: the
// row went to the model with serving_desc, serving_grams AND serving_options,
// the prompt asked for "the stated serving", and the columns written mean per
// serving_grams. A scanned bar at serving_grams 100 carrying "1 bar (55 g)" is
// exactly the high-confidence case, and its per-bar label numbers would land in
// the per-100 g columns — every log of that food ~45% light, silently.
//
// Measured before changing it: zero rows carried ai_verified_at and no caller
// existed in src/. It never fired. This is what keeps it that way.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/app/api/nutrition-ai/verify-food/route.ts"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the route does not write to the catalogue at all", () => {
  assert.ok(!/from\("food_catalog"\)\s*\.update\(/.test(code), "it is writing macros into the catalogue again");
  assert.ok(!/\.update\(/.test(code), "any write from this route is the bug");
});

test("nothing here can set the verified flag", () => {
  // verified means USDA-checked. A model recollection is not that, and the
  // picker has been told in as many words to trust the flag.
  assert.ok(!/verified: true/.test(code), "a model recollection would be labelled [USDA]");
  assert.ok(!/ai_verified_at:/.test(code));
});

test("it still reports, because the useful half was telling a person", () => {
  assert.match(code, /plausible: v\.plausible/);
  assert.match(code, /corrected: v\.corrected/);
  assert.match(code, /applied: false/);
});

test("the reply says which basis the numbers are against", () => {
  // The silent-basis-shift failure is the one that would never look wrong on
  // screen, so the answer carries what it is per.
  assert.match(code, /basis: food\.serving_grams != null \? `per \$\{food\.serving_grams\} g`/);
});
