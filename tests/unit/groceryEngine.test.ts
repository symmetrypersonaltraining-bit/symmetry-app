// ============================================================================
// Unit tests — src/lib/nutrition/groceryEngine.ts (grocery + prep math).
// Run: npm run test:unit   (node --import tsx --test)
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAlts,
  parityCounts,
  altDayCounts,
  lbOz,
  fmtNum,
  buildGroceryList,
  buildPrepCards,
  RangeSpec,
} from "../../src/lib/nutrition/groceryEngine";
import { PlanMeal } from "../../src/lib/nutrition/dailyTotals";

// Fixture plan — mirrors the dev E2E fixture (V3 Plan Tester, 5 meals).
function fixturePlan(): PlanMeal[] {
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
      id: "m4", name: "Dinner", timing: "6:30 PM", position: 4,
      meal_items: [
        { id: "i41", food: "Chicken Breast (even days) OR Ground Beef 93/7 (odd days)", amount: 6, unit: "oz", is_unlimited: false, basis: "cooked", protein: 40, carbs: 0, fats: 8, position: 1 },
        { id: "i42", food: "Jasmine Rice", amount: 1, unit: "cup", is_unlimited: false, basis: "cooked", protein: 4, carbs: 44, fats: 1, position: 2 },
      ],
    },
  ];
}

// Monday 2026-07-06 → 6,7,8,9,10,11,12 (4 even / 3 odd day-of-month).
const MON: RangeSpec = { startISO: "2026-07-06", days: 7 };
// Tuesday 2026-07-07 → 7..13 (3 even / 4 odd) — one-day shift flips the split.
const TUE: RangeSpec = { startISO: "2026-07-07", days: 7 };

describe("parseAlts", () => {
  it("splits annotated alternation and strips the annotation", () => {
    const alts = parseAlts("Chicken Breast (even days) OR Ground Beef 93/7 (odd days)");
    assert.deepEqual(alts, [
      { name: "Chicken Breast", parity: "even" },
      { name: "Ground Beef 93/7", parity: "odd" },
    ]);
  });
  it("un-annotated A OR B → parity null", () => {
    assert.deepEqual(parseAlts("Tilapia OR Cod"), [
      { name: "Tilapia", parity: null },
      { name: "Cod", parity: null },
    ]);
  });
  it("non-alternating food → null", () => {
    assert.equal(parseAlts("Chicken Breast"), null);
    assert.equal(parseAlts(""), null);
  });
});

describe("parityCounts / altDayCounts — real calendar-date parity", () => {
  it("7 days from Monday 2026-07-06 → 4 even / 3 odd", () => {
    assert.deepEqual(parityCounts(MON), { even: 4, odd: 3 });
  });
  it("start shifted one day → split flips (3 even / 4 odd)", () => {
    assert.deepEqual(parityCounts(TUE), { even: 3, odd: 4 });
  });
  it("crosses a month boundary on real dates (Jul 30 → Aug 5)", () => {
    // 30e,31o,1o,2e,3o,4e,5o → 3 even / 4 odd
    assert.deepEqual(parityCounts({ startISO: "2026-07-30", days: 7 }), { even: 3, odd: 4 });
  });
  it("annotated alts map to their parity counts", () => {
    const alts = parseAlts("Chicken Breast (even days) OR Ground Beef (odd days)")!;
    assert.deepEqual(altDayCounts(alts, MON), [4, 3]);
    assert.deepEqual(altDayCounts(alts, TUE), [3, 4]);
  });
  it("un-annotated alts split evenly, first gets the extra day", () => {
    const alts = parseAlts("Tilapia OR Cod")!;
    assert.deepEqual(altDayCounts(alts, MON), [4, 3]);
    assert.deepEqual(altDayCounts(parseAlts("A OR B OR C")!, { startISO: "2026-07-06", days: 7 }), [3, 2, 2]);
  });
});

describe("lbOz formatter", () => {
  it("under 1 lb stays oz", () => assert.equal(lbOz(12), "12 oz"));
  it("exact pounds omit the oz remainder", () => assert.equal(lbOz(32), "2 lb"));
  it("mixed lb + oz", () => assert.equal(lbOz(56), "3 lb 8 oz"));
  it("rounds remainder to 0.1 oz", () => assert.equal(lbOz(46.6666), "2 lb 14.7 oz"));
  it("fmtNum trims to 2dp", () => {
    assert.equal(fmtNum(2.3333333), "2.33");
    assert.equal(fmtNum(56), "56");
  });
});

