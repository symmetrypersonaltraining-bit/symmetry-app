import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { householdServing, storedDefaultServing, parseServingOption, type CatalogRow } from "../../src/lib/nutrition/foodResolve";

/**
 * EVERY FOOD OPENS ON A UNIT A PERSON WOULD SAY.
 *
 * Dustin, 8 Sep, after two weeks of it: *"i want it to open to the correct
 * grams for 1 serving, not '1 serving' so butter should open to 1 tbsp and you
 * can edit it if you had more than that. every single food in that database
 * needs to be set up like that."*
 *
 * The decision now lives in Postgres — food_default_serving() — and every row
 * carries its answer. This file pins the app half: the stored answer is USED,
 * it beats the guessing that came before it, and a stored "100 g" is not
 * mistaken for a portion.
 *
 * Why the old path stays underneath: the legacy `foods` table has no such
 * column, and neither does a row written before the fill. Deleting the fallback
 * would trade one silent wrong answer for another.
 */

const base: CatalogRow = {
  id: "f1", name: "Butter", brand: null,
  kcal: 717, protein: 0.9, carbs: 0.1, fats: 81,
  serving_desc: "100 g", serving_grams: 100, verified: true, source: "usda_branded",
};

test("the stored default is what the food opens on", () => {
  const row: CatalogRow = {
    ...base,
    serving_options: [{ desc: "100 g", grams: 100 }, { desc: "1 oz", grams: 28.35 }],
    default_serving_desc: "1 tbsp",
    default_serving_grams: 14,
  };
  const s = householdServing(row);
  assert.equal(s?.label, "tbsp");
  assert.equal(s?.gramsEach, 14);
});

test("a counted default divides: 2 tbsp of 32 g is a 16 g tablespoon", () => {
  const s = storedDefaultServing({ ...base, default_serving_desc: "2 tbsp", default_serving_grams: 32 });
  assert.equal(s?.label, "tbsp");
  assert.equal(s?.gramsEach, 16);
});

test("it beats the alphabetical cup that has twice doubled people's calories", () => {
  // The real "Bananas, raw" row: its own options lead with a volume, and the
  // 26 Aug bug was taking it. The stored default knows it is a banana.
  const row: CatalogRow = {
    ...base, name: "Bananas, raw", kcal: 89,
    serving_options: [{ desc: "1 cup, mashed", grams: 225 }, { desc: "1 cup, sliced", grams: 150 }],
    default_serving_desc: "1 medium",
    default_serving_grams: 118,
  };
  const s = householdServing(row);
  assert.equal(s?.label, "medium");
  assert.equal(s?.gramsEach, 118);
});

test("a stored '100 g' is the quoting basis, not a portion", () => {
  // 10 rows in the catalogue have nothing better to offer. They must fall
  // through to the old path rather than opening on "1 100 g", which is the
  // screen Dustin got on 28 Aug for a bagel.
  const row: CatalogRow = {
    ...base,
    serving_options: [{ desc: "1 bagel", grams: 95 }],
    default_serving_desc: "100 g",
    default_serving_grams: 100,
  };
  assert.equal(storedDefaultServing(row), null);
  assert.equal(householdServing(row)?.label, "bagel");
});

test("no stored default: the old path still answers", () => {
  const row: CatalogRow = { ...base, serving_options: [{ desc: "1 tbsp", grams: 14.2 }] };
  assert.equal(householdServing(row)?.label, "tbsp");
});

// ── the sheet, and the order it decides in ─────────────────────────────────

const SHEET = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"), "utf8");

test("the search sheet reads the stored default", () => {
  assert.match(SHEET, /default_serving_desc/);
  assert.match(SHEET, /defaultServing/);
});

test("HIS unit still wins over the stored default", () => {
  // Dustin, 8 Sep, answering which wins for the 299 foods he programmes: "A" —
  // his always. unitHeUses runs first and the stored default is guarded on it.
  const his = SHEET.indexOf("const his = unitHeUses(f.name)");
  const stored = SHEET.indexOf("if (!hisNamed && f.defaultServing)");
  assert.ok(his > 0 && stored > his, "the stored default must be checked after his unit map, and guarded on it");
});

test("the borrow only runs when nothing else answered", () => {
  assert.match(SHEET, /if \(!hisNamed && !f\.defaultServing && !heWeighsIt && !f\.named\.length && f\.baseGrams\)/);
});

