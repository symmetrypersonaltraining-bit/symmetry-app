import test from "node:test";
import assert from "node:assert/strict";
import {
  addItemTo, keyDraft, onTarget, patchItemAt, recomputeDraft, removeItemAt,
  removeMealAt, scaleItemTo, setDraftTargets,
  type DraftItem, type PlanDraft,
} from "../../src/lib/nutrition/draftEdit";
import { fromPct, pctOf, splitAddsUp } from "../../src/lib/nutrition/macroSplit";

/**
 * THE DRAFT TOTAL IS THE SUM OF WHAT IS PRINTED UNDER IT.
 *
 * Dustin, 11 Sep 2026, testing the draft editor: *"I added chicken to one meal
 * and then removed it… it does adjust the calories on the plan that it does
 * not remove when I remove it."* Adding moved the total; taking it away did
 * not bring it back.
 *
 * These run his sequence. The one that caught it is "an amount cleared takes
 * the food's calories with it" — clearing the box left the macros untouched,
 * so a 204 kcal chicken breast with no amount still weighed 204 kcal.
 */

const AI_PLAN: PlanDraft = {
  targets: { kcal: 1850, p: 150, c: 180, f: 55 },
  reasoning: "Steady deficit with protein held high.",
  meals: [
    { name: "Breakfast", timing: "7am", items: [
      { food: "Oats", amount: 80, unit: "g", p: 10, c: 54, f: 6, kcal: 310 },
      { food: "Greek yogurt", amount: 200, unit: "g", p: 20, c: 8, f: 0, kcal: 112 },
    ] },
    { name: "Lunch", timing: "12pm", items: [
      { food: "Rice", amount: 200, unit: "g", p: 5, c: 60, f: 1, kcal: 269 },
    ] },
  ],
  totals: { kcal: 0, p: 0, c: 0, f: 0 },
};

const CHICKEN: DraftItem = {
  food: "Chicken breast", amount: 6, unit: "oz", p: 42, c: 0, f: 4, kcal: 204, _k: "add:0:1",
};

function loaded() {
  return keyDraft(AI_PLAN);
}

test("the total is the sum of the items, not what the model said it was", () => {
  const { draft } = keyDraft({ ...AI_PLAN, totals: { kcal: 9999, p: 9, c: 9, f: 9 } });
  assert.equal(draft.totals.kcal, 310 + 112 + 269);
  assert.equal(draft.totals.p, 35);
});

test("adding a food, then removing it, puts the total back exactly", () => {
  const { draft: original } = loaded();
  const added = addItemTo(original, 0, CHICKEN);
  assert.equal(added.totals.kcal, original.totals.kcal + 204, "adding moves it");

  // Chicken went on the end of meal 0, which had two items.
  const removed = removeItemAt(added, 0, 2);
  assert.deepEqual(removed.totals, original.totals, "and removing brings it back");
});

test("AN AMOUNT CLEARED TAKES THE FOOD'S CALORIES WITH IT — the bug he hit", () => {
  const { draft: original } = loaded();
  const added = addItemTo(original, 0, CHICKEN);

  // He clears the amount box rather than pressing ✕. Before the fix
  // scaleItemTo returned the macros untouched, so the 204 kcal stayed in the
  // total behind an empty box.
  const cleared = patchItemAt(added, 0, 2, scaleItemTo(CHICKEN, null));
  assert.equal(cleared.meals[0].items[2].kcal, 0, "no amount, no calories");
  assert.equal(cleared.meals[0].items[2].p, 0);
  assert.deepEqual(cleared.totals, original.totals, "and the total is back where it started");
});

test("an item with no amount to begin with keeps its macros", () => {
  // "Salt, to taste" has no baseline to scale from; its macros ARE the item.
  const toTaste: DraftItem = { food: "Olive oil, to taste", amount: null, unit: null, p: 0, c: 0, f: 14, kcal: 126 };
  assert.equal(scaleItemTo(toTaste, null).kcal, 126);
  assert.equal(scaleItemTo(toTaste, 2).kcal, 126, "and a typed number cannot scale what has no baseline");
});

test("an amount typed scales from the ORIGINAL every time, never compounding", () => {
  // Typing 170 arrives as 1, then 17, then 170.
  const base: DraftItem = { food: "Chicken", amount: 100, unit: "g", p: 31, c: 0, f: 4, kcal: 160 };
  let it = base;
  for (const n of [1, 17, 170]) it = scaleItemTo(base, n);
  assert.equal(it.amount, 170);
  assert.equal(it.kcal, 272);
  assert.equal(it.p, 52.7);
});

test("removing a whole meal removes its calories", () => {
  const { draft } = loaded();
  const gone = removeMealAt(draft, 1);
  assert.equal(gone.totals.kcal, 310 + 112);
});

test("reverting to the draft as it arrived restores the totals too", () => {
  const { draft: original } = loaded();
  let d = addItemTo(original, 0, CHICKEN);
  d = removeMealAt(d, 1);
  d = setDraftTargets(d, { kcal: 3000, p: 200, c: 300, f: 90 });
  // Revert is "go back to the object loadDraft kept", so the thing that has to
  // hold is that no edit above mutated it.
  assert.deepEqual(original.totals, { kcal: 691, p: 35, c: 122, f: 7 });
  assert.equal(original.meals.length, 2);
  assert.equal(original.targets.kcal, 1850);
});

test("editing the targets never touches what the plan comes to", () => {
  const { draft } = loaded();
  const moved = setDraftTargets(draft, { kcal: 1500, p: 120, c: 150, f: 45 });
  assert.deepEqual(moved.totals, draft.totals);
  assert.equal(moved.targets.kcal, 1500);
});

test("the target check appears and clears with the numbers", () => {
  const { draft } = loaded();
  // 691 kcal against an 1,850 target is nowhere near it.
  assert.equal(draft.targetsMet, false);
  assert.ok(draft.drift && draft.drift.kcal < -1000);

  const met = recomputeDraft({ ...draft, targets: { kcal: 691, p: 35, c: 122, f: 7 } });
  assert.equal(met.targetsMet, undefined, "and it is gone once they agree");
  assert.equal(met.drift, undefined);
});

test("onTarget is the same 3%/5g the server checks with", () => {
  assert.equal(onTarget("kcal", 1900, 1850), true, "50 under a 55.5 tolerance");
  assert.equal(onTarget("kcal", 1960, 1850), false);
  assert.equal(onTarget("p", 155, 150), true);
  assert.equal(onTarget("p", 156, 150), false);
  assert.equal(onTarget("kcal", 1020, 1000), true, "small targets keep a 30 kcal floor");
});

/**
 * Dustin, 11 Sep: *"when I change one, it should not change the others. It
 * should just show that the others do not match up to a hundred percent until
 * I adjust them manually."*
 */
test("a percentage split is only applied once the three total 100", () => {
  const t = { kcal: 1850, p: 150, c: 180, f: 55 };
  const now = pctOf(t);
  assert.equal(splitAddsUp({ ...now, p: now.p + 5 }), false, "one moved on its own is not a split");
  assert.equal(splitAddsUp({ p: 30, c: 45, f: 25 }), true);

  const applied = fromPct(1850, { p: 30, c: 45, f: 25 });
  assert.equal(applied.p, 139);
  assert.equal(applied.c, 208);
  assert.equal(applied.f, 51);
  // Grams stay the truth: the calories are what those grams come to.
  assert.equal(applied.kcal, 139 * 4 + 208 * 4 + 51 * 9);
});