describe("buildGroceryList — raw conversions & units over a 7-day Monday window", () => {
  const list = buildGroceryList(fixturePlan(), MON);
  const byFood = (name: string) => {
    const l = list.find((x) => x.food === name);
    assert.ok(l, `grocery line missing: ${name} (have: ${list.map((x) => x.food).join(", ")})`);
    return l!;
  };

  it("cooked meat ×4/3 raw, shown lb + oz (M2 42 oz + alt 24 oz = 66 cooked → 88 raw)", () => {
    // M2 chicken (6 oz × 7d) and the alternation's chicken (6 oz × 4 even days)
    // share the aggregation key, so the grocery list shows ONE merged line.
    assert.equal(byFood("Chicken Breast").qty, "5 lb 8 oz raw (88 oz)");
    assert.equal(byFood("Chicken Breast").group, "protein");
  });
  it("alternating item counted by real day parity — chicken 4 even days", () => {
    // Alternation chicken: 6 oz × 4 even days = 24 cooked → 32 raw = exactly 2 lb.
    // It aggregates into the same "Chicken Breast" key as M2? No — M2 chicken is
    // a separate add() only if the key matches; both are 'chicken breast|oz|c',
    // so they MERGE: 42 + 24 = 66 cooked → 88 raw.
    // Assert via a plan with ONLY the alternating meal to isolate the math:
    const altOnly = buildGroceryList([fixturePlan()[2]], MON);
    const chick = altOnly.find((x) => x.food === "Chicken Breast")!;
    const beef = altOnly.find((x) => x.food === "Ground Beef 93/7")!;
    assert.equal(chick.qty, "2 lb raw (32 oz)");
    assert.equal(beef.qty, "1 lb 8 oz raw (24 oz)");
  });
  it("alternation flips with the start date", () => {
    const altOnly = buildGroceryList([fixturePlan()[2]], TUE);
    const chick = altOnly.find((x) => x.food === "Chicken Breast")!;
    const beef = altOnly.find((x) => x.food === "Ground Beef 93/7")!;
    assert.equal(chick.qty, "1 lb 8 oz raw (24 oz)"); // 3 even days
    assert.equal(beef.qty, "2 lb raw (32 oz)");        // 4 odd days
  });
  it("isolated M2 (no alternation meal) shows the unmerged 6 oz x 7d math", () => {
    const m2Only = buildGroceryList([fixturePlan()[1]], MON);
    assert.equal(m2Only.find((x) => x.food === "Chicken Breast")!.qty, "3 lb 8 oz raw (56 oz)");
  });
  it("egg-white counts stay counts (8 × 7 = 56 egg whites)", () => {
    assert.equal(byFood("Egg Whites").qty, "56 egg whites");
  });
  it("liquid egg whites stay fl oz with carton math (56 fl oz → 2 cartons)", () => {
    assert.equal(byFood("Liquid Egg Whites").qty, "56 fl oz (2 × 32 fl oz cartons)");
  });
  it("cooked rice/oats → dry ÷3 by volume (7 cups cooked → 2.33 cup dry)", () => {
    assert.equal(byFood("White Rice").qty, "2.33 cup dry");
    assert.equal(byFood("Jasmine Rice").qty, "2.33 cup dry");
    assert.equal(byFood("Oatmeal").qty, "2.33 cup dry");
  });
  it("unlimited items → 'as needed' in the free group", () => {
    const broc = byFood("Broccoli");
    assert.equal(broc.qty, "as needed");
    assert.equal(broc.group, "free");
    assert.equal(broc.unlimited, true);
  });
  it("groups are ordered protein → carbs → fats → other → free", () => {
    const order = { protein: 0, carbs: 1, fats: 2, other: 3, free: 4 } as const;
    for (let i = 1; i < list.length; i++) {
      assert.ok(order[list[i - 1].group] <= order[list[i].group]);
    }
  });
});

