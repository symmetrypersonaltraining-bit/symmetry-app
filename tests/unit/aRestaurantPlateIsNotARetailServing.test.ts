// ============================================================================
// A RESTAURANT PLATE IS NOT A RETAIL SERVING.
//
// Dustin, 11 Sep 2026, on his own lunch: *"Fix my lunch macros in the app.
// That's not even close."*
//
// He typed "Beef fajitas from Rivera's in Princeton Texas with flour tortillas
// and queso with ground beef" and the coach chat logged 634 kcal. The pipeline
// did everything it was built to do — named three foods, found catalogue
// rows, never recited a number — and still came out at half the plate:
//
//   "Fully Cooked Beef Fajitas, Beef"        1 serving (78 g)   111 kcal
//   "Tortilla, flour"                         2 tortilla          296 kcal
//   "Beef & Chorizo Taco ... Bowl" (frozen)   0.5 bowl            227 kcal
//
// The fajitas resolved to a PACKAGED product and got a retail label serving. The
// queso resolved to a FROZEN MEAL that happened to contain the word. Nothing in
// the chain knew the words "from Rivera's" meant a restaurant plate as served,
// because the restaurant was thrown away at the first step: ParsedName carried
// a name, an amount and a unit, and nothing else.
//
// The fix carries one more thing through: CONTEXT — where the food came from —
// so the pick refuses a frozen bowl for a restaurant dish, and the portion
// question answers for a plate rather than a label. Numbers still come from
// rows; the model still never states one.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateParsedNames } from "@/lib/ai/nutrition-json";
import { PICK_SYSTEM, PORTION_SYSTEM, ESTIMATE_SYSTEM } from "@/lib/nutrition/foodResolve";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a restaurant plate is not a retail serving", () => {
  it("the parsed name carries where the food came from", () => {
    const got = validateParsedNames({
      items: [{ name: "beef fajitas", amount: null, unit: null, context: "restaurant dish, as served at Rivera's" }],
    });
    assert.ok(got, "a plain item still validates");
    assert.equal(got!.items[0].context, "restaurant dish, as served at Rivera's");
    const plain = validateParsedNames({ items: [{ name: "banana", amount: 1, unit: null }] });
    assert.equal(plain!.items[0].context, null, "no context is null, not undefined and not invented");
  });

  it("both parsing prompts ask for the context on restaurant food", () => {
    const act = SRC("src/app/api/nutrition-ai/act/route.ts");
    const parse = SRC("src/app/api/nutrition-ai/parse/route.ts");
    for (const [name, src] of [["act", act], ["parse", parse]] as const) {
      assert.match(src, /"context":string\|null/, `${name} prompt must declare the context field`);
      assert.match(src, /restaurant/i, `${name} prompt must say what to do with a restaurant`);
    }
  });

  it("the resolver hands the context to the pick, the portion and the estimate", () => {
    const resolve = SRC("src/lib/nutrition/resolveFoodOp.ts");
    assert.match(resolve, /export async function resolveFood\([\s\S]*?context\?: string \| null/,
      "resolveFood must accept the context");
    assert.match(resolve, /CONTEXT:/, "the pick and portion messages must carry it");
    assert.match(resolve, /resolveFood\(deps, n\.name, n\.amount, n\.unit, n\.context/,
      "priceNamedFoods must pass it through");
  });

  it("the pick refuses a frozen meal or a packaged product for a restaurant dish", () => {
    assert.match(PICK_SYSTEM, /CONTEXT/, "the pick prompt must know the context line exists");
    assert.match(PICK_SYSTEM, /frozen/i, "a frozen bowl is not a restaurant queso");
    assert.match(PICK_SYSTEM, /restaurant/i);
  });

  it("the portion and the estimate answer for a plate, not a label", () => {
    assert.match(PORTION_SYSTEM, /restaurant/i, "the portion prompt must know a restaurant portion is bigger");
    assert.match(ESTIMATE_SYSTEM, /restaurant/i, "the estimate prompt must answer for the plate as served");
  });
});
