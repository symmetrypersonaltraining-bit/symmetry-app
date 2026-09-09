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

// ── one chicken breast is an answer ────────────────────────────────────────
//
// Dustin, 8 Sep: *"if i say I ate 1 chicken breast without any measurements, it
// needs to log the average size chicken breast in oz. or give me small med
// large options w oz."* His own row logged 1 oz — 28 g for "Chicken breast".
//
// The catalogue cannot answer this and that is the point: USDA's "1 breast" is
// a bone-in whole breast, median 863 g across every row that names one. So the
// size is a STANDARD, held in food_piece_sizes, not a measurement read off a
// row. The one USDA row that measures what a person buys — "breast, meat and
// skin, raw, 1 breast bone removed = 174 g" — agrees with the seeded 170 g,
// and is deliberately left alone.

test("a piece size carries its ounces and still reads as one piece", () => {
  const s = parseServingOption({ desc: "1 breast (6 oz)", grams: 170 });
  assert.equal(s?.label, "breast", "the ounces are for the person, not the parser");
  assert.equal(s?.gramsEach, 170);
});

test("small, medium and large stay three different units", () => {
  // "breast (small)" would collapse: the parenthesis is discarded and all three
  // would land on the same label, so the size goes in front of the noun.
  const labels = [
    { desc: "1 small breast (4 oz)", grams: 113 },
    { desc: "1 breast (6 oz)", grams: 170 },
    { desc: "1 large breast (8 oz)", grams: 227 },
  ].map((o) => parseServingOption(o)?.label);
  assert.deepEqual(labels, ["small breast", "breast", "large breast"]);
  assert.equal(new Set(labels).size, 3, "three sizes must be three units in the picker");
});

test("the stored piece size is what a bare 'chicken breast' logs", () => {
  const row: CatalogRow = {
    ...base, name: "Chicken breast",
    serving_options: [{ desc: "100 g", grams: 100 }, { desc: "1 oz", grams: 28.35 }],
    default_serving_desc: "1 breast (6 oz)", default_serving_grams: 170,
  };
  const s = householdServing(row);
  assert.equal(s?.gramsEach, 170, "not 28 g, which is what it logged before");
  assert.equal(s?.label, "breast");
});

// ── and the guard that kept it to six rows ─────────────────────────────────

const PIECES = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908d_one_chicken_breast_is_an_answer.sql"), "utf8");

test("a food has to BE the cut, not merely mention it", () => {
  // The first cut of this matched on the keyword alone and made the database
  // worse: a shrimp soup base became one shrimp, a tri-tip roast became a
  // steak, breaded tenders became a whole breast.
  assert.match(PIECES, /food_is_the_plain_cut/);
  for (const form of ["tender", "nugget", "breaded", "sliced", "deli", "soup", "jerky"]) {
    assert.ok(PIECES.includes(form), `"${form}" must disqualify a row from being one of anything`);
  }
});

test("shrimp and turkey breast are deliberately not piece foods", () => {
  // Nobody logs one shrimp — the same reason "1 almond" is not a default — and
  // a turkey breast is a roast, not a serving.
  const seeded = PIECES.slice(PIECES.indexOf("insert into food_piece_sizes"));
  assert.doesNotMatch(seeded, /'shrimp'/);
  assert.doesNotMatch(seeded, /'turkey breast'/);
});

