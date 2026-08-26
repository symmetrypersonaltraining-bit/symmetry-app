import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toGrams, macrosFromRow, describeCandidates, validatePick, type CatalogRow } from "../../src/lib/nutrition/foodResolve";

/**
 * THE AI IS NOT ALLOWED TO STATE A NUMBER.
 *
 * Dustin, 24 Aug 2026: *"the ai anywhere in the app needs to be 100% accurate at
 * all times period. that's the type of thing that will completely crush this
 * entire project. I wouldn't have put ai in there if I wanted a 'guess'."*
 *
 * Two prompting attempts failed on consecutive tries:
 *   "swap chicken thigh w 6 oz of chicken breast" → 1 serving, weight dropped
 *   "add 200 g of potatoes"                       → the per-100 g figures
 *
 * The second is the instructive one — it RECALLED correctly and did not
 * multiply. The answer is not a third prompt. Every macro figure now comes from
 * a food_catalog row, and the model's only job is choosing WHICH row from a
 * shortlist that has the real numbers attached.
 *
 * These tests are the enforcement. If a future change puts p/c/f back into what
 * the model may return, they fail.
 */

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/nutrition-ai/meal-edit/route.ts"), "utf8");
const RESOLVE = readFileSync(join(process.cwd(), "src/lib/nutrition/foodResolve.ts"), "utf8");
const OP = readFileSync(join(process.cwd(), "src/lib/nutrition/resolveFoodOp.ts"), "utf8");
const CLIENT = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");