describe("buildGroceryList — merge check for the combined plan", () => {
  it("M2 chicken (42 oz cooked) merges with alternation chicken (24 oz cooked) → 66 → 88 raw", () => {
    const list = buildGroceryList(fixturePlan(), MON);
    const lines = list.filter((x) => x.food === "Chicken Breast");
    // Both alternation chicken and M2 chicken share key 'chicken breast||oz||c'
    // → exactly ONE merged line at 66 cooked → 88 raw = 5 lb 8 oz.
    assert.equal(lines.length, 1);
    assert.equal(lines[0].qty, "5 lb 8 oz raw (88 oz)");
  });
});

describe("raw→cooked conversions — weight-based grains and potatoes", () => {
  const mk = (food: string, amount: number, unit: string, basis?: string): PlanMeal => ({
    id: "x", name: "Meal", timing: null, position: 1,
    meal_items: [{ id: "ix", food, amount, unit, is_unlimited: false, basis: basis ?? "cooked", protein: 0, carbs: 0, fats: 0, position: 1 }],
  });
  const one: RangeSpec = { startISO: "2026-07-06", days: 1 };
  it("grains by weight ÷2.8 (280 g cooked → 100 g dry)", () => {
    const l = buildGroceryList([mk("White Rice", 280, "g")], one);
    assert.equal(l[0].qty, "100 g dry");
  });
  it("potatoes ×1.2 raw", () => {
    const l = buildGroceryList([mk("Sweet Potato", 10, "oz")], one);
    assert.equal(l[0].qty, "12 oz raw");
  });
  it("meat in grams converts to lb+oz with gram detail", () => {
    const l = buildGroceryList([mk("Chicken Breast", 170, "g")], one);
    // 170 g cooked → 226.67 g raw → 7.995... oz → "8 oz (227 g)"
    assert.match(l[0].qty, /^8 oz raw \(227 g\)$/);
  });
  it("non-cooked items pass through untouched", () => {
    const l = buildGroceryList([mk("Almonds", 1, "oz", "raw")], { startISO: "2026-07-06", days: 7 });
    assert.equal(l[0].qty, "7 oz");
  });
});

// ---------------------------------------------------------------------------
// meals.rotation day_parity metadata — preferred over string parsing.
// ---------------------------------------------------------------------------
describe("meals.rotation day_parity — grocery list uses exact metadata amounts", () => {
  // Same alternating meal as the fixture, but with structured metadata whose
  // odd amount (5 oz) DIFFERS from the item amount (6 oz) — proves the
  // metadata, not the string parser, drives the math.
  const rotMeal = (): PlanMeal => ({
    ...fixturePlan()[2],
    rotation: {
      type: "day_parity",
      even: { food: "Chicken Breast", amount: 6, unit: "oz" },
      odd: { food: "Ground Beef 93/7", amount: 5, unit: "oz" },
    },
  });

  it("Monday window: chicken 6 oz × 4 even days, beef 5 oz × 3 odd days", () => {
    const list = buildGroceryList([rotMeal()], MON);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "2 lb raw (32 oz)");
    // 5 × 3 = 15 cooked → ×4/3 = 20 oz raw (string parser would say 24).
    assert.equal(list.find((x) => x.food === "Ground Beef 93/7")!.qty, "1 lb 4 oz raw (20 oz)");
  });
  it("split flips with the start date (Tuesday: 3 even / 4 odd)", () => {
    const list = buildGroceryList([rotMeal()], TUE);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "1 lb 8 oz raw (24 oz)");
    // 5 × 4 = 20 cooked → 26.67 raw.
    assert.equal(list.find((x) => x.food === "Ground Beef 93/7")!.qty, "1 lb 10.7 oz raw (26.67 oz)");
  });
  it("works when the item food is already normalized (no 'A OR B' string)", () => {
    const m = rotMeal();
    m.meal_items[0] = { ...m.meal_items[0], food: "Chicken Breast" };
    const list = buildGroceryList([m], MON);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "2 lb raw (32 oz)");
    assert.equal(list.find((x) => x.food === "Ground Beef 93/7")!.qty, "1 lb 4 oz raw (20 oz)");
  });
  it("metadata 'oz cooked' units mark the alternative cooked (raw conversion applies)", () => {
    const m = rotMeal();
    m.meal_items[0] = { ...m.meal_items[0], basis: null, unit: "oz cooked", food: "Chicken Breast OR Ground Beef 93/7" };
    m.rotation = {
      type: "day_parity",
      even: { food: "Chicken Breast", amount: 6, unit: "oz cooked" },
      odd: { food: "Ground Beef 93/7", amount: 6, unit: "oz cooked" },
    };
    const list = buildGroceryList([m], MON);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "2 lb raw (32 oz)");
    assert.equal(list.find((x) => x.food === "Ground Beef 93/7")!.qty, "1 lb 8 oz raw (24 oz)");
  });
  it("weekly rotation metadata is informational — string parser still runs", () => {
    const m = fixturePlan()[2];
    m.rotation = { type: "weekly", note: "Week 2 of 3" };
    const list = buildGroceryList([m], MON);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "2 lb raw (32 oz)");
    assert.equal(list.find((x) => x.food === "Ground Beef 93/7")!.qty, "1 lb 8 oz raw (24 oz)");
  });
  it("malformed day_parity (missing odd) falls back to the string parser", () => {
    const m = fixturePlan()[2];
    m.rotation = { type: "day_parity", even: { food: "Chicken Breast", amount: 6, unit: "oz" } };
    const list = buildGroceryList([m], MON);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "2 lb raw (32 oz)");
    assert.equal(list.find((x) => x.food === "Ground Beef 93/7")!.qty, "1 lb 8 oz raw (24 oz)");
  });
});

