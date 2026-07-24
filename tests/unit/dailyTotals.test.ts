// ============================================================================
// Unit tests — src/lib/nutrition/dailyTotals.ts (the canonical daily calc).
// Run: npm run test:unit   (node --import tsx --test)
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PlanMeal,
  LogRow,
  ItemOverrides,
  CustomMeta,
  computeDayTotals,
  logConsumedMacros,
  planMealMacros,
  customMealMacros,
  adherencePct,
  dayAdherencePct,
  isExtraLog,
  kcalOf,
  EXTRA_POSITIONS,
  ZERO,
} from "../../src/lib/nutrition/dailyTotals";

// ---------------------------------------------------------------------------
// Fixture plan — mirrors the dev-project E2E fixture ("V3 Plan Tester").
// ---------------------------------------------------------------------------
function makePlan(): PlanMeal[] {
  return [
    {
      id: "m1", name: "Breakfast", timing: "7:30 AM", position: 1,
      meal_items: [
        { id: "i11", food: "Egg Whites", amount: 8, unit: "whites", is_unlimited: false, protein: 26, carbs: 2, fats: 0, position: 1 },
        { id: "i12", food: "Oatmeal", amount: 1, unit: "cup", is_unlimited: false, basis: "cooked", protein: 5, carbs: 27, fats: 3, position: 2 },
        { id: "i13", food: "Liquid Egg Whites", amount: 8, unit: "fl oz", is_unlimited: false, protein: 25, carbs: 0, fats: 0, position: 3 },
      ],
    },
    {
      id: "m2", name: "Lunch", timing: "12:30 PM", position: 2,
      meal_items: [
        { id: "i21", food: "Chicken Breast", amount: 6, unit: "oz", is_unlimited: false, basis: "cooked", protein: 42, carbs: 0, fats: 5, position: 1 },
        { id: "i22", food: "White Rice", amount: 1, unit: "cup", is_unlimited: false, basis: "cooked", protein: 4, carbs: 45, fats: 0, position: 2 },
        { id: "i23", food: "Broccoli", amount: null, unit: null, is_unlimited: true, protein: 0, carbs: 0, fats: 0, position: 3 },
      ],
    },
    {
      id: "m3", name: "Snack", timing: "3:30 PM", position: 3,
      meal_items: [
        { id: "i31", food: "Whey Protein", amount: 1, unit: "scoop", is_unlimited: false, protein: 25, carbs: 3, fats: 2, position: 1 },
        { id: "i32", food: "Almonds", amount: 1, unit: "oz", is_unlimited: false, protein: 6, carbs: 6, fats: 14, position: 2 },
      ],
    },
  ];
}

const M1 = { p: 56, c: 29, f: 3 };           // kcal 367
const M1_KCAL = kcalOf(M1.p, M1.c, M1.f);    // 367
const M2 = { p: 46, c: 45, f: 5 };           // kcal 409
const M2_KCAL = kcalOf(M2.p, M2.c, M2.f);

function log(partial: Partial<LogRow> & { meal_position: number }): LogRow {
  return { meal_id: null, adherence: null, ...partial };
}

// ---------------------------------------------------------------------------
describe("kcalOf / adherencePct", () => {
  it("kcal = 4p + 4c + 9f", () => {
    assert.equal(kcalOf(56, 29, 3), 367);
    assert.equal(kcalOf(0, 0, 0), 0);
  });
  it("maps every adherence key (incl. legacy Partial)", () => {
    assert.equal(adherencePct("Full"), 1);
    assert.equal(adherencePct("3/4"), 0.75);
    assert.equal(adherencePct("1/2"), 0.5);
    assert.equal(adherencePct("1/4"), 0.25);
    assert.equal(adherencePct("Partial"), 0.5);
    assert.equal(adherencePct("Skipped"), 0);
    assert.equal(adherencePct("Off-plan"), null);
    assert.equal(adherencePct("garbage"), null);
    assert.equal(adherencePct(null), null);
    assert.equal(adherencePct(undefined), null);
  });
});

