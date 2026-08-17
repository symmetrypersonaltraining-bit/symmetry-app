// "1 egg", not "44 g".
//
// Dustin, 17 Aug: "when I try to add a food from library I need to be able to
// adjust it by unit of measurements. for exp 1 egg, 2 eggs etc."
//
// Every fixture below is a real serving_options value from food_catalog, read
// on 17 Aug — including HARD BOILED EGGS, the exact row in his screenshot.

import test from "node:test";
import assert from "node:assert/strict";
import {
  unitLabelOf,
  countIn,
  namedServings,
  multiplierForNamed,
  defaultAmountFor,
} from "../../src/lib/servingOptions.ts";

// food_catalog: HARD BOILED EGGS, serving_desc "100 g", serving_grams 100.
const HARD_BOILED_EGGS = [
  { desc: "100 g", grams: 100 },
  { desc: "1 oz", grams: 28.35 },
  { desc: "1 EGG (44 g)", grams: 44 },
];

// ─── his actual food ────────────────────────────────────────────────────────

test("his hard boiled eggs offer an egg, and only an egg", () => {
  const named = namedServings(HARD_BOILED_EGGS);
  assert.deepEqual(named, [{ label: "egg", gramsPerUnit: 44 }],
    "grams and ounces are already offered dimensionally — listing them again duplicates the dropdown");
});

test("1 egg and 2 eggs scale off the 100 g base the macros are stored against", () => {
  const named = namedServings(HARD_BOILED_EGGS);
  assert.equal(multiplierForNamed(1, "egg", named, 100), 0.44);
  assert.equal(multiplierForNamed(2, "egg", named, 100), 0.88);
});

// ─── the doubling trap ──────────────────────────────────────────────────────

test("a plural description gives the weight of ONE, not of the pair", () => {
  // Real row: "2 Tbsp (30 g)" appears 3,497 times in the catalog. Taking 30 as
  // the unit weight silently doubles every tablespoon logged from it, and
  // nothing on screen would look wrong.
  const named = namedServings([{ desc: "2 Tbsp (30 g)", grams: 30 }]);
  assert.deepEqual(named, [{ label: "tbsp", gramsPerUnit: 15 }]);
});

test("a fractional description gives the weight of a whole one", () => {
  // Real row: "0.25 cup (30 g)" — a cup is 120 g, not 30.
  assert.deepEqual(namedServings([{ desc: "0.25 cup (30 g)", grams: 30 }]),
    [{ label: "cup", gramsPerUnit: 120 }]);
  // And the written-fraction form.
  assert.equal(countIn("1/2 cup"), 0.5);
  assert.deepEqual(namedServings([{ desc: "1/2 cup", grams: 60 }]),
    [{ label: "cup", gramsPerUnit: 120 }]);
});

test("counts default to one when the description has no number", () => {
  assert.equal(countIn("cup"), 1);
  assert.equal(countIn(""), 1);
  assert.equal(countIn("0 slices"), 1, "a zero count must not divide by zero");
});

// ─── label cleanup ──────────────────────────────────────────────────────────

test("the gloss and the count are stripped, and the name is lowercased", () => {
  assert.equal(unitLabelOf("1 EGG (44 g)"), "egg");
  assert.equal(unitLabelOf("1 Egg (44 g)"), "egg");
  assert.equal(unitLabelOf("1 sandwich"), "sandwich");
  assert.equal(unitLabelOf("2 Tbsp (30 ml)"), "tbsp");
});

test("plurals become singular, but short units are left alone", () => {
  assert.equal(unitLabelOf("2 slices"), "slice");
  assert.equal(unitLabelOf("1 oz"), null, "oz is offered dimensionally already");
  assert.equal(unitLabelOf("3 glass"), "glass", "a trailing 'ss' is not a plural");
});

test("units already offered dimensionally are not offered twice", () => {
  for (const d of ["100 g", "1 oz", "240 ml", "1 kg", "2 lb", "8 fl oz"]) {
    assert.equal(unitLabelOf(d), null, `${d} duplicates what unitsForServing already gives`);
  }
});