describe("meals.rotation day_parity — prep cards", () => {
  const rotMeal = (): PlanMeal => ({
    ...fixturePlan()[2],
    rotation: {
      type: "day_parity",
      even: { food: "Chicken Breast", amount: 6, unit: "oz" },
      odd: { food: "Ground Beef 93/7", amount: 5, unit: "oz" },
    },
  });

  it("splits into metadata-labeled versions with real parity container counts", () => {
    const { cards } = buildPrepCards([rotMeal()], MON);
    assert.equal(cards.length, 1);
    const groups = cards[0].groups;
    assert.equal(groups.length, 2);
    assert.equal(groups[0].label, "CHICKEN BREAST VERSION");
    assert.equal(groups[0].containers, 4);
    assert.equal(groups[1].label, "GROUND BEEF 93/7 VERSION");
    assert.equal(groups[1].containers, 3);
  });
  it("per-container + batch lines use the exact metadata amount (5 oz beef, not 6)", () => {
    const { cards } = buildPrepCards([rotMeal()], MON);
    const beef = cards[0].groups[1];
    assert.equal(beef.items.find((i) => i.food === "Ground Beef 93/7")!.qty, "5 oz cooked (142 g)");
    assert.equal(
      beef.batch.find((b) => b.startsWith("Ground Beef")),
      "Ground Beef 93/7 — cook 15 oz (15 oz) total (from 1 lb 4 oz raw) → 5 oz per container ×3"
    );
  });
  it("container split flips with the start date", () => {
    const { cards } = buildPrepCards([rotMeal()], TUE);
    assert.equal(cards[0].groups[0].containers, 3);
    assert.equal(cards[0].groups[1].containers, 4);
  });
});

