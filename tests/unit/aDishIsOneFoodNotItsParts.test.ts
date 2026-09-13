// ============================================================================
// A DISH IS ONE FOOD, NOT ITS PARTS.
//
// Dustin re-logged his 12 Sep lunch once the restaurant lookup was live:
// *"Texas Roadhouse bacon cheeseburger, with a side salad with ranch and three
// bread"*. The numbers went from 560 kcal to 2,100 — the right order of
// magnitude at last — and one fault was still sitting inside the total:
//
//   Bacon Cheeseburger (whole sandwich — patty, cheese slice, bacon and bun
//     are not individually published; macros represent the full composite
//     sandwich as served)                                    986 kcal
//   American Pasteurized Processed Cheese Slice                61 kcal   ←
//   Pork, cured, bacon, cooked, baked                          44 kcal   ←
//   Roll, white, hamburger bun                                115 kcal   ←
//
// The line that says IN ITS OWN NAME that it already contains the cheese, the
// bacon and the bun, followed by the cheese, the bacon and the bun. 220 kcal
// counted twice, on the most confident-looking line of the meal.
//
// The parsing rule that caused it is a good rule doing the wrong job: "with",
// "and" and "w" introduce another food, and "a bagel w cream cheese" really is
// two. But the bacon in a bacon cheeseburger is not a food eaten alongside the
// burger — it is what the burger IS, and the restaurant's published number for
// the sandwich already has it in.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every door that turns a sentence into a list of foods. */
const PARSERS: [string, string][] = [
  ["parse", "src/app/api/nutrition-ai/parse/route.ts"],
  ["act", "src/app/api/nutrition-ai/act/route.ts"],
  ["meal-edit", "src/app/api/nutrition-ai/meal-edit/route.ts"],
];

describe("a dish is one food, not its parts", () => {
  for (const [name, path] of PARSERS) {
    it(`${name} is told that a dish name already contains its parts`, () => {
      const src = SRC(path);
      assert.match(src, /A DISH NAME IS ONE FOOD/,
        "the rule has to be stated, not implied by an example list");
      assert.match(src, /bacon cheeseburger/i,
        "…with the case that actually failed, named");
      assert.match(src, /twice|double/i,
        "…and the consequence said out loud: the dish's number already has it in");
    });
  }

  it("the restaurant lookup will not add a component of its own accord", () => {
    const web = SRC("src/lib/nutrition/webNutrition.ts");
    assert.match(web, /ONE item per food you were asked about/,
      "an extra component line from the search would double-count the same way");
  });
});