describe("proration matrix — plan meal logged at each level", () => {
  const plan = makePlan();
  const cases: [string, number][] = [
    ["Full", 1], ["3/4", 0.75], ["1/2", 0.5], ["1/4", 0.25], ["Skipped", 0],
  ];
  for (const [adh, pct] of cases) {
    it(`${adh} → ${pct * 100}% of meal macros`, () => {
      const t = computeDayTotals([log({ meal_position: 1, meal_id: "m1", adherence: adh })], plan);
      assert.equal(t.kcal, M1_KCAL * pct);
      assert.equal(t.protein, M1.p * pct);
      assert.equal(t.carbs, M1.c * pct);
      assert.equal(t.fats, M1.f * pct);
      assert.equal(t.loggedCount, 1); // Skipped is still "logged" (a decision was made)
    });
  }
  it("legacy Partial → 50%", () => {
    const t = computeDayTotals([log({ meal_position: 1, meal_id: "m1", adherence: "Partial" })], plan);
    assert.equal(t.kcal, M1_KCAL * 0.5);
  });
  it("sums multiple meals at mixed adherence", () => {
    const t = computeDayTotals(
      [
        log({ meal_position: 1, meal_id: "m1", adherence: "Full" }),
        log({ meal_position: 2, meal_id: "m2", adherence: "1/2" }),
      ],
      plan
    );
    assert.equal(t.kcal, M1_KCAL + M2_KCAL * 0.5);
    assert.equal(t.protein, M1.p + M2.p * 0.5);
    assert.equal(t.loggedCount, 2);
  });
});

describe("off-plan est_*", () => {
  const plan = makePlan();
  it("Off-plan uses est_* (not the plan meal)", () => {
    const t = computeDayTotals(
      [log({ meal_position: 1, meal_id: "m1", adherence: "Off-plan", est_kcal: 650, est_protein: 45, est_carbs: 60, est_fats: 22 })],
      plan
    );
    assert.deepEqual({ kcal: t.kcal, p: t.protein, c: t.carbs, f: t.fats }, { kcal: 650, p: 45, c: 60, f: 22 });
  });
  it("derives kcal from est macros when est_kcal is null", () => {
    const t = computeDayTotals(
      [log({ meal_position: 1, adherence: "Off-plan", est_kcal: null, est_protein: 40, est_carbs: 50, est_fats: 10 })],
      plan
    );
    assert.equal(t.kcal, kcalOf(40, 50, 10));
  });
  it("Off-plan without est_* falls back to itemized __custom", () => {
    const meta: CustomMeta = { name: "Bowl", items: [{ n: "Chicken", p: 40, c: 0, f: 8 }, { n: "Rice", p: 4, c: 44, f: 1 }] };
    const t = computeDayTotals([log({ meal_position: 1, adherence: "Off-plan", item_overrides: { __custom: meta } })], plan);
    assert.equal(t.protein, 44);
    assert.equal(t.kcal, kcalOf(44, 44, 9));
  });
  it("Off-plan with neither est_* nor __custom contributes 0", () => {
    const t = computeDayTotals([log({ meal_position: 1, adherence: "Off-plan" })], plan);
    assert.equal(t.kcal, 0);
    assert.equal(t.loggedCount, 1);
  });
  it("row with est_* but no adherence (legacy writers) still counts est_*", () => {
    const t = computeDayTotals([log({ meal_position: 9, adherence: null, est_kcal: 300, est_protein: 20, est_carbs: 30, est_fats: 8 })], plan);
    assert.equal(t.kcal, 300);
  });
  it("unknown adherence value → est_* if present, else 0", () => {
    const plan2 = makePlan();
    assert.equal(computeDayTotals([log({ meal_position: 1, meal_id: "m1", adherence: "Mystery" })], plan2).kcal, 0);
    assert.equal(
      computeDayTotals([log({ meal_position: 1, meal_id: "m1", adherence: "Mystery", est_kcal: 111, est_protein: 1, est_carbs: 1, est_fats: 1 })], plan2).kcal,
      111
    );
  });
});

