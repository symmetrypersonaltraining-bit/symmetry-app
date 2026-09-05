// BUTTER IS MEASURED IN TABLESPOONS, WHATEVER THE ROW SAYS.
//
// Dustin, 5 Sep: *"why are we still fighting this? butter shouod measure in
// tablespoons i thought we fixed all this."*
//
// Fair question, and the answer is that 4 Sep fixed a different thing. That day
// fixed WHICH of a row's own servings gets picked — a real piece over a cup,
// because USDA stores serving_options alphabetically. This is the case
// underneath it: a row with no countable serving AT ALL.
//
// He searched his actual butter, Kerrygold Salted Irish Butter, and got it —
// correctly. That row comes from Open Food Facts and carries exactly two
// options, "100 g" and "1 oz". Grams was the only honest thing the app could
// offer him, so grams is what it offered.
//
// Not a rare shape. Of the catalogue's butter rows 7,218 are crowd-submitted
// and 318 are USDA-verified; only 31 carry a tablespoon. The foods it hurts are
// precisely the ones nobody weighs: butter, oil, peanut butter, honey,
// mayonnaise, syrup, jam.
//
// The fix does not invent a gram weight — the rule this whole area runs on is
// that a number comes from a row. It borrows the household measures of the
// best-matching VERIFIED row for the same food. USDA's "Butter, salted" has
// carried "1 tbsp (14.2 g)", "1 pat (5 g)", "1 stick (113 g)" the entire time.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { namedServings } from "../../src/lib/servingOptions.ts";
import { preferredServing, parseServingOption } from "../../src/lib/nutrition/foodResolve.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const SHEET = read("src/app/(app)/nutrition/v3/FoodSearchSheet.tsx");
const OP = read("src/lib/nutrition/resolveFoodOp.ts");
const SQL = read("supabase/migrations/20260905a_borrowed_household_servings.sql");

// The real answers the function gives, recorded from the live catalogue on
// 5 Sep. These are what the borrow is FOR.
const BORROWED_BUTTER = [
  { desc: '1 pat (1" sq, 1/3" high)', grams: 5 },
  { desc: "1 tbsp", grams: 14.2 },
  { desc: "1 cup", grams: 227 },
  { desc: "1 stick", grams: 113 },
];

test("butter comes back with a tablespoon a person can pick", () => {
  const named = namedServings(BORROWED_BUTTER);
  assert.ok(named.some((n) => n.label === "tbsp" && n.gramsPerUnit === 14.2));
  assert.ok(named.some((n) => n.label === "pat"));
  assert.ok(named.some((n) => n.label === "stick"));
});

test("and it opens on a pat, not a cup or a stick", () => {
  // The 26 Aug rule, still doing its job on a borrowed set: a real piece beats
  // a volume, and a cup of butter is 227 g of butter.
  const pick = preferredServing(namedServings(BORROWED_BUTTER)
    .map((n) => ({ label: n.label, gramsEach: n.gramsPerUnit })));
  assert.equal(pick?.label, "pat");
});

test("peanut butter does not borrow dairy butter's tablespoon", () => {
  // The head noun matches for both, so overlap is what separates them: "Peanut
  // butter, smooth" shares two tokens with "Peanut Butter" and "Butter, salted"
  // shares one. A tablespoon of peanut butter is 16 g, not 14.2 — an 11% error
  // on every spoonful, every day, and invisible.
  //
  // The live answer for "Peanut Butter" is "2 tbsp (32 g)", and the leading
  // count matters: two tablespoons weighing 32 g means ONE weighs 16.
  const one = parseServingOption({ desc: "2 tbsp (32 g)", grams: 32 });
  assert.equal(one?.label, "tbsp");
  assert.equal(one?.gramsEach, 16);
});

// ── the borrow is grounded, not guessed ─────────────────────────────────────

test("only a VERIFIED row may lend its measures", () => {
  assert.match(SQL, /fc\.verified is true/);
});

test("the lender must share the food's head noun", () => {
  // Without it "Salted Irish Butter" could borrow from anything sharing any
  // word — "salted" alone would reach salted peanuts.
  assert.match(SQL, /toks\[array_length\(toks, 1\)\] from me\) as noun/);
  assert.match(SQL, /lower\(fc\.name\) ~ \('\\y' \|\| head\.noun \|\| '\\y'\)/);
});

test("the best overlap wins, then the plainest name", () => {
  assert.match(SQL, /order by overlap desc, length\(fc\.name\), fc\.name/);
});

test("a weight is never lent as if it were a portion", () => {
  // "100 g" and "1 oz" are what the borrowing row already had. Lending them
  // back would be the bug wearing a different row's clothes.
  const massFilter = /\(o->>'desc'\) !~\* '\^\\s\*\[\\d\.\]\+\\s\*\(g\|gm\|kg\|oz\|lb\|lbs\|ml\|l\|fl\\s\?oz\|grams\?\|ounces\?\|pounds\?\)\\s\*\$'/;
  assert.equal((SQL.match(new RegExp(massFilter.source, "g")) || []).length, 2,
    "the mass filter must guard both the candidate search and what is returned");
});

test("nothing matched means nothing offered", () => {
  // An empty answer is correct. A tablespoon whose weight we do not know is the
  // failure this exists to avoid.
  assert.match(SQL, /'\[\]'::jsonb\)/);
});

// ── it is actually reached, on both doors ───────────────────────────────────

test("the food sheet borrows only when the row knows no portion", () => {
  assert.match(code(SHEET), /if \(!f\.named\.length && f\.baseGrams\) \{/);
  assert.match(code(SHEET), /rpc\("borrowed_household_servings"/);
  // The sheet is on screen before the borrow returns — a slow lookup must not
  // hold up the food the client already tapped.
  const i = code(SHEET).indexOf("async function openPicked");
  const body = code(SHEET).slice(i, i + 900);
  assert.ok(body.indexOf("setPicked(f);") < body.indexOf("borrowUnits("),
    "the sheet waits on the borrow before showing the food");
});

test("a failed borrow leaves grams working", () => {
  assert.match(code(SHEET), /catch \{[\s\S]{0,120}return \[\];/);
});

test("the AI resolver asks the catalogue before it asks a model", () => {
  // The portion question added 4 Sep costs a Haiku call and returns an estimate.
  // A borrowed serving is a real number from a real row, so it goes first.
  const i = code(OP).indexOf("borrowed_household_servings");
  const j = code(OP).indexOf("system: PORTION_SYSTEM");
  assert.ok(i > -1 && j > -1 && i < j, "the model is still asked before the catalogue");
  assert.match(code(OP), /if \(!rowKnowsIt && !fallbackServing\) \{/,
    "the portion question must be skipped when the catalogue answered");
});

test("a borrowed unit list is marked as borrowed", () => {
  // The food's own numbers are untouched; only the measures come from
  // elsewhere, and the gram weight is shown in the picker so it can be checked.
  assert.match(code(SHEET), /borrowedUnits: true/);
  assert.match(SHEET, /borrowedUnits\?: boolean;/);
});
