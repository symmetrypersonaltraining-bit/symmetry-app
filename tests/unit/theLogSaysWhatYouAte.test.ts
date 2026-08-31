// "I ate last week's dinner — why is it showing me chicken and rice?"
//
// Dustin, 31 Aug. He ate the previous week's Dinner in place of both Lunch and
// Dinner, logged both Off-plan, and the macros went in correctly. Opening
// either meal to edit the items showed him the PLANNED Lunch — chicken thigh
// 200 g, white rice 200 g, avocado oil 2 tbsp — item for item.
//
// The log row was right the whole time. meal_id pointed at the sirloin Dinner
// exactly as it should, which is why repointing it in the database changed
// nothing on screen.
//
// The fault was one line:
//
//     const options = byPos[pos];                       // meals AT THIS POSITION
//     const chosen  = options.find(o => o.id === log?.meal_id)
//                  || options.find(o => o.id === optSel[pos])
//                  || options[0];                       // <- served the plan
//
// The eaten meal is a Dinner, position 5. The row being drawn is position 3. So
// the find missed and the fallback quietly served the planned Lunch: no error,
// no empty state, a confident wrong answer shaped exactly like a right one.
//
// A meal id identifies a MEAL. Resolving it only within one position is the bug.

import { test } from "node:test";
import assert from "node:assert/strict";

interface Meal { id: string; position: number; name: string; meal_items: { food: string }[] }

const LUNCH: Meal = {
  id: "plan-lunch", position: 3, name: "Lunch",
  meal_items: [{ food: "Chicken Thigh" }, { food: "White Rice" }, { food: "Avocado Oil" }],
};
const DINNER: Meal = {
  id: "20915370-802a-4d57-84ca-a35ca81777b4", position: 5, name: "Dinner",
  meal_items: [{ food: "Sirloin" }, { food: "Potato" }],
};
const PLAN = [LUNCH, DINNER];

/** How the row picks its meal, after the fix. */
function chosenFor(pos: number, log: { meal_id: string | null } | undefined, known: Meal[]) {
  const options = known.filter((m) => m.position === pos);
  const byId = new Map(known.map((m) => [m.id, m]));
  const eaten = log?.meal_id ? byId.get(log.meal_id) : undefined;
  return eaten || options.find((o) => o.id === log?.meal_id) || options[0];
}

/** The version he was using. */
function chosenBefore(pos: number, log: { meal_id: string | null } | undefined, known: Meal[]) {
  const options = known.filter((m) => m.position === pos);
  return options.find((o) => o.id === log?.meal_id) || options[0];
}

test("the bug, reproduced exactly", () => {
  const log = { meal_id: DINNER.id };
  const wrong = chosenBefore(3, log, PLAN);
  assert.equal(wrong.name, "Lunch");
  assert.deepEqual(wrong.meal_items.map((i) => i.food), ["Chicken Thigh", "White Rice", "Avocado Oil"]);
});

test("a meal eaten from another position now resolves to what was eaten", () => {
  const log = { meal_id: DINNER.id };
  const got = chosenFor(3, log, PLAN);
  assert.equal(got.name, "Dinner");
  assert.deepEqual(got.meal_items.map((i) => i.food), ["Sirloin", "Potato"]);
});

test("both slots he logged it into show the same eaten meal", () => {
  for (const pos of [3, 5]) {
    assert.equal(chosenFor(pos, { meal_id: DINNER.id }, PLAN).id, DINNER.id);
  }
});

test("an ordinary logged meal is unchanged", () => {
  // The overwhelming majority of rows: meal_id IS the slot's own plan meal.
  // This path must behave exactly as it did before.
  assert.equal(chosenFor(3, { meal_id: LUNCH.id }, PLAN).id, LUNCH.id);
  assert.equal(chosenBefore(3, { meal_id: LUNCH.id }, PLAN).id, LUNCH.id);
});

test("no meal_id still falls back to the slot's planned meal", () => {
  // Free-text off-plan, and un-logged slots. Nothing to resolve, so the plan
  // answers — same as before.
  assert.equal(chosenFor(3, { meal_id: null }, PLAN).id, LUNCH.id);
  assert.equal(chosenFor(3, undefined, PLAN).id, LUNCH.id);
});

test("a meal id we cannot find anywhere falls back rather than blanking", () => {
  // An older plan version whose fetch failed. Falling back to the plan is what
  // happened before this change, so a failed lookup is never WORSE than today.
  const got = chosenFor(3, { meal_id: "gone-with-an-old-version" }, PLAN);
  assert.equal(got.id, LUNCH.id);
});
