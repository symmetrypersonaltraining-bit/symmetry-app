// A PANCAKE DOES NOT WEIGH 100 GRAMS.
//
// Dustin, 4 Sep 2026, on the Edit custom meal sheet after typing
// "2 5 inch pancakes, 4 scrambled eggs w butter n cheese, 3 maple sausage links":
// *"its got all the same screw ups that we fixed on other features. these
// numbers r terrible."*
//
// The meal came to 2,314 cal / 94P / 81C / 179F. Every food resolved to the
// right USDA row and four of the five then got the wrong portion:
//
//   Pancakes, plain   "2 100 g"  559 cal
//   Scrambled Eggs    "4 100 g"  439 cal
//   Butter, NFS       "100 g"    743 cal    (82 g of fat, for "w butter")
//   Cheese, NFS       "100 g"    382 cal
//   pork sausage      "3 link"   191 cal    <- correct
//
// The rows below are the REAL ones, copied from food_catalog on 4 Sep. That
// matters: an earlier fix in this same file was wrong in the other direction
// and got caught only by replaying it against real rows instead of invented
// ones. Four of these carry nothing but "100 g" and "1 oz", which is true of
// 574,372 of the catalogue's 574,650 rows. The sausage carries "1 link (28 g)"
// — and is the only item that came out right.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  macrosFromRow, validatePortion, householdServing, type CatalogRow,
} from "../../src/lib/nutrition/foodResolve.ts";