// ---------------------------------------------------------------------------
// Prod verification fixture — Dustin's LIVE plan v2 (0fc5bea1) M2, verbatim
// from prod meals/meal_items + the meals.rotation jsonb populated 2026-07-24.
// ---------------------------------------------------------------------------
describe("Dustin live plan v2 M2 — prod rotation jsonb drives the exact protein split", () => {
  const dustinM2 = (): PlanMeal => ({
    id: "40a7a5f5-5175-4f38-b49f-2e6ced80d55a",
    name: "M2 — Lunch",
    timing: "8:00–9:00 AM — first break between clients",
    position: 2,
    rotation: {
      type: "day_parity",
      even: { food: "Chicken Breast", amount: 6, unit: "oz" },
      odd: { food: "Ground Beef 96/4", amount: 6, unit: "oz" },
    },
    meal_items: [
      { id: "718d48f4", food: "Chicken Breast (even days) OR Ground Beef 96/4 (odd days)", amount: 6, unit: "oz", is_unlimited: false, basis: null, protein: 46, carbs: 0, fats: 7, position: 1 },
      { id: "6dd28cf1", food: "Basmati Rice", amount: 67.5, unit: "g", is_unlimited: false, basis: null, protein: 2, carbs: 15, fats: 0.2, position: 2 },
      { id: "13c883f1", food: "Broccoli / Asparagus / Green Beans", amount: 2, unit: "cup", is_unlimited: true, basis: null, protein: 0, carbs: 0, fats: 0, position: 3 },
    ],
  });
  // 7 days from Fri 2026-07-24 → 24,25,26,27,28,29,30 = 4 even / 3 odd.
  const WEEK: RangeSpec = { startISO: "2026-07-24", days: 7 };

  it("grocery: chicken 6 oz × 4 even days, beef 6 oz × 3 odd days (not cooked → no raw conversion)", () => {
    const list = buildGroceryList([dustinM2()], WEEK);
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.qty, "1 lb 8 oz (24 oz)");
    assert.equal(list.find((x) => x.food === "Ground Beef 96/4")!.qty, "1 lb 2 oz (18 oz)");
    assert.equal(list.find((x) => x.food === "Chicken Breast")!.group, "protein");
  });
  it("prep sheet: both container groups with real parity counts", () => {
    const { cards } = buildPrepCards([dustinM2()], WEEK);
    const groups = cards[0].groups;
    assert.equal(groups.length, 2);
    assert.equal(groups[0].label, "CHICKEN BREAST VERSION");
    assert.equal(groups[0].containers, 4);
    assert.equal(groups[1].label, "GROUND BEEF 96/4 VERSION");
    assert.equal(groups[1].containers, 3);
  });
});

describe("buildPrepCards — alternation versions with real day counts", () => {
  it("alternating meal splits into CHICKEN/BEEF versions, 4/3 containers from a Monday", () => {
    const { cards } = buildPrepCards([fixturePlan()[2]], MON);
    assert.equal(cards.length, 1);
    const groups = cards[0].groups;
    assert.equal(groups.length, 2);
    assert.equal(groups[0].label, "CHICKEN BREAST VERSION");
    assert.equal(groups[0].containers, 4);
    assert.equal(groups[1].label, "GROUND BEEF 93/7 VERSION");
    assert.equal(groups[1].containers, 3);
  });
  it("batch line: cooked total + raw source math (4 containers × 6 oz)", () => {
    const { cards } = buildPrepCards([fixturePlan()[2]], MON);
    const chicken = cards[0].groups[0];
    const line = chicken.batch.find((b) => b.startsWith("Chicken Breast"));
    // 24 oz cooked total from 32 oz raw
    assert.equal(line, "Chicken Breast — cook 1 lb 8 oz (24 oz) total (from 2 lb raw) → 6 oz per container ×4");
  });
  it("per-container macros use the resolved alternative's items", () => {
    const { cards } = buildPrepCards([fixturePlan()[2]], MON);
    const g = cards[0].groups[0];
    // 40P/0C/8F + rice 4P/44C/1F = 44P 44C 9F → 433 kcal
    assert.deepEqual(g.perContainer, { kcal: 433, p: 44, c: 44, f: 9 });
  });
  it("non-alternating meal → one unlabeled group with `days` containers", () => {
    const { cards } = buildPrepCards([fixturePlan()[1]], MON);
    assert.equal(cards[0].groups.length, 1);
    assert.equal(cards[0].groups[0].label, "");
    assert.equal(cards[0].groups[0].containers, 7);
  });
  it("freshMealIds skip containers and land in the fresh list", () => {
    const plan = fixturePlan();
    const { cards, fresh } = buildPrepCards(plan, MON, new Set(["m1"]));
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].mealName, "Breakfast");
    assert.equal(fresh[0].days, 7);
    assert.ok(!cards.some((c) => c.mealName === "Breakfast"));
  });
  it("egg-white batch lines crack counts, fl oz batch lines pour", () => {
    const { cards } = buildPrepCards([fixturePlan()[0]], { startISO: "2026-07-06", days: 3 });
    const g = cards[0].groups[0];
    assert.ok(g.batch.some((b) => b === "Egg Whites — crack 24 egg whites total → 8 per container ×3"));
    assert.ok(g.batch.some((b) => b === "Liquid Egg Whites — pour 24 fl oz liquid total → 8 fl oz per container ×3"));
  });
});