test("a piece stands aside for a volume and for its own measured twin", () => {
  assert.match(PIECES, /not food_serving_is_volume\(own_label\)/);
  assert.match(PIECES, /own_label !~ \('\^' \|\| piece\.unit/);
});

// ── a unit is not a name ───────────────────────────────────────────────────
//
// 68,853 rows opened on "1 serving" and 7,165 on "1 unit" or "1 each". The
// weight was right — it comes off the label — but the word tells a client
// nothing. Twenty-six rules carried the label 'each' while their own keyword
// WAS the noun: bun, burrito, donut, pickle, waffle. A person says "1 bun".

const NAMES = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908e_a_unit_is_not_a_name.sql"), "utf8");

test("the vague words are named, and the keyword supplies the noun", () => {
  assert.match(NAMES, /food_serving_label_is_vague/);
  for (const vague of ["each", "unit", "item", "piece", "serving", "portion"]) {
    assert.ok(NAMES.includes(vague), `"${vague}" names nothing and must be treated as vague`);
  }
  assert.match(NAMES, /left\(keyword, length\(keyword\) - 1\)/, "plural keywords singularise");
});

test("a lemon-flavoured soda is not lemons", () => {
  // Reading the diff first caught "All-Natural Unsweet Tea, Lemon & Lime" being
  // renamed "6 lemon", and an olive pate becoming "8 olive". Wrong is worse
  // than vague, which is the entire complaint being fixed here.
  assert.match(NAMES, /food_name_is_flavoured/);
  for (const marker of ["flavou?r", "tea", "soda", "juice", "candy", "pate"]) {
    assert.ok(NAMES.includes(marker), `"${marker}" must mark a name as flavoured`);
  }
});

test("the rename may not move a single gram", () => {
  // The one guarantee that makes this commit safe to ship without re-checking
  // every row: it changes words, so no logged portion can regress on it.
  assert.match(NAMES, /\(s\.d->>'grams'\)::numeric = s\.old_g/,
    "a row is renamed only when the new answer weighs exactly what the old one did");
});

// ── a measure opens on one ─────────────────────────────────────────────────
//
// Dustin's original sentence, still unmet five migrations later: "butter should
// open to 1 tbsp and you can edit it if you had more than that." Butter opened
// on SIX tablespoons — the package's 85 g stick, faithfully restated as a count
// of tablespoons. 83,478 rows opened on more than one of a divisible unit.
//
// A measure or a size opens on ONE. A named piece keeps the label's count,
// because "8 crackers" is how the box is eaten. And only ever downwards: the
// first cut rounded a 0.75-cup serving UP to a full cup, which is the same
// fault pointing the other way.

const OPENS_ON_ONE = readFileSync(
  join(process.cwd(), "supabase/migrations/20260909a_a_measure_opens_on_one.sql"), "utf8");

test("a measure or a size opens on one, a named piece does not", () => {
  assert.match(OPENS_ON_ONE, /food_serving_opens_on_one/);
  assert.match(OPENS_ON_ONE, /food_serving_is_divisible\(label\)/,
    "tbsp, cup and oz open on one because they are divisible");
  assert.match(OPENS_ON_ONE, /small\|medium\|large/, "so do the size words");
  // "cracker" must NOT be in the opens-on-one predicate: 8 crackers is the
  // serving on the box and 1 cracker is not a portion anyone means.
  const predicate = OPENS_ON_ONE.slice(
    OPENS_ON_ONE.indexOf("function food_serving_opens_on_one"),
    OPENS_ON_ONE.indexOf("grant execute on function food_serving_opens_on_one"));
  assert.doesNotMatch(predicate, /cracker|cookie|slice|nugget/);
});

test("it shrinks a multiple and never inflates a fraction", () => {
  // Both call sites are guarded on cnt > 1. Without that, "0.75 cup" became
  // "1 cup" and every such portion grew by a third.
  const guards = OPENS_ON_ONE.match(/cnt is not null and cnt > 1 and food_serving_opens_on_one/g) ?? [];
  assert.equal(guards.length, 2,
    "the own-unit branch and the mapped-unit branch both need the downwards-only guard");
});

test("a vague word only counts when it is the whole label", () => {
  // "1 serving, 1/2 cup" names half a cup. Treating it as vague threw the half
  // cup away and doubled an ice cream from 68 g to 132 g.
  assert.match(OPENS_ON_ONE,
    /\^\(each\|unit\|units\|item\|items\|piece\|pieces\|serving\|servings\|portion\|portions\)\$/,
    "the vague check must be anchored at BOTH ends");
});
