// ============================================================================
// THE COACH CAN SEE THE PLAN, NOT JUST TODAY.
//
// Dustin, 13 Sep, in the coach chat:
//   him:  "Different one. Look at tomorrow thats the lunch meal im eating
//          tonight for dinner"
//   it:   "I can only see today's meals. What's in tomorrow's planned lunch
//          that you want to eat for dinner tonight?"
//
// It was telling the truth. `/nutrition-ai/act` is handed DAY CONTEXT — the
// viewed day's meals — and nothing else, and its own prompt says requests about
// "a DIFFERENT day, the plan itself, or targets" are chat rather than actions.
// So the one thing a person does constantly with a standing meal plan — eat
// tomorrow's lunch tonight — was the one thing it had to ask him to type out.
//
// His plan is six meals that repeat every day. The answer was sitting in
// meal_items the whole time.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planContextBlock } from "@/lib/ai/planContext";

const ACT = readFileSync(join(process.cwd(), "src/app/api/nutrition-ai/act/route.ts"), "utf8");

const meals = [
  {
    position: 3, name: "Lunch", timing: "10:30–11:00 AM",
    items: [
      { food: "Chicken Thigh, boneless skinless (cooked)", amount: 200, unit: "g" },
      { food: "White Rice (cooked)", amount: 200, unit: "g" },
      { food: "Broccoli, Asparagus or Green Beans", amount: 2, unit: "cup", is_unlimited: true },
    ],
  },
  { position: 5, name: "Dinner", timing: "5:30–6:00 PM", items: [{ food: "Ground Beef 85/15 (cooked)", amount: 200, unit: "g" }] },
];

describe("the coach can see the plan, not just today", () => {
  it("the block names every meal and what is in it", () => {
    const block = planContextBlock(meals);
    assert.match(block, /M3 Lunch/, "position and name, so it can be referred to");
    assert.match(block, /Chicken Thigh, boneless skinless \(cooked\) 200 g/);
    assert.match(block, /M5 Dinner/);
    assert.match(block, /unlimited/i, "a free vegetable is not a missing amount");
  });

  it("it carries no macro figures", () => {
    // The plan's own numbers are real, but putting them in a prompt invites the
    // model to quote them at a client, and every other number it says has to
    // come back through the pricer. Foods and amounts only — the pricer reads
    // the numbers when the swap is actually made.
    const block = planContextBlock(meals);
    assert.doesNotMatch(block, /kcal|\bP\/|protein/i);
  });

  it("an empty plan says so rather than pretending", () => {
    assert.match(planContextBlock([]), /no standing meal plan/i);
  });

  it("the act route loads the plan and tells the model it may use it", () => {
    assert.match(ACT, /planContextBlock/, "the route must assemble it");
    assert.match(ACT, /PLAN CONTEXT/, "…and put it in the prompt");
    assert.match(ACT, /tomorrow|another day/i,
      "the prompt must say a planned meal from another day can be swapped in");
  });

  it("the old blanket refusal is gone", () => {
    // "Requests about a DIFFERENT day, the plan itself, or targets → intent
    // none" is what produced "I can only see today's meals".
    assert.doesNotMatch(
      ACT,
      /Requests about a DIFFERENT day, the plan itself, or targets → intent "none"/,
      "that rule is what made it refuse a plan meal it could see",
    );
  });
});