const OP = readFileSync(join(process.cwd(), "src/lib/nutrition/resolveFoodOp.ts"), "utf8");
const RESOLVE = readFileSync(join(process.cwd(), "src/lib/nutrition/foodResolve.ts"), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const WEIGHTS_ONLY = [{ desc: "100 g", grams: 100 }, { desc: "1 oz", grams: 28.35 }];

const pancakes: CatalogRow = {
  id: "5066996e-4ef4-469a-9b33-9195e55f823b", name: "Pancakes, plain", brand: null,
  kcal: 282, protein: 7.41, carbs: 35.3, fats: 12.1,
  serving_desc: "100 g", serving_grams: 100, verified: true, source: "usda",
  serving_options: WEIGHTS_ONLY,
};
const butter: CatalogRow = {
  ...pancakes, id: "16335bd5-b403-4a3e-a3f5-40b45a44f46b", name: "Butter, NFS",
  kcal: 743, protein: 0.85, carbs: 0.06, fats: 82.2,
};
const sausage: CatalogRow = {
  ...pancakes, id: "54648246-4802-491f-b2d9-c26c5efab9f9",
  name: "USDA Commodity, pork sausage, bulk/links/patties, frozen, raw",
  kcal: 231, protein: 14.95, carbs: 0, fats: 18.56,
  serving_options: [...WEIGHTS_ONLY, { desc: "1 link", grams: 28 }],
};

const kcal = (r: { p: number; c: number; f: number }, scale: number) =>
  Math.round((r.p * 4 + r.c * 4 + r.f * 9) * scale);

// ── the reported meal, item by item ──────────────────────────────────────────

test("the catalogue itself cannot say what a pancake weighs", () => {
  // Not a test of my code — a test of the premise. If this ever starts
  // returning a serving, the portion question stops firing for these rows and
  // the fix below quietly stops being exercised.
  assert.equal(householdServing(pancakes), null);
  assert.equal(householdServing(butter), null);
  assert.equal(householdServing(sausage)?.label, "link", "the one row that already knew");
});

test("two five-inch pancakes are two pancakes, not two hundred grams", () => {
  const got = macrosFromRow(pancakes, 2, "pancake", { label: "pancake", gramsEach: 77 })!;
  assert.equal(got.unit, "pancake", 'the sheet said "2 100 g"');
  assert.equal(got.per_amount, 1);
  assert.equal(got.amount, 2);
  assert.equal(got.food_id, pancakes.id, "the macros must still come from the row");
  // 559 cal was the bug. 154 g of pancake is what he ate.
  assert.equal(kcal(got, got.amount / got.per_amount), 431);
});

test("butter nobody measured is a pat, not a hundred grams of it", () => {
  const got = macrosFromRow(butter, 1, null, { label: "pat", gramsEach: 5 })!;
  assert.equal(got.unit, "pat");
  assert.equal(kcal(got, 1), 37, "743 cal and 82 g of fat went on the plate for the word 'butter'");
  assert.ok(got.f < 5);
});

test("a row that DOES know the measure ignores the estimate entirely", () => {
  // The sausage was already right. A fix that changes a correct answer is a
  // regression, and this is the one row in the meal that proves the mechanism
  // never overrides the catalogue.
  const got = macrosFromRow(sausage, 3, "links", { label: "link", gramsEach: 999 })!;
  assert.equal(got.unit, "link");
  assert.equal(Math.round(got.p * 100) / 100, 4.19, "28 g per link, off the row");
  assert.equal(got.portion_estimated, undefined, "a row's own serving is not an estimate");
});

// ── what the flag means, and what it does not ────────────────────────────────

test("an estimated portion is flagged, and still carries its catalogue id", () => {
  const got = macrosFromRow(pancakes, 2, "pancake", { label: "pancake", gramsEach: 77 })!;
  assert.equal(got.portion_estimated, true);
  assert.equal(got.estimated, undefined, "the MACROS were not estimated — they are USDA");
  assert.equal(got.verified, true);
});

test("the estimated portion joins the unit picker", () => {
  // So the weight behind the number is one tap away and correctable, rather
  // than buried in a payload nobody can see.
  const got = macrosFromRow(pancakes, 2, "pancake", { label: "pancake", gramsEach: 77 })!;
  assert.ok(got.options?.some((o) => o.label === "pancake" && o.gramsEach === 77));
});

// ── the reply is checked, not believed ───────────────────────────────────────

test("a weight is not an answer to 'what does one weigh'", () => {
  assert.equal(validatePortion({ serving: "100 g", grams: 100 }), null);
  assert.equal(validatePortion({ serving: "2 oz", grams: 57 }), null);
});

test("a portion the model does not know adds no weight at all", () => {
  assert.equal(validatePortion({ unknown: true }), null);
  assert.equal(validatePortion({}), null);
  assert.equal(validatePortion({ serving: "pancake" }), null);
  assert.equal(validatePortion(null), null);
});

test("an impossible weight is refused", () => {
  assert.deepEqual(validatePortion({ serving: "pancake", grams: 77 }), { serving: "pancake", grams: 77 });
  assert.equal(validatePortion({ serving: "pancake", grams: 0 }), null);
  assert.equal(validatePortion({ serving: "pancake", grams: -5 }), null);
  assert.equal(validatePortion({ serving: "pancake", grams: 9000 }), null);
  assert.equal(validatePortion({ serving: "pancake", grams: "seventy" }), null);
  // A numeric string IS accepted, deliberately and in step with validateEstimate:
  // "77" instead of 77 is a JSON formatting quirk, not a wrong weight.
  assert.deepEqual(validatePortion({ serving: "pancake", grams: "77" }), { serving: "pancake", grams: 77 });
});

test("the portion question asks for a weight and forbids a macro", () => {
  // The invariant this whole area exists to defend: a macro figure comes from
  // a row or it does not exist. Widening this prompt to "and give me the
  // calories while you're there" is the exact regression to catch.
  assert.match(RESOLVE, /export const PORTION_SYSTEM/);
  assert.match(RESOLVE, /Do NOT return calories, protein, carbs or fat/);
  assert.match(RESOLVE, /You are being asked for a weight and only a weight/);
  assert.match(RESOLVE, /return \{"unknown":true\}/);
});

// ── and that the resolver actually asks ──────────────────────────────────────

test("the resolver asks only when the row cannot express the measure", () => {
  assert.match(code(OP), /const rowKnowsIt =/);
  assert.match(code(OP), /toGrams\(1, askedUnit\) != null/, "a stated weight must never trigger a question");
  assert.match(code(OP), /!!servingByUnit\(row, askedUnit\)/, "the row's own serving must win");
  assert.match(code(OP), /if \(!rowKnowsIt\) \{/);
  assert.match(code(OP), /system: PORTION_SYSTEM/);
});

test("a bare count no longer silently becomes grams", () => {
  // The line being removed: `un = hh ? hh.label : ""` sent a count into the
  // last-resort branch, which multiplies the row's 100 g base. And the
  // unstated-amount branch defaulted straight to serving_grams.
  assert.ok(!/un = hh \? hh\.label : "";/.test(code(OP)), "a count still falls through to grams");
  assert.ok(
    !/amt = Number\(row\.serving_grams\) > 0 \? Number\(row\.serving_grams\) : 100; un = "g";/.test(code(OP)),
    "an unstated amount still defaults to 100 g of the food",
  );
  assert.match(code(OP), /un = hh \? hh\.label : null;/);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SAME BUG, ON THE MANUAL SHEET, THE WHOLE TIME
// ─────────────────────────────────────────────────────────────────────────────
//
// Dustin, 4 Sep: *"I dont want to find this accuracy problem again anywhere.
// find it from every path n get it fixed."*
//
// So the paths were swept, and "which serving is ONE of them" turned out to be
// answered in TWO places. `householdServing` in foodResolve was fixed on
// 26 Aug — a real piece beats a volume, because USDA stores serving_options
// alphabetically and "cup" wins otherwise. `defaultAmountFor` in
// lib/servingOptions.ts, which decides what the amount box opens on for the
// manual "Add from the food database" sheet, still took `named[0]`.
//
// Measured against the live catalogue on 4 Sep: 93,752 of the 223,237 rows
// carrying a named serving open on a volume. The rows below are real.

import { namedServings, defaultAmountFor } from "../../src/lib/servingOptions.ts";
import { preferredServing } from "../../src/lib/nutrition/foodResolve.ts";

const bananaOptions = [
  { desc: "100 g", grams: 100 },
  { desc: "1 oz", grams: 28.35 },
  { desc: "1 cup, mashed", grams: 225 },
  { desc: "1 cup, sliced", grams: 150 },
  { desc: '1 extra small (less than 6" long)', grams: 81 },
  { desc: '1 small (6" to 6-7/8" long)', grams: 101 },
];
const almondOptions = [
  { desc: "100 g", grams: 100 },
  { desc: "1 oz", grams: 28.35 },
  { desc: "1 cup, whole", grams: 143 },
  { desc: "1 cup, sliced", grams: 92 },
];

test("the amount box opens on a banana, not a cup of mashed banana", () => {
  const named = namedServings(bananaOptions);
  assert.equal(named[0].label, "cup, mashed", "the raw order really is volume-first");
  const got = defaultAmountFor("100 g", named, 100)!;
  assert.equal(got.unit, "extra small", '225 g of banana — ~200 cal — for the word "banana"');
  assert.equal(got.amount, 1);
});

test("a cup is still offered — it is only wrong as the default", () => {
  const named = namedServings(bananaOptions);
  assert.ok(named.some((n) => n.label === "cup, mashed"));
});

test("a food whose only named servings ARE volumes still gets one", () => {
  const got = defaultAmountFor("100 g", namedServings(almondOptions), 100)!;
  assert.equal(got.unit, "cup, whole", "refusing outright would leave the box on 100 g");
});

test("there is ONE chooser, and both callers use it", () => {
  // Two copies of this decision is two screens disagreeing about the same
  // banana — which is exactly what happened for nine days.
  const SERVING_OPTS = readFileSync(join(process.cwd(), "src/lib/servingOptions.ts"), "utf8");
  assert.match(code(SERVING_OPTS), /preferredServing/);
  assert.ok(!/named\[0\]\.label/.test(code(SERVING_OPTS)), "the manual sheet picks the first option again");
  assert.match(code(RESOLVE), /export function preferredServing/);
  assert.match(code(RESOLVE), /return preferredServing\(\(row\.serving_options \|\| \[\]\)\.map\(parseServingOption\)\)/);
});

test("the chooser's rule, stated once", () => {
  const S = (label: string, gramsEach: number) => ({ label, gramsEach });
  // A real piece beats a volume however the list is ordered.
  assert.equal(preferredServing([S("cup", 225), S("small", 101)])?.label, "small");
  // A volume beats nothing.
  assert.equal(preferredServing([S("cup", 143)])?.label, "cup");
  // And a crumb is the last resort — "1 almond" is not how anyone logs almonds.
  assert.equal(preferredServing([S("almond", 1.2), S("cup", 143)])?.label, "cup");
  assert.equal(preferredServing([S("almond", 1.2)])?.label, "almond");
  assert.equal(preferredServing([]), null);
});