/** Comments out — these files explain the rule by naming what it forbids. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const row = (over: Partial<CatalogRow> = {}): CatalogRow => ({
  id: "row-1",
  name: "Potatoes, boiled, cooked in skin, flesh, without salt",
  brand: null,
  kcal: 87,
  protein: 1.87,
  carbs: 20.13,
  fats: 0.1,
  serving_desc: "100 g",
  serving_grams: 100,
  verified: true,
  source: "usda",
  ...over,
});

// ── the contract ─────────────────────────────────────────────────────────────

test("the model is told, in the prompt, that it may not state a figure", () => {
  assert.match(ROUTE, /YOU NEVER STATE A NUTRITION FIGURE/);
  assert.match(ROUTE, /The app reads every number from its food database/);
});

test("a macro the model volunteers is never read", () => {
  // The stronger half: not "it is asked not to", but "there is no path". The
  // add/swap branch of validate() reads name, amount and unit — nothing else.
  const branch = code(ROUTE).slice(
    code(ROUTE).indexOf('} else if (op === "add" || op === "swap") {'),
    code(ROUTE).indexOf("return { ops, note:"),
  );
  assert.ok(branch.length > 200, "the validate branch moved — re-anchor this test");
  for (const field of ["x.p", "x.c", "x.f", "x.servings", "x.per_amount", "x.kcal"]) {
    assert.ok(
      !branch.includes(field),
      `the add/swap branch reads ${field} from the model again — that is the bug being designed out`,
    );
  }
});

test("nothing resolves without a catalogue row, and a failure adds nothing", () => {
  assert.match(code(ROUTE), /if \(!resolved\) \{ op\.unresolved = true; continue; \}/);
  // A thrown lookup must land in the same place as no match, not in a guess.
  assert.match(code(ROUTE), /catch \{[\s\S]{0,200}op\.unresolved = true;/);
});

test("the client refuses to add an unresolved food", () => {
  assert.match(
    code(CLIENT),
    /if \(op\.unresolved \|\| op\.p == null\) \{/,
    "the sheet will add a food with no macros behind it",
  );
  assert.match(code(CLIENT), /notFound\.push/);
});

test("a swap whose replacement was not found does not empty the slot", () => {
  // Zeroing the outgoing item for a food that could not be resolved leaves the
  // meal short with nothing to show for it.
  assert.match(code(CLIENT), /op\.op === "swap" && op\.id && !op\.unresolved\) next\[op\.id\] = 0;/);
});

test("the row's own name is what goes on the plate", () => {
  // A wrong CHOICE is then visible and one tap from correction. A wrong number
  // is not visible at all — which is the entire reason for this design.
  assert.match(code(CLIENT), /name: String\(op\.resolved_name \|\| op\.name\)/);
});

// ── the arithmetic, which is now ours ────────────────────────────────────────

test("mass units convert exactly", () => {
  assert.equal(toGrams(200, "g"), 200);
  assert.equal(toGrams(1, "kg"), 1000);
  assert.equal(Math.round(toGrams(6, "oz")! * 100) / 100, 170.1);
  assert.equal(Math.round(toGrams(1, "lb")! * 100) / 100, 453.59);
  assert.equal(toGrams(2, "OZ"), toGrams(2, "oz"), "unit matching is case-insensitive");
});

test("volume is refused rather than guessed at", () => {
  // A cup of rice and a cup of oil do not weigh the same, and the catalogue
  // carries no density. Inventing a conversion here would be the same class of
  // error as the model inventing the macros.
  assert.equal(toGrams(1, "cup"), null);
  assert.equal(toGrams(2, "tbsp"), null);
  assert.equal(toGrams(1, null), null);
});

test("200 g against a per-100 g row is 174 cal, not 87", () => {
  // The reported case, end to end.
  const got = macrosFromRow(row(), 200, "g")!;
  assert.equal(got.amount, 200);
  assert.equal(got.unit, "g");
  assert.equal(got.per_amount, 100);
  assert.equal(got.p, 1.87);
  // The scale is applied downstream by addedScale(amount / base_amount) = 2.
  const scale = got.amount / got.per_amount;
  assert.equal(scale, 2);
  assert.equal(Math.round(got.c * scale * 10) / 10, 40.3);
});

test("6 oz becomes grams before it meets a per-100 g row", () => {
  const got = macrosFromRow(row({ name: "Chicken, breast, meat only, cooked, roasted", protein: 31, carbs: 0, fats: 3.57 }), 6, "oz")!;
  assert.equal(got.unit, "g");
  assert.equal(got.amount, 170.1);
  assert.equal(Math.round(got.p * (got.amount / got.per_amount) * 10) / 10, 52.7);
});

test("a unit with no mass falls back to the row's own serving, still a real figure", () => {
  const got = macrosFromRow(row({ serving_desc: "1 cup", serving_grams: null }), 2, "cups")!;
  assert.equal(got.per_amount, 1);
  assert.equal(got.amount, 2);
  assert.equal(got.unit, "1 cup", "the row's wording, so nobody reads it as grams");
});

test("a row missing macros resolves to nothing at all", () => {
  assert.equal(macrosFromRow(row({ protein: null }), 100, "g"), null);
  assert.equal(macrosFromRow(row(), 0, "g"), null);
});

// ── the shortlist and the pick ───────────────────────────────────────────────

test("the candidates carry their real macros, because that is the evidence", () => {
  const listed = describeCandidates([
    row({ id: "a", name: "Bananas, raw", kcal: 89, protein: 1.09, carbs: 22.84, fats: 0.33 }),
    row({ id: "b", name: "banana", kcal: 242, protein: 2, carbs: 27, fats: 14, verified: false }),
  ]);
  assert.match(listed, /1\. Bananas, raw \[USDA\] — per 100 g: 89 kcal/);
  assert.match(listed, /2\. banana — per 100 g: 242 kcal, 2\.0P 27\.0C 14\.0F/);
  assert.doesNotMatch(listed, /\[USDA\][^\n]*\n2\. [^\n]*\[USDA\]/, "the unverified row must not be labelled verified");
});

test("the picker is told to answer 0 rather than force a near-miss", () => {
  assert.match(RESOLVE, /ANSWER 0 RATHER THAN FORCING IT/);
  assert.match(RESOLVE, /A near-miss is worse than an honest miss/);
  // And the specific traps that ranking alone falls into.
  assert.match(RESOLVE, /oven-roasted" is deli meat/);
  assert.match(RESOLVE, /242 kcal with 14 g of fat is not a banana/);
});

test("0 is a valid answer and anything off the list is not", () => {
  assert.equal(validatePick({ pick: 0 }, 5), 0);
  assert.equal(validatePick({ pick: 3 }, 5), 3);
  assert.equal(validatePick({ pick: 6 }, 5), null, "a row that was never offered cannot be chosen");
  assert.equal(validatePick({ pick: -1 }, 5), null);
  assert.equal(validatePick({ pick: "2" }, 5), null);
  assert.equal(validatePick({}, 5), null);
  assert.equal(validatePick(null, 5), null);
});

test("the resolver uses the AI matcher, not the phrase-substring search", () => {
  // search_food_catalog matches the whole phrase as one substring, so
  // "white potatoes, boiled" returns nothing at all, and it ranks an exact
  // lowercase name above a verified row.
  assert.match(code(OP), /rpc\("match_food_for_ai"/);
  assert.doesNotMatch(code(OP), /rpc\("search_food_catalog"/);
});

test("there is ONE resolver, shared by every door", () => {
  // meal-edit (the Adjust sheet) and parse (every client's daily logging) must
  // not each own a copy of "how a food becomes a number" — two copies drift,
  // and the drift is two screens disagreeing about the same dinner.
  assert.match(code(ROUTE), /from "@\/lib\/nutrition\/resolveFoodOp"/);
  assert.match(code(OP), /export async function resolveFood/);
});

test("an unstated amount falls back to the ROW's serving, not an invented one", () => {
  assert.match(
    code(OP),
    /amount \?\? \(row\.serving_grams \? Number\(row\.serving_grams\) : 1\)/,
  );
});

// ── the everyday logger, which is the bigger surface ─────────────────────────

const PARSE = readFileSync(join(process.cwd(), "src/app/api/nutrition-ai/parse/route.ts"), "utf8");
const PARSE_CLIENT = readFileSync(join(process.cwd(), "src/lib/nutrition/parseClient.ts"), "utf8");

test("the food parser no longer asks a model for macros either", () => {
  // /nutrition-ai/parse is the "describe what you ate" path every client uses
  // daily — a far bigger surface than the Adjust sheet. Its prompt used to say
  // "estimate macros for the stated amount of each item using USDA /
  // nutrition-label knowledge", which is the same recall-plus-arithmetic that
  // returned the per-100 g figures for a 200 g request.
  assert.match(PARSE, /YOU NEVER STATE A NUTRITION FIGURE/);
  assert.doesNotMatch(code(PARSE), /estimate macros for the stated amount/);
  // The reply shape it accepts has no macro fields at all.
  assert.match(PARSE, /\{"items":\[\{"name":string,"amount":number\|null,"unit":string\|null\}\]\}/);
  assert.match(code(PARSE), /validate: validateParsedNames/);
});

test("parse resolves every item against the catalogue", () => {
  assert.match(code(PARSE), /resolveFood\(deps, named\.name, named\.amount, named\.unit\)/);
  // The ROW's name goes back, not the words typed.
  assert.match(code(PARSE), /name: got\.name/);
});

test("an unfindable food is named, not silently dropped", () => {
  // Losing a food off a logged meal is the same class of error as inventing
  // one: the total is wrong and nothing on screen says why.
  assert.match(code(PARSE), /unresolved\.push\(named\.name\)/);
  assert.match(code(PARSE), /unresolved\.length \? \{ unresolved \}/);
  assert.match(code(PARSE_CLIENT), /unresolved/);
});

test("totals are summed from the resolved items, in code", () => {
  // They used to be whatever the model said they were, with the items summing
  // to something else entirely.
  assert.match(code(PARSE), /const totals = items\.reduce\(/);
});

test("a catalogue-resolved item is not flagged as an AI estimate", () => {
  // `est` tells the person to distrust the number. Once it comes from a real
  // row that would be pointing them away from the most reliable figure on the
  // screen.
  assert.match(code(PARSE_CLIENT), /est: !foodId/);
  assert.match(code(PARSE_CLIENT), /db: !!foodId/);
});