test("Open Food Facts' raw measurement codes are not shown to anyone", () => {
  // "1 ONZ (28 g)" is the single most common non-metric option in the catalog
  // — 16,181 rows — and ONZ/OZA are UN/ECE codes for ounce and fluid ounce.
  // In a dropdown they read as gibberish, and both dimensions already exist.
  assert.equal(unitLabelOf("1 ONZ (28 g)"), null);
  assert.equal(unitLabelOf("8 OZA (240 ml)"), null);
});

test("a description with no name left is dropped, not shown blank", () => {
  assert.equal(unitLabelOf("1 (44 g)"), null);
  assert.equal(unitLabelOf("   "), null);
  assert.equal(unitLabelOf("2"), null);
});

// ─── the column is jsonb from two importers, so tolerate anything ───────────

test("a malformed entry drops out without taking the dropdown with it", () => {
  const named = namedServings([
    { desc: "1 EGG (44 g)", grams: 44 },
    { desc: "1 bar" },                        // no grams
    { desc: "1 slice", grams: 0 },            // zero weight
    { desc: "1 stick", grams: -5 },           // negative
    { grams: 30 },                            // no desc
    null,
    "1 cup",
    { desc: "1 packet", grams: "not a number" },
  ] as unknown[]);
  assert.deepEqual(named, [{ label: "egg", gramsPerUnit: 44 }]);
});

test("a non-array value yields nothing rather than throwing", () => {
  for (const v of [null, undefined, {}, "1 egg", 42]) {
    assert.deepEqual(namedServings(v), []);
  }
});

test("the same unit named twice appears once", () => {
  const named = namedServings([
    { desc: "1 slice (28 g)", grams: 28 },
    { desc: "2 slices (56 g)", grams: 56 },
  ]);
  assert.equal(named.length, 1, "a dropdown with two 'slice' rows cannot be chosen between");
  assert.equal(named[0].gramsPerUnit, 28, "the first spelling wins, and it agrees with the second anyway");
});

// ─── the legacy table has no base weight ────────────────────────────────────

test("a food with no known base weight offers no multiplier rather than a wrong one", () => {
  // The legacy `foods` table has serving text and no serving_grams. Inventing
  // a base would put confident, wrong macros on the screen.
  const named = [{ label: "egg", gramsPerUnit: 44 }];
  assert.equal(multiplierForNamed(1, "egg", named, null), null);
  assert.equal(multiplierForNamed(1, "egg", named, 0), null);
  assert.equal(multiplierForNamed(1, "egg", named, undefined), null);
});

test("an unknown unit or a non-amount yields null, never NaN", () => {
  const named = [{ label: "egg", gramsPerUnit: 44 }];
  assert.equal(multiplierForNamed(1, "slice", named, 100), null);
  assert.equal(multiplierForNamed(0, "egg", named, 100), null);
  assert.equal(multiplierForNamed(-2, "egg", named, 100), null);
  assert.equal(multiplierForNamed(NaN, "egg", named, 100), null);
});

// ─── what the box opens on ──────────────────────────────────────────────────

test("a food stored per 100 g opens on one egg, not one hundred grams", () => {
  const named = namedServings(HARD_BOILED_EGGS);
  assert.deepEqual(defaultAmountFor("100 g", named, 100), { amount: 1, unit: "egg" });
});

test("a food already described as a real portion is left alone", () => {
  // "1 bar" is how someone eats it. Overriding that is changing an answer that
  // was already right.
  const named = [{ label: "bar", gramsPerUnit: 60 }];
  assert.equal(defaultAmountFor("1 bar", named, 60), null);
  assert.equal(defaultAmountFor("1 sandwich", named, 200), null);
});

test("no named unit or no base weight means no override", () => {
  assert.equal(defaultAmountFor("100 g", [], 100), null);
  assert.equal(defaultAmountFor("100 g", [{ label: "egg", gramsPerUnit: 44 }], null), null);
});

test("millilitres are a storage unit too", () => {
  const named = [{ label: "glass", gramsPerUnit: 240 }];
  assert.deepEqual(defaultAmountFor("100 ml", named, 100), { amount: 1, unit: "glass" });
});
