import test from "node:test";
import assert from "node:assert/strict";
import { fitPlanToTargets } from "../../src/lib/nutrition/fitPlanToTargets";
import type { PlanDraft, PlanMeal, PlanMealItem } from "../../src/lib/ai/nutrition-json";
import { planTargetDrift } from "../../src/lib/ai/nutrition-json";

/**
 * Dustin, 13 Sep 2026, on a coach-consult draft: it recommended 1,703 kcal and
 * handed him a plan coming to 5,689.
 *
 *   *"Why would I ask for a recommendation then have it spit out a 5k calorie
 *   meal plan at me? The idea is the AI creates the meal plan based on set
 *   numbers, then I can fine tune the numbers."*
 *
 * The tell in his screenshot is the shape of the miss: protein 145 against a
 * 144 target — exact — and fat 487 against 60. Not every amount inflated; one
 * fat carrying an impossible number.
 */

const item = (food: string, amount: number, unit: string, p: number, c: number, f: number): PlanMealItem =>
  ({ food, amount, unit, p, c, f, kcal: Math.round(p * 4 + c * 4 + f * 9) }) as PlanMealItem;

const meal = (name: string, items: PlanMealItem[]): PlanMeal => ({
  name, timing: null, items,
  subtotal: items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  ),
});

function draft(meals: PlanMeal[], targets = { kcal: 1703, p: 144, c: 147, f: 60 }): PlanDraft {
  const totals = meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.subtotal.kcal, p: a.p + m.subtotal.p, c: a.c + m.subtotal.c, f: a.f + m.subtotal.f }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  return { targets, reasoning: null, meals, totals } as PlanDraft;
}

/** His draft: three sane meals, and one item with a slipped decimal. */
const HIS_DRAFT = draft([
  meal("Meal 1", [
    item("Rolled oats (dry)", 50, "g", 6.5, 32, 3.5),
    item("Protein powder, whey", 31, "g", 24, 2, 1),
    item("Bananas, raw", 100, "g", 1.1, 23, 0.3),
  ]),
  meal("Meal 2", [
    item("Oikos Triple Zero Greek Yogurt", 150, "g", 15, 6, 0),
    item("Rice cakes, brown rice", 3, "cake", 2, 22, 0.8),
    item("Nuts, almonds", 15, "g", 3.2, 3.3, 7.5),
  ]),
  meal("Meal 3", [
    item("Chicken breast, cooked", 200, "g", 62, 0, 7),
    item("White rice, cooked", 200, "g", 5, 56, 0.6),
    // 450 g of oil. 4,050 kcal of fat, on its own, in a 1,703 kcal day.
    item("Olive oil", 450, "g", 0, 0, 450),
  ]),
]);

test("his draft's SHAPE reproduces: three times the target, and the miss is all fat", () => {
  // Not the exact 5,689 — these are representative foods, not his. The shape is
  // the point: a plan multiples over its target where one macro carries all of
  // the excess, which is what says "one bad amount" rather than "all of them".
  assert.ok(HIS_DRAFT.totals.kcal > 5000, `came to ${HIS_DRAFT.totals.kcal} against 1,703`);
  assert.ok(HIS_DRAFT.totals.f > 460, `fat came to ${HIS_DRAFT.totals.f}g against a 60g target`);
  assert.ok(HIS_DRAFT.totals.c < 200, "while carbs stayed in the right neighbourhood");
  assert.equal(planTargetDrift(HIS_DRAFT).ok, false, "and the old code shipped exactly this");
});

test("the slipped decimal is dropped, and named", () => {
  const { dropped } = fitPlanToTargets(HIS_DRAFT);
  assert.deepEqual(dropped, ["Olive oil"], "one food, not a proportional squeeze on all of them");
});

test("what is left lands on the target CALORIE", () => {
  const { plan } = fitPlanToTargets(HIS_DRAFT);
  assert.ok(
    Math.abs(plan.totals.kcal - 1703) <= 30,
    `came to ${plan.totals.kcal} against 1,703 — he asked for the draft to be set at the number`,
  );
});

test("and the macros are then close, not perfect — which is what the boxes are for", () => {
  // ONE SCALE FACTOR CANNOT HIT FOUR NUMBERS. Scaling every amount by the same
  // multiplier lands the calories exactly and moves protein, carbs and fat by
  // that same multiplier, so a plan whose SPLIT was wrong stays wrong in
  // proportion. That is the honest outcome and it is a long way from 5,689
  // against 1,703: the per-box "145 of 144g" lines show what is left, and he
  // fine-tunes from there — which is the workflow he described.
  //
  // Fitting all four would mean solving per item rather than per plan. Worth
  // doing; not worth pretending this does it.
  const { plan } = fitPlanToTargets(HIS_DRAFT);
  const d = planTargetDrift(plan);
  assert.ok(Math.abs(d.drift.kcal) <= 30, "calories are on");
  assert.ok(Math.abs(d.drift.f) < 40, `fat went from 427g out to ${Math.abs(d.drift.f)}g out`);
});