describe("item_overrides — amounts + __added", () => {
  const plan = makePlan();
  it("amount override scales that item only", () => {
    // Chicken 6 oz → 3 oz (half): meal = half chicken + full rice
    const ov: ItemOverrides = { i21: { amount: 3 } };
    const m = planMealMacros(plan[1], ov);
    assert.equal(m.protein, 42 * 0.5 + 4);
    assert.equal(m.carbs, 45);
    assert.equal(m.fats, 2.5);
    assert.equal(m.kcal, kcalOf(42 * 0.5 + 4, 45, 2.5));
  });
  it("amount override of 0 zeroes the item", () => {
    const ov: ItemOverrides = { i21: { amount: 0 } };
    const m = planMealMacros(plan[1], ov);
    assert.equal(m.protein, 4);
    assert.equal(m.fats, 0);
  });
  it("__added foods contribute p/c/f × servings", () => {
    const ov: ItemOverrides = { __added: [{ name: "Oikos", servings: 2, p: 15, c: 7, f: 0 }] };
    const m = planMealMacros(plan[0], ov);
    assert.equal(m.protein, M1.p + 30);
    assert.equal(m.carbs, M1.c + 14);
  });
  it("overrides + __added prorate together through adherence", () => {
    const ov: ItemOverrides = { i21: { amount: 3 }, __added: [{ name: "Oikos", servings: 1, p: 15, c: 7, f: 0 }] };
    const t = computeDayTotals([log({ meal_position: 2, meal_id: "m2", adherence: "1/2", item_overrides: ov })], plan);
    const p = 42 * 0.5 + 4 + 15, c = 45 + 7, f = 2.5;
    assert.equal(t.protein, p * 0.5);
    assert.equal(t.kcal, kcalOf(p, c, f) * 0.5);
  });
  it("only-__ meta keys do not trigger the override scan (no accidental zeroing)", () => {
    const m = planMealMacros(plan[0], { __ord: 3 } as ItemOverrides);
    assert.equal(m.kcal, M1_KCAL);
  });
});

describe("placeholders — __removed / __unlogged / __custom.unlogged / pending", () => {
  const plan = makePlan();
  it("__removed contributes 0 and is not counted as logged", () => {
    const t = computeDayTotals(
      [log({ meal_position: 1, meal_id: "m1", adherence: "Skipped", item_overrides: { __removed: true } })],
      plan
    );
    assert.equal(t.kcal, 0);
    assert.equal(t.loggedCount, 0);
  });
  it("__unlogged (ordering/edit placeholder) contributes 0 and is not logged", () => {
    const t = computeDayTotals(
      [log({ meal_position: 1, meal_id: "m1", adherence: "Skipped", item_overrides: { __unlogged: true, __ord: 2 } })],
      plan
    );
    assert.equal(t.kcal, 0);
    assert.equal(t.loggedCount, 0);
  });
  it("__custom.unlogged placeholder contributes 0", () => {
    const meta: CustomMeta = { name: "Swap", unlogged: true, items: [{ n: "X", p: 50, c: 50, f: 50 }] };
    const t = computeDayTotals([log({ meal_position: 1, adherence: "Skipped", item_overrides: { __custom: meta } })], plan);
    assert.equal(t.kcal, 0);
    assert.equal(t.loggedCount, 0);
  });
  it("macros_pending contributes 0 but bumps pendingCount", () => {
    const t = computeDayTotals(
      [log({ meal_position: 6, adherence: "Off-plan", macros_pending: true, est_kcal: null })],
      plan
    );
    assert.equal(t.kcal, 0);
    assert.equal(t.pendingCount, 1);
    assert.equal(t.loggedCount, 1);
  });
  it("logConsumedMacros returns ZERO for every placeholder shape", () => {
    const byId = new Map(plan.map((m) => [m.id, m]));
    const byPos = new Map(plan.map((m) => [m.position, m]));
    assert.deepEqual(logConsumedMacros(log({ meal_position: 1, adherence: "Full", meal_id: "m1", item_overrides: { __removed: true } }), byId, byPos), ZERO);
    assert.deepEqual(logConsumedMacros(log({ meal_position: 1, adherence: "Full", meal_id: "m1", item_overrides: { __unlogged: true } }), byId, byPos), ZERO);
    assert.deepEqual(logConsumedMacros(log({ meal_position: 1, adherence: "Full", meal_id: "m1", macros_pending: true }), byId, byPos), ZERO);
  });
});

