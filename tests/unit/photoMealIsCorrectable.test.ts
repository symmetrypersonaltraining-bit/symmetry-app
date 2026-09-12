import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { photoItemsFor, toPhotoItem } from "../../src/lib/nutrition/photoItems";

/**
 * Dustin, 12 Sep 2026, having photographed a cheesecake and eaten four slices:
 * *"4 slices it says 1 slice. also I can't edit it, edit screen shows
 * originals."*
 *
 * One cause, two symptoms: /api/analyze-meal-photo returned totals and no item
 * list, so the estimate card had no stepper to correct the count with, and the
 * saved row had no __custom.items so it stayed kind "plan" and Edit opened the
 * meal plan's own editor.
 */

const CHEESECAKE = [
  { name: "Cheesecake slice, New York style", amount: "1 slice", calories: 370, protein_g: 6, carbs_g: 40, fat_g: 21 },
];

test("a photo comes back as items he can count, not a paragraph", () => {
  const items = photoItemsFor(CHEESECAKE, 370);
  assert.equal(items.length, 1);
  assert.equal(items[0].a, "1 slice", "the COUNT is the amount — that is what makes it correctable");
  assert.equal(items[0].k, 370);
  assert.equal(items[0].est, true);
});

test("the count is what the stepper multiplies — four slices, not one", () => {
  // The estimate card's stepper caps at ×4, which is exactly his case. This is
  // the arithmetic it does, and the point is that there is now something to do
  // it TO.
  const [slice] = photoItemsFor(CHEESECAKE, 370);
  const four = { ...slice, fac: 4 };
  assert.equal(four.k * (four.fac ?? 1), 1480);
  assert.equal(four.p * (four.fac ?? 1), 24);
});

test("items that disagree with the total are DROPPED, not shown", () => {
  // The totals are anchored to official nutrition data; the items are a
  // breakdown of them. A stepper that jumps the day's total the moment it is
  // touched is worse than no stepper.
  const wrong = [{ name: "Cheesecake", amount: "1 slice", calories: 900, protein_g: 6, carbs_g: 40, fat_g: 21 }];
  assert.deepEqual(photoItemsFor(wrong, 370), [], "a breakdown 530 kcal out is not a breakdown");
});

test("a breakdown that is merely rounded still comes through", () => {
  const rounded = [
    { name: "Wings, bone-in", amount: "6 wings", calories: 540, protein_g: 48, carbs_g: 0, fat_g: 38 },
    { name: "Ranch dip", amount: "2 tbsp", calories: 130, protein_g: 1, carbs_g: 2, fat_g: 14 },
  ];
  const items = photoItemsFor(rounded, 690);
  assert.equal(items.length, 2, "670 against 690 is inside the tolerance");
  assert.equal(items[0].a, "6 wings");
});

test("small meals get a floor rather than a percentage", () => {
  // 10% of 120 kcal is 12, which no honest breakdown will hit. The floor is 60.
  const apple = [{ name: "Apple", amount: "1 medium", calories: 95, protein_g: 0, carbs_g: 25, fat_g: 0 }];
  assert.equal(photoItemsFor(apple, 120).length, 1);
});

test("a junk entry cannot become an item", () => {
  assert.equal(toPhotoItem(null), null);
  assert.equal(toPhotoItem({ amount: "1 slice" }), null, "no name, no item");
  assert.equal(toPhotoItem("cheesecake"), null);
  const neg = toPhotoItem({ name: "X", calories: -50, protein_g: -3 });
  assert.equal(neg!.k, 0, "a negative macro is an absence, never a subtraction");
  assert.equal(neg!.p, 0);
});

test("calories are computed when the model omits them", () => {
  const it = toPhotoItem({ name: "Rice", amount: "1 cup", protein_g: 4, carbs_g: 45, fat_g: 0.4 });
  assert.equal(it!.k, Math.round(4 * 4 + 45 * 4 + 0.4 * 9));
});

test("no list at all is a valid answer — the card falls back to totals", () => {
  assert.deepEqual(photoItemsFor(undefined, 370), []);
  assert.deepEqual(photoItemsFor([], 370), []);
  assert.deepEqual(photoItemsFor(CHEESECAKE, 0), [], "no total to check against");
});

/**
 * THE SHEET HAS TO SURVIVE THE CAMERA.
 *
 * *"It takes the picture, then it goes back to the menu."* Opening the camera
 * backgrounds the PWA for well over RefreshOnReturn's 3s MIN_AWAY_MS, so
 * coming back fires router.refresh(), which re-renders the nutrition screen.
 * That is safe — refresh() "unmounts nothing" — only while the component TYPES
 * at each position are stable. A sheet mounted through a wrapper declared
 * INSIDE the screen component gets a new function identity every render, so
 * React tears the subtree down and the photo, the estimate and the mode go
 * with it.
 */
const SCREEN = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8",
);

test("the off-plan sheet is mounted by a component that does not change identity", () => {
  assert.match(SCREEN, /case "offplan": return \(\s*\n\s*<OffPlanFlow/,
    "the offplan case must name the module-level component directly");
  assert.doesNotMatch(SCREEN, /function OffPlanSheetView/,
    "a wrapper declared inside the screen is a new type every render — that is the bug");
  assert.match(SCREEN, /^function OffPlanFlow\(/m,
    "and OffPlanFlow has to stay at module level for that to mean anything");
});

test("the route hands the item list on", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/analyze-meal-photo/route.ts"), "utf8");
  assert.match(route, /photoItemsFor\(result\.items, kcal\)/, "parsed through the tested helper");
  assert.match(route, /\n\s*items,\n/, "and returned to the screen");
  assert.match(route, /"items": \[\{ "name": string, "amount": string/, "and asked for in the prompt");
});
