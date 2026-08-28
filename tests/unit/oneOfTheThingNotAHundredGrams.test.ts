// "1 100 g" — what Dustin's screen said when he asked for one bagel.
//
// 28 Aug, typed into Adjust/edit: "thomas cinnamon swirl bagel w cream cheese".
// The sheet came back holding ONE item, reading:
//
//     Bagels Cinnamon Swirl        − [ 1 ] [ 100 g ▾ ] +
//     293 cal · P11 C58 F2
//
// The search half was right, and worth saying so: it found row
// abcb31a9-4240-4234-a336-54a5bddf2fff — name "Bagels Cinnamon Swirl", brand
// "Thomas" — which is exactly the food he named, brand included. That row also
// carries its own serving: [100 g, 1 oz, 1 bagel (95 g)].
//
// So the app had "1 bagel (95 g)" in its hand and charged him 100 g anyway.
//
// WHY. He named no measure, so the model filled `unit` with a placeholder —
// "each" / "serving" / "whole". A placeholder is a non-empty string, so it took
// the named-unit path; "bagel" is not an "each", so that missed; and the miss
// fell through to the last-resort branch, which labels the portion with the
// row's `serving_desc`. That column reads the literal string "100 g" on 574,372
// of 574,650 rows. Hence a unit box containing "100 g", a quantity of 1, and
// the line "1 100 g".
//
// The numbers below are the real row's, so this test fails against the version
// he was using and passes against the fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  householdServing,
  macrosFromRow,
  isGenericUnit,
  type CatalogRow,
} from "../../src/lib/nutrition/foodResolve.ts";

/** food_catalog row abcb31a9-4240-4234-a336-54a5bddf2fff, verbatim. */
const THOMAS_BAGEL: CatalogRow = {
  id: "abcb31a9-4240-4234-a336-54a5bddf2fff",
  name: "Bagels Cinnamon Swirl",
  brand: "Thomas",
  kcal: 294.74, protein: 10.53, carbs: 57.89, fats: 2.11,
  serving_desc: "100 g",
  serving_grams: 100,
  verified: false,
  source: null,
  serving_options: [
    { desc: "100 g", grams: 100 },
    { desc: "1 oz", grams: 28.35 },
    { desc: "1 bagel (95 g)", grams: 95 },
  ],
};

const kcal = (r: { p: number; c: number; f: number; amount: number; per_amount: number }) =>
  Math.round((r.p * 4 + r.c * 4 + r.f * 9) * (r.amount / r.per_amount));

test("the row's own countable serving is found", () => {
  assert.deepEqual(householdServing(THOMAS_BAGEL), { label: "bagel", gramsEach: 95 });
});

test("a placeholder unit means one of them, not a hundred grams", () => {
  // Every word the model reaches for when nobody named a measure.
  for (const placeholder of ["each", "serving", "whole", "piece", "portion", "item"]) {
    assert.equal(isGenericUnit(placeholder), true, `${placeholder} should read as "one of them"`);
    const r = macrosFromRow(THOMAS_BAGEL, 1, placeholder);
    assert.ok(r, `${placeholder} resolved to nothing`);
    assert.equal(r.unit, "bagel", `"${placeholder}" gave unit ${r.unit}`);
    assert.equal(kcal(r), 278, `"${placeholder}" priced the bagel at ${kcal(r)} cal`);
    // The exact string off his screen. It must not come back.
    assert.notEqual(`${r.amount} ${r.unit}`, "1 100 g");
  }
});

test("naming no measure at all does the same thing", () => {
  const r = macrosFromRow(THOMAS_BAGEL, 1, null);
  assert.ok(r);
  assert.equal(r.unit, "bagel");
  assert.equal(kcal(r), 278);
});

test("a real weight is still honoured exactly", () => {
  const r = macrosFromRow(THOMAS_BAGEL, 200, "g");
  assert.ok(r);
  assert.equal(r.unit, "g");
  assert.equal(r.amount, 200);
  assert.equal(kcal(r), 585);          // 2 x the row's own 4/4/9 figure
});

test("a real unit the row has never heard of still falls back to weight, not to a guess", () => {
  // "slice" is a measure, just not one this row carries. Counting bagels
  // because somebody said slices would be a guess wearing a number, so the
  // honest weight fallback is correct here and must survive the fix.
  const r = macrosFromRow(THOMAS_BAGEL, 1, "slice");
  assert.ok(r);
  assert.equal(r.unit, "100 g");
});

test("the unit offered on screen is one the row actually has", () => {
  // The screenshot's unit box read "100 g" while the only option the picker
  // could offer was "bagel" — a selected value absent from its own list.
  const r = macrosFromRow(THOMAS_BAGEL, 1, "each");
  assert.ok(r);
  assert.ok(
    r.options.some((o) => o.label === r.unit),
    `unit ${r.unit} is not among ${JSON.stringify(r.options.map((o) => o.label))}`,
  );
});
