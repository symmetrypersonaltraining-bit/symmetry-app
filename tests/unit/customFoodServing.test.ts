import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A SERVING SIZE THAT WAS ONLY A LABEL.
 *
 * Jerry, 2026-07-31: "When u add a custom food and change the serving size the
 * macros dont change." The food catalog caught him proving it — two "Ultra Beer"
 * rows 61 seconds apart, serving_desc "1 serving" then "10 servings", macros
 * byte-identical (0.5P / 2.5C / 0F, 12 kcal) both times. He filed the report 38
 * seconds after saving the next one.
 *
 * The create-custom-food form wrote whatever you typed straight into the log at
 * multiplier 1. The serving box was persisted, printed on the item and never
 * multiplied by anything — while the SEARCH path has had working amount/unit
 * scaling since 7/17. Two doors into the same log, one of them doing arithmetic.
 *
 * The fix routes a newly created food through the same picker every searched
 * food goes through, so the typed serving becomes its base and the amount
 * rescales it. No new maths — servingsFor() and pickItem() already existed.
 *
 * This is the fourth report in this family (7/14 units, 7/17 conversions, 7/29
 * amount+unit, this), which is why the shared path is asserted rather than the
 * behaviour of one form.
 */

const SRC = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"), "utf8");

function saveCustomFoodBody(): string {
  const start = SRC.indexOf("async function saveCustomFood()");
  assert.notEqual(start, -1, "saveCustomFood must still exist");
  const end = SRC.indexOf("\n  }", start);
  return SRC.slice(start, end);
}

test("a newly created food goes through the amount picker", () => {
  const body = saveCustomFoodBody();
  assert.match(body, /openPicked\(mapRow\(saved, true\)\)/, "the saved row must open the picker, not bypass it");
  assert.match(body, /setCreating\(false\)/);
});

test("the picker seeds from the food's own serving, and the multiplier is real", () => {
  // openPicked parses the serving into amount+unit; mult drives every macro.
  assert.match(SRC, /function openPicked\(f: CatalogFood\) \{\s*\n\s*const ps = parseServing\(f\.serving\);/);
  // 17 Aug: named units ("1 egg") were added, so mult is no longer a single
  // call — a named unit is resolved against the food's serving_options first.
  // The dimensional path must remain the FALLBACK, not be replaced: it is what
  // handles grams, ounces and every food without serving_options, which is the
  // whole legacy `foods` table.
  assert.match(SRC, /servingsFor\(amtNum, unit, picked\.serving\)/,
    "the dimensional multiplier is gone — grams and ounces no longer scale anything");
  assert.match(SRC, /const mult = namedMult \?\? /,
    "mult no longer prefers the named unit, so '2 eggs' falls through to a unit servingsFor cannot parse");
});

test("a named unit never silently reads as zero", () => {
  // multiplierForNamed returns null when it cannot answer — no base weight, an
  // unknown unit — and `??` is deliberate: `||` would swallow a legitimate
  // small multiplier the same way it swallows null, and 0.44 of an egg is
  // exactly the number this feature exists to produce.
  assert.doesNotMatch(SRC, /const mult = namedMult \|\| /,
    "|| treats a real multiplier of 0 as 'no answer' and falls through to the wrong branch");
});

test("a named unit is only offered when its weight is actually known", () => {
  // The legacy `foods` table has no serving_grams. Listing "egg" for a food
  // whose base weight is unknown produces a unit that cannot be converted, and
  // the macro line would read as a dash while the client thinks they logged it.
  assert.match(SRC, /picked\.named\.filter\(\(x\) => picked\.baseGrams\)/,
    "named units are offered for foods with no base weight to scale them against");
});

test("a failed catalog write still logs what they typed", () => {
  // Losing someone's typed macros because the catalog insert failed would be a
  // worse bug than the one being fixed.
  const body = saveCustomFoodBody();
  assert.match(body, /if \(saved && id\)/);
  assert.match(body, /onPick\(\{ n: cf\.name\.trim\(\)/, "the fallback path must remain");
});

test("the create form says what the macros are FOR", () => {
  // "= 210 cal" next to an ignored serving box is what made the old behaviour
  // look intentional.
  assert.match(SRC, /cal per \{cf\.serving\.trim\(\) \|\| "1 serving"\}/);
});

test("foods added to a plan meal are listed on the card that counts them", () => {
  // planMealMacros adds __added to the meal's calories; the card listed only
  // meal_items, so it read higher than the food shown with nothing to explain
  // the gap. Madeleine's 30 Jul breakfast: 393 cal of items listed, 593 printed.
  const client = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
  assert.match(client, /\.\.\.\(\(rowOv\?\.__added \|\| \[\]\) as \{ name: string; servings\?: number \}\[\]\)\.map/);
  assert.match(client, /added\?: boolean/);
  assert.match(client, />ADDED</);
});
