import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseServingOption, householdServing, servingChoices, servingByUnit,
  macrosFromRow, type CatalogRow,
} from "../../src/lib/nutrition/foodResolve";

/**
 * "ONLY GIVES 100 GRAM INCREMENTS" — AND THE REAL SERVINGS WERE ALREADY THERE.
 *
 * Dustin, 27 Aug: *"yiu telling me we dont have the most well known brand
 * bagels in there? also, everything in ai 'just say what changed' only gives
 * 100 gram increments ... should have all unit options and be able to edit not
 * just 100, 200, etc. do some research and figure out how this should be set up
 * to actually accomplish what im asking. we've revamped this like 100 times."*
 *
 * Measured against the live catalogue that day:
 *
 *   serving_desc = '100 g'   on 574,372 of 574,650 rows
 *   serving_grams = 100      on the same rows
 *   serving_options NOT NULL on 574,515 rows
 *
 * The exact bagel he added, `Bagels Cinnamon Swirl`, carries
 *   [{100 g, 100}, {1 oz, 28.35}, {1 bagel (95 g), 95}]
 *
 * Nothing in the app had ever opened that column. So there was only ever one
 * portion to offer for any food on earth, and "add a bagel and cream cheese"
 * became 100 g of each — 343 calories of cream cheese against the ~30 g anyone
 * spreads. This was never a UI increment problem.
 *
 * The model these tests pin: a logged food is a CATALOGUE ROW plus one of that
 * ROW'S OWN SERVINGS plus how many of them. Macros scale by what one weighs,
 * which is exact — never a conversion, never a guess.
 */

const bagel = (over: Partial<CatalogRow> = {}): CatalogRow => ({
  id: "bagel-1",
  name: "Bagels Cinnamon Swirl",
  brand: "Thomas",
  kcal: 293, protein: 11, carbs: 58, fats: 2,
  serving_desc: "100 g",
  serving_grams: 100,
  verified: false,
  source: "off",
  serving_options: [
    { desc: "100 g", grams: 100 },
    { desc: "1 oz", grams: 28.35 },
    { desc: "1 bagel (95 g)", grams: 95 },
  ],
  ...over,
});

// ── reading a serving description ────────────────────────────────────────────

test("a countable serving is read out of the description", () => {
  assert.deepEqual(parseServingOption({ desc: "1 bagel (95 g)", grams: 95 }), {
    label: "bagel", gramsEach: 95,
  });
});

test("two of something weighing 86 g means ONE weighs 43", () => {
  // "2 BAGELS (86 g)" is a real row (Thomas' mini bagels). Reading the 86 as
  // the weight of one would double somebody's breakfast.
  assert.deepEqual(parseServingOption({ desc: "2 BAGELS (86 g)", grams: 86 }), {
    label: "bagel", gramsEach: 43,
  });
});

test("a portion that is only a weight is not a countable thing", () => {
  // "100 g" and "1 oz" are how much, not how many. Offering "1 100 g" as a unit
  // is exactly what the sheet was doing before this.
  assert.equal(parseServingOption({ desc: "100 g", grams: 100 }), null);
  assert.equal(parseServingOption({ desc: "1 oz", grams: 28.35 }), null);
  assert.equal(parseServingOption({ desc: "28g", grams: 28 }), null);
  assert.equal(parseServingOption({ desc: "1 bagel (95 g)", grams: 0 }), null);
});

test("the household serving is preferred over the weights", () => {
  assert.deepEqual(householdServing(bagel()), { label: "bagel", gramsEach: 95 });
  // A row that only knows weights honestly has none.
  assert.equal(householdServing(bagel({ serving_options: [{ desc: "100 g", grams: 100 }] })), null);
  assert.equal(householdServing(bagel({ serving_options: null })), null);
});

test("naming a unit finds the row's own serving", () => {
  assert.deepEqual(servingByUnit(bagel(), "bagel"), { label: "bagel", gramsEach: 95 });
  assert.deepEqual(servingByUnit(bagel(), "bagels"), { label: "bagel", gramsEach: 95 });
  assert.equal(servingByUnit(bagel(), "slice"), null);
  assert.equal(servingByUnit(bagel(), null), null);
});

// ── what actually lands on the plate ─────────────────────────────────────────

test("one bagel is 95 g of the row, not 100", () => {
  const got = macrosFromRow(bagel(), 1, "bagel")!;
  assert.equal(got.unit, "bagel");
  assert.equal(got.amount, 1);
  assert.equal(got.per_amount, 1, "p/c/f describe ONE of them, so the scale is just the count");
  // 11 g protein per 100 g -> 10.45 for 95 g.
  assert.equal(Math.round(got.p * 100) / 100, 10.45);
  assert.equal(Math.round(got.c * 100) / 100, 55.1);
});