test("dropping comes BEFORE scaling, or the absurd item just gets smaller", () => {
  // Scale-first would keep 450g of oil at ~135g — still 1,215 kcal of a 1,703
  // kcal day — and starve every other food to make room for it.
  const { plan } = fitPlanToTargets(HIS_DRAFT);
  const foods = plan.meals.flatMap((m) => m.items.map((i) => i.food));
  assert.ok(!foods.includes("Olive oil"));
  const chicken = plan.meals[2].items.find((i) => i.food.startsWith("Chicken"));
  assert.ok(chicken!.amount! > 50, `chicken kept a real portion: ${chicken!.amount}g`);
});

test("scaling keeps every number row-derived — the macros move with the amount", () => {
  const one = draft(
    [meal("M1", [item("Bananas, raw", 100, "g", 1.1, 23, 0.3), item("Bananas, raw", 100, "g", 1.1, 23, 0.3)])],
    { kcal: 99, p: 1.1, c: 23, f: 0.3 },
  );
  const { plan, factor } = fitPlanToTargets(one);
  const banana = plan.meals[0].items[0];
  assert.ok(Math.abs(factor - 0.5) < 0.05, `halved: ${factor}`);
  assert.ok(Math.abs(banana.amount! - 50) <= 2, `50 g of banana, not a re-invented number: ${banana.amount}`);
  assert.ok(Math.abs(banana.c - 11.5) < 1, "and its carbs halved with it");
});

test("a plan already on target is left completely alone", () => {
  const onTarget = draft(
    [meal("M1", [item("Chicken breast, cooked", 200, "g", 62, 0, 7), item("White rice, cooked", 200, "g", 5, 56, 0.6)])],
    { kcal: 560, p: 67, c: 56, f: 7.6 },
  );
  const { plan, factor, dropped } = fitPlanToTargets(onTarget);
  assert.equal(factor, 1);
  assert.deepEqual(dropped, []);
  assert.deepEqual(plan.meals[0].items[0].amount, 200, "not nudged by rounding");
});

test("a countable amount stays countable", () => {
  const cakes = draft(
    [meal("M1", [item("Rice cakes", 8, "cake", 5, 60, 2), item("Chicken breast, cooked", 200, "g", 62, 0, 7)])],
    { kcal: 300, p: 33, c: 30, f: 4.5 },
  );
  const { plan } = fitPlanToTargets(cakes);
  const n = plan.meals[0].items[0].amount!;
  assert.equal(n * 2, Math.round(n * 2), `${n} cakes is a number someone can serve`);
});

test("a plan needing more than a 4x change is reported, not squeezed", () => {
  const tiny = draft(
    [meal("M1", [item("Lettuce", 100, "g", 1, 2, 0), item("Cucumber", 100, "g", 0.7, 3, 0.1)])],
    { kcal: 2000, p: 150, c: 200, f: 60 },
  );
  const { stillOff, factor } = fitPlanToTargets(tiny);
  assert.equal(factor, 4, "clamped");
  assert.equal(stillOff, true, "and said so rather than serving 8 kg of lettuce");
});

test("a legitimate large portion is NOT mistaken for a slipped decimal", () => {
  // The rule that measured a share of the target dropped this chicken breast,
  // and a banana. "More than the whole day" does not.
  const real = draft(
    [meal("M1", [item("Chicken breast, cooked", 200, "g", 62, 0, 7), item("Bananas, raw", 100, "g", 1.1, 23, 0.3)])],
    { kcal: 410, p: 63, c: 23, f: 7.3 },
  );
  assert.deepEqual(fitPlanToTargets(real).dropped, []);
});

test("a one-item plan is never emptied", () => {
  const lone = draft([meal("M1", [item("Olive oil", 450, "g", 0, 0, 450)])], { kcal: 1703, p: 144, c: 147, f: 60 });
  const { plan, dropped } = fitPlanToTargets(lone);
  assert.deepEqual(dropped, [], "nothing left to scale is a worse answer than a bad plan");
  assert.equal(plan.meals[0].items.length, 1);
});

test("no targets, no fitting — it cannot invent one", () => {
  const none = { targets: { kcal: 0, p: 0, c: 0, f: 0 }, reasoning: null, meals: [], totals: { kcal: 0, p: 0, c: 0, f: 0 } } as PlanDraft;
  const { plan, factor } = fitPlanToTargets(none);
  assert.equal(factor, 1);
  assert.equal(plan.meals.length, 0);
});

test("the route fits before it measures, and reports what it removed", () => {
  const route = require("node:fs").readFileSync("src/app/api/nutrition-ai/plan-build/route.ts", "utf8");
  const fitAt = route.indexOf("fitPlanToTargets(plan)");
  const driftAt = route.indexOf("planTargetDrift(plan)");
  assert.ok(fitAt > 0 && driftAt > fitAt, "measuring a plan you have not fitted is the bug");
  assert.match(route, /unpriced: removed/, "a dropped food rides back with the unpriced ones");
});
