// ============================================================================
// A RESTAURANT IS LOOKED UP, NOT RECALLED.
//
// Dustin, 12 Sep 2026: *"that ai assistant needs to search actual numbers when
// the restaurant is mentioned n needs to be able to determine the real numbers
// exactly the way you do it. Check my lunch today, once again the ai is nowhere
// even close. This cannot be released as a paid app."*
//
// Two restaurant meals in two days came out at about half:
//
//   11 Sep  fajitas from Rivera's → 634 kcal (a packaged product at a 78 g
//           label serving, and a FROZEN taco bowl for the queso)
//   12 Sep  lunch → a cheeseburger priced at 42 kcal as "1 slice"
//
// The 11 Sep fix carried the restaurant through to the row pick. It could not
// fix the real problem: FOOD_CATALOG DOES NOT CONTAIN RESTAURANT FOOD. It is
// USDA plus grocery labels, so "which of these ten rows is a Rivera's fajita
// plate" has no right answer and every answer is wrong.
//
// So a named restaurant now gets searched: the model opens the restaurant's
// published nutrition and reads the numbers off it, and every item it returns
// carries the page it was read from. What it cannot source falls through to
// the catalogue. What it returns without a source, or with calories that
// contradict its own macros, is thrown away.
//
// The validator tests below RUN the real function against real payloads — not
// a source grep — because "no page, no number" is the whole guarantee.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateWebFoods, placeFromContext } from "@/lib/nutrition/webNutrition";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const WEB = SRC("src/lib/nutrition/webNutrition.ts");
const OP = SRC("src/lib/nutrition/resolveFoodOp.ts");

/** A well-formed sourced item: 47P / 7C / 33F derives to 513 kcal. */
const good = {
  name: "beef fajitas",
  found: true,
  matched: "Beef Fajita Plate",
  portion: "1 plate",
  grams: 340,
  protein: 47,
  carbs: 7,
  fats: 33,
  kcal: 513,
  source_url: "https://example-restaurant.com/nutrition.pdf",
  basis: "official",
};

describe("a restaurant is looked up, not recalled", () => {
  it("a sourced, self-consistent item is kept", () => {
    const got = validateWebFoods({ items: [good] });
    assert.ok(got, "a good item must survive");
    assert.equal(got!.length, 1);
    assert.equal(got![0].sourceUrl, "https://example-restaurant.com/nutrition.pdf");
    assert.equal(got![0].protein, 47);
    assert.equal(got![0].basis, "official");
  });

  it("an item with no page is dropped — that is recall wearing a source's clothes", () => {
    const { source_url: _drop, ...noPage } = good;
    assert.equal(validateWebFoods({ items: [noPage] }), null);
    assert.equal(validateWebFoods({ items: [{ ...good, source_url: "example-restaurant.com" }] }), null,
      "a bare domain is not a page that was read");
  });

  it("an item whose calories contradict its own macros is dropped", () => {
    // 47/7/33 derives to 513. Claiming 250 means the page was misread or two
    // different portions were mixed together.
    assert.equal(validateWebFoods({ items: [{ ...good, kcal: 250 }] }), null);
    // Within 15% is a rounding difference on a published label, not a misread.
    assert.ok(validateWebFoods({ items: [{ ...good, kcal: 530 }] }));
    // No stated kcal at all is fine: the app derives its own.
    assert.ok(validateWebFoods({ items: [{ ...good, kcal: null }] }));
  });

  it("found:false is an honest gap, not a zero", () => {
    const got = validateWebFoods({ items: [{ name: "house salsa", found: false }, good] });
    assert.equal(got!.length, 1, "the unfound item must not become a 0-calorie food");
    assert.equal(got![0].name, "beef fajitas");
  });

  it("only a named place is searched — a kitchen has no nutrition page", () => {
    assert.equal(placeFromContext("restaurant dish, as served at Rivera's (Tex-Mex)"), "Rivera's (Tex-Mex)");
    assert.equal(placeFromContext("homemade"), null);
    assert.equal(placeFromContext(null), null);
    assert.equal(placeFromContext(""), null);
  });

  it("the search tool is real, and the model is not asked to remember", () => {
    assert.match(WEB, /type: "web_search_20260209", name: "web_search"/,
      "the server-side search tool must actually be declared");
    assert.match(WEB, /EVERY item you return must carry "source_url"/,
      "the prompt must demand the page, not the number");
    assert.match(WEB, /Never invent one/i);
  });

  it("the resolver tries the restaurant before the grocery catalogue", () => {
    assert.match(OP, /lookupRestaurantFoods/, "priceNamedFoods must run the web lookup");
    assert.match(OP, /placeFromContext/, "…only when a place was actually named");
    // One call per meal, not one per food: the grouping has to exist.
    assert.match(OP, /byPlace/, "items sharing a restaurant are looked up together");
    // A miss still falls through to the existing chain.
    assert.match(OP, /resolveFood\(deps, n\.name, n\.amount, n\.unit, n\.context \?\? null\)/);
  });

  it("a web-sourced item carries its page into the log", () => {
    assert.match(OP, /source_url/, "PricedItem must carry where the number came from");
  });
});