test("two bagels is twice one bagel", () => {
  const one = macrosFromRow(bagel(), 1, "bagel")!;
  const two = macrosFromRow(bagel(), 2, "bagel")!;
  assert.equal(two.amount / two.per_amount, 2);
  assert.equal(two.p, one.p, "p/c/f stay per-one; the count does the scaling");
});

test("a stated weight still wins, exactly as before", () => {
  const got = macrosFromRow(bagel(), 200, "g")!;
  assert.equal(got.unit, "g");
  assert.equal(got.amount, 200);
  assert.equal(got.per_amount, 100);
  assert.equal(got.p, 11, "per-100 g figures, scaled downstream by 200/100");
});

test("the row's portions travel with the answer, for the picker", () => {
  const got = macrosFromRow(bagel(), 1, "bagel")!;
  assert.deepEqual(got.options, [{ label: "bagel", gramsEach: 95 }]);
});

test("a row that knows only weights does not invent a serving", () => {
  const plain = bagel({ serving_options: [{ desc: "100 g", grams: 100 }] });
  const got = macrosFromRow(plain, 150, "g")!;
  assert.equal(got.unit, "g");
  assert.deepEqual(got.options, []);
});

// ── the wiring ───────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("no stated amount means ONE of the thing, not 100 g", () => {
  const OP = code(read("src/lib/nutrition/resolveFoodOp.ts"));
  assert.match(OP, /const hh = householdServing\(row\);/);
  assert.match(OP, /un = hh \? hh\.label : null;/);
  // 4 Sep: the last line of this test used to require the 100 g fallback, and
  // that fallback turned out to be the whole bug. 574,372 of the 574,650 rows
  // carry no countable serving, so "the fallback for a row with no countable
  // serving" was in practice the answer for nearly every food: 100 g of butter
  // (743 cal) for the word "butter", 200 g of pancake for "2 pancakes".
  //
  // A row with no serving now gets ONE portion-weight question — a weight,
  // never a macro — and the macros still come straight off the row. See
  // aPancakeDoesNotWeigh100Grams.test.ts.
  assert.ok(
    !/Number\(row\.serving_grams\) > 0 \? Number\(row\.serving_grams\) : 100; un = "g";/.test(OP),
    "an unstated amount means 100 g of the food again",
  );
  assert.match(OP, /system: PORTION_SYSTEM/);
});

test("the sheet offers the row's units and lets the number be typed", () => {
  const CLIENT = code(read("src/app/(app)/nutrition/v3/NutritionV3Client.tsx"));
  assert.match(CLIENT, /const unitChoices = measured/);
  assert.match(CLIENT, /<select/, "the unit is still a fixed string");
  assert.match(CLIENT, /type="number"/, "the amount still cannot be typed");
  // Grams always available, whatever the row lists first.
  assert.match(CLIENT, /\[\.\.\.\(ad\.options \|\| \[\]\)\.map\(\(o\) => o\.label\), "g", ad\.unit \|\| "g"\]/);
});

test("switching unit rescales by weight rather than converting", () => {
  const CLIENT = code(read("src/app/(app)/nutrition/v3/NutritionV3Client.tsx"));
  assert.match(CLIENT, /const perG = \(Number\(x\.p\) \|\| 0\) \/ \(Number\(x\.grams_each\) \|\| 1\);/);
  assert.match(CLIENT, /p: perG \* each/);
});

// ── the search that could not find Thomas' ───────────────────────────────────

test("both search functions look at the brand column", () => {
  // "Thomas" is in food_catalog.brand, never in the name. Neither function had
  // ever read that column, so the most recognisable bagel brand in the country
  // was unfindable in a table that holds nine of its products.
  const A = read("supabase/migrations/20260827a_search_the_brand_too.sql");
  const B = read("supabase/migrations/20260827b_ai_matcher_reads_the_brand.sql");
  assert.match(A, /fc\.name \|\| ' ' \|\| coalesce\(fc\.brand, ''\)/);
  assert.match(B, /fc\.name \|\| ' ' \|\| coalesce\(fc\.brand, ''\)/);
  assert.match(B, /fc\.brand ilike '%' \|\| \(select a from anchor\) \|\| '%'/);
});

test("the manual search matches every word, not the phrase as one substring", () => {
  // `fc.name ilike '%thomas bagel%'` needs those two words adjacent and in that
  // order, in the name. No row is called that. Two words a person types are two
  // requirements, not one string.
  const A = read("supabase/migrations/20260827a_search_the_brand_too.sql");
  assert.match(A, /not exists \(/);
  assert.doesNotMatch(A, /fc\.name ilike '%' \|\| t\.q \|\| '%'/,
    "the whole-phrase substring match is back");
});