// ── a half cup has no leading zero ─────────────────────────────────────────
//
// 494 foods opened on "1 .5 cup" — broccoli as "1 .5 cup, chopped", grapefruit
// as "1 .5 fruit". USDA writes a half cup as ".5 cup" with no leading zero, and
// BOTH Postgres parsers opened with `[0-9]+`, which needs a digit before the
// point. So the count fell back to 1 and the ".5" stayed glued to the label.
//
// TypeScript was never wrong here — `([\d.]+)?` matches a bare ".5" — and that
// is exactly why it lasted: the two parsers disagreed about three characters
// and nothing compared them until Postgres began writing a default for
// TypeScript to read back. These pin both halves to the same reading.

test("a bare leading decimal is a count, not part of the unit", () => {
  const s = parseServingOption({ desc: ".5 cup", grams: 114 });
  assert.equal(s?.label, "cup", 'USDA\'s ".5 cup" names a cup, not a ".5 cup"');
  assert.equal(s?.gramsEach, 228, "half a cup at 114 g makes a cup 228 g");
});

test("the leading zero is optional, and 1.5 is still one number", () => {
  assert.equal(parseServingOption({ desc: "0.5 cup", grams: 114 })?.gramsEach, 228);
  assert.equal(parseServingOption({ desc: "1.5 cup", grams: 342 })?.gramsEach, 228);
  assert.equal(parseServingOption({ desc: "1 large", grams: 50 })?.gramsEach, 50);
});

// ── and the Postgres half, which is the half that was broken ───────────────

const HALF_CUP_FIX = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908b_a_half_cup_has_no_leading_zero.sql"), "utf8");

test("both SQL parsers accept a bare leading decimal", () => {
  // `[0-9]*\.?[0-9]+` reads "1", "1.5" and ".5" alike. The old
  // `[0-9]+(?:\.[0-9]+)?` required the digit first and is what wrote "1 .5 cup".
  const fixed = HALF_CUP_FIX.match(/\[0-9\]\*\\\.\?\[0-9\]\+/g) ?? [];
  assert.ok(fixed.length >= 2,
    "food_serving_count_in AND food_serving_label_of both need the bare-decimal form");
  assert.doesNotMatch(HALF_CUP_FIX.replace(/^--.*$/gm, ""), /\[0-9\]\+\(\?:\\\.\[0-9\]\+\)\?/,
    "the old digit-first pattern must not survive in the executed SQL");
});

test("a garbled default can no longer be written", () => {
  assert.match(HALF_CUP_FIX, /food_default_serving_is_readable/);
  assert.match(HALF_CUP_FIX, /check \(default_serving_desc is null or default_serving_desc !~/);
});

// ── a cup of rice is not a cup of water ────────────────────────────────────
//
// His own programmed foods opened on a cup weighing 240 g, which is a cup of
// WATER — the number you get when nobody knew what the food was. Spinach was
// 700% over, oats 196%, rice 52%. Two faults fed it:
//
//   1. the row's own generic weight beat a map that held the real one;
//   2. "Canned tuna in water" matched the keyword 'water' (5 letters) over
//      'tuna' (4), because longest keyword wins.
//
// (2) is the same failure as 89d991fa — the word "water" answering for his
// protein shakes — fixed there for one food and here in the matcher.

const WATER_FIX = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908c_a_cup_of_rice_is_not_a_cup_of_water.sql"), "utf8");

test("how a tin is packed is not what is in the tin", () => {
  assert.match(WATER_FIX, /in\\s\+\(water\|oil\|brine\|juice\|syrup\)/,
    "the packing medium must come off the name before any keyword is looked up");
  // Stripped BEFORE the split, or 'water' is still a word to match on.
  const strip = WATER_FIX.indexOf("packed\\s+)?in\\s+");
  const split = WATER_FIX.indexOf("regexp_split_to_array");
  assert.ok(strip > 0 && strip < split, "the strip has to run before the name is cut into words");
});

test("the map wins only when the row is quoting water", () => {
  assert.match(WATER_FIX, /food_serving_water_density/);
  // Narrow on purpose: same unit, generic weight, and a map that disagrees.
  // A cup of milk is really ~244 g and must not be dragged to a rule's number
  // just for being close to 240.
  assert.match(WATER_FIX, /rule\.label = own_label/);
  assert.match(WATER_FIX, /abs\(own_per - generic\) < 0\.51/);
});

test("water density is the generic weight of a volume, not of a food", () => {
  // Plain string matching: these are literal SQL fragments, and treating
  // "cups?" as a pattern makes the "s?" optional and the check meaningless.
  for (const [unit, grams] of [["cups?", "240"], ["tbsp|tablespoons?", "15"], ["tsp|teaspoons?", "5"]] as const) {
    assert.ok(WATER_FIX.includes(`when label ~ '^(${unit})($|[^a-z])' then ${grams}`),
      `a ${unit.split("|").pop()} of water must be ${grams} g`);
  }
});