describe("day-custom meals (__custom) logged with plan-style adherence", () => {
  const plan = makePlan();
  const meta: CustomMeta = { name: "Salmon bowl", items: [{ n: "Salmon", p: 29, c: 0, f: 11 }, { n: "Rice", p: 4, c: 44, f: 1, fac: 2 }] };
  it("prorates itemized custom macros (fac multipliers honored)", () => {
    // items: p = 29 + 8 = 37, c = 88, f = 13
    const t = computeDayTotals([log({ meal_position: 1, adherence: "3/4", item_overrides: { __custom: meta } })], plan);
    assert.equal(t.protein, 37 * 0.75);
    assert.equal(t.carbs, 88 * 0.75);
    assert.equal(t.kcal, kcalOf(37, 88, 13) * 0.75);
  });
  it("customMealMacros ignores missing fac (defaults 1)", () => {
    const m = customMealMacros({ name: "x", items: [{ n: "a", p: 10, c: 10, f: 10 }] });
    assert.equal(m.kcal, kcalOf(10, 10, 10));
  });
});

describe("extras band 6/7 (never 101)", () => {
  const plan = makePlan(); // occupies positions 1–3
  const planPositions = new Set(plan.map((m) => m.position));
  it("positions 6 and 7 are the extras band", () => {
    assert.deepEqual(EXTRA_POSITIONS, [6, 7]);
  });
  it("extra at 6/7 counts est_* into totals", () => {
    const t = computeDayTotals(
      [
        log({ meal_position: 6, adherence: "Off-plan", est_kcal: 210, est_protein: 5, est_carbs: 30, est_fats: 8 }),
        log({ meal_position: 7, adherence: "Off-plan", est_kcal: 90, est_protein: 2, est_carbs: 20, est_fats: 0 }),
      ],
      plan
    );
    assert.equal(t.kcal, 300);
  });
  it("isExtraLog: bare 6/7 row = extra; legacy ≥101 = extra", () => {
    assert.equal(isExtraLog(log({ meal_position: 6 }), planPositions), true);
    assert.equal(isExtraLog(log({ meal_position: 101, adherence: "Off-plan" }), planPositions), true);
  });
  it("isExtraLog: NOT an extra when the plan owns that position, meal_id set, or __custom present", () => {
    const bigPlan = new Set([...planPositions, 6]);
    assert.equal(isExtraLog(log({ meal_position: 6 }), bigPlan), false);
    assert.equal(isExtraLog(log({ meal_position: 6, meal_id: "m9" }), planPositions), false);
    assert.equal(
      isExtraLog(log({ meal_position: 6, item_overrides: { __custom: { name: "ins", items: [] } } }), planPositions),
      false
    );
    assert.equal(isExtraLog(log({ meal_position: 2 }), planPositions), false);
  });
});

describe("trainer_macro_override precedence", () => {
  const plan = makePlan();
  it("wins over est_* on an off-plan row", () => {
    const t = computeDayTotals(
      [log({
        meal_position: 1, adherence: "Off-plan",
        est_kcal: 650, est_protein: 45, est_carbs: 60, est_fats: 22,
        trainer_macro_override: { kcal: 500, protein: 40, carbs: 45, fats: 15 },
      })],
      plan
    );
    assert.deepEqual({ k: t.kcal, p: t.protein }, { k: 500, p: 40 });
  });
  it("wins over the prorated plan meal", () => {
    const t = computeDayTotals(
      [log({ meal_position: 1, meal_id: "m1", adherence: "3/4", trainer_macro_override: { protein: 100, carbs: 0, fats: 0 } })],
      plan
    );
    assert.equal(t.protein, 100);
    assert.equal(t.kcal, 400); // derived 4×100 when kcal not supplied
  });
  it("empty/kcal-only override object does NOT hijack (needs a macro set)", () => {
    const t = computeDayTotals(
      [log({ meal_position: 1, meal_id: "m1", adherence: "Full", trainer_macro_override: { kcal: 999 } })],
      plan
    );
    assert.equal(t.kcal, M1_KCAL); // ignored — no p/c/f in the override
  });
});

describe("meal resolution — meal_id first, then position, then est fallback", () => {
  const plan = makePlan();
  it("meal_id wins over position (multi-option slots)", () => {
    // Log points at m3 but sits at position 1: must use m3's macros.
    const t = computeDayTotals([log({ meal_position: 1, meal_id: "m3", adherence: "Full" })], plan);
    assert.equal(t.protein, 31);
  });
  it("falls back to position when meal_id missing", () => {
    const t = computeDayTotals([log({ meal_position: 2, adherence: "Full" })], plan);
    assert.equal(t.kcal, M2_KCAL);
  });
  it("plan re-versioned (unknown meal, position > 100): est_* keeps history", () => {
    const t = computeDayTotals([log({ meal_position: 101, meal_id: "gone", adherence: "Full", est_kcal: 420, est_protein: 30, est_carbs: 40, est_fats: 10 })], plan);
    assert.equal(t.kcal, 420);
  });
  it("unknown meal and no est_* → 0", () => {
    const t = computeDayTotals([log({ meal_position: 55, meal_id: "gone", adherence: "Full" })], plan);
    assert.equal(t.kcal, 0);
  });
  it("first option at a position wins the position fallback", () => {
    const twoOpt: PlanMeal[] = [
      { ...makePlan()[0], id: "optA", position: 1 },
      { ...makePlan()[2], id: "optB", position: 1 },
    ];
    const t = computeDayTotals([log({ meal_position: 1, adherence: "Full" })], twoOpt);
    assert.equal(t.kcal, M1_KCAL); // optA
  });
});

describe("dayAdherencePct", () => {
  const plan = makePlan(); // 3 plan slots
  it("null with no plan or nothing logged", () => {
    assert.equal(dayAdherencePct([], []), null);
    assert.equal(dayAdherencePct([], plan), null);
  });
  it("averages across ALL plan slots (unlogged slots count as 0 in the denominator)", () => {
    const pct = dayAdherencePct([log({ meal_position: 1, meal_id: "m1", adherence: "Full" })], plan);
    assert.ok(Math.abs(pct! - 100 / 3) < 1e-9);
  });
  it("Off-plan slot counts 0.75; extras/inserts don't dilute", () => {
    const pct = dayAdherencePct(
      [
        log({ meal_position: 1, meal_id: "m1", adherence: "Full" }),
        log({ meal_position: 2, adherence: "Off-plan", est_kcal: 500 }),
        log({ meal_position: 3, meal_id: "m3", adherence: "1/2" }),
        log({ meal_position: 6, adherence: "Off-plan", est_kcal: 200 }),   // extra — ignored
        log({ meal_position: 21, adherence: "Off-plan", est_kcal: 300 }),  // inserted — ignored
      ],
      plan
    );
    assert.ok(Math.abs(pct! - ((1 + 0.75 + 0.5) / 3) * 100) < 1e-9);
  });
  it("placeholder rows (unlogged/removed) are ignored", () => {
    const pct = dayAdherencePct(
      [
        log({ meal_position: 1, meal_id: "m1", adherence: "Skipped", item_overrides: { __unlogged: true } }),
        log({ meal_position: 2, meal_id: "m2", adherence: "Skipped", item_overrides: { __removed: true } }),
      ],
      plan
    );
    assert.equal(pct, null);
  });
});

describe("computeDayTotals — full mixed day (integration of everything)", () => {
  it("plan Full + custom ¾ + off-plan est + extra + placeholders + pending", () => {
    const plan = makePlan();
    const customMeta: CustomMeta = { name: "Bowl", items: [{ n: "X", p: 20, c: 40, f: 10 }] };
    const t = computeDayTotals(
      [
        log({ meal_position: 1, meal_id: "m1", adherence: "Full" }),                                        // 367
        log({ meal_position: 2, adherence: "Off-plan", est_kcal: 600, est_protein: 40, est_carbs: 50, est_fats: 20 }), // 600
        log({ meal_position: 21, adherence: "Off-plan", est_kcal: 330, est_protein: 15, est_carbs: 30, est_fats: 15, item_overrides: { __custom: customMeta } }), // 330 (est wins)
        log({ meal_position: 6, adherence: "Off-plan", est_kcal: 210, est_protein: 5, est_carbs: 30, est_fats: 8 }),   // 210
        log({ meal_position: 3, meal_id: "m3", adherence: "Skipped", item_overrides: { __unlogged: true } }),          // 0, not logged
        log({ meal_position: 7, adherence: "Off-plan", macros_pending: true }),                                        // 0, pending
      ],
      plan
    );
    assert.equal(t.kcal, 367 + 600 + 330 + 210);
    assert.equal(t.protein, 56 + 40 + 15 + 5);
    assert.equal(t.loggedCount, 5);
    assert.equal(t.pendingCount, 1);
  });
});
