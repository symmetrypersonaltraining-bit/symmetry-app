// ============================================================================
// E2E — print/PDF math: /nutrition/print?kind=grocery&days=7 must render
// EXACTLY the quantities groceryEngine computes for the fixture plan —
// alternation day-parity totals, lb + oz strings, egg-white counts, fl-oz
// carton math, cooked→dry conversions.
// ============================================================================

import { test, expect } from "@playwright/test";
import { buildGroceryList } from "../../src/lib/nutrition/groceryEngine";
import { PLAN_CLIENT_ID, fixturePlanMeals } from "./helpers";
import { STORAGE_STATE } from "./env";

test.use({ storageState: STORAGE_STATE.plan });

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

test("grocery print matches groceryEngine exactly (7 days from Mon 2026-08-03)", async ({ page }) => {
  const start = "2026-08-03"; // a Monday: Aug 3–9 → 3 even / 4 odd day-of-month
  const days = 7;

  await page.goto(`/nutrition/print?clientId=${PLAN_CLIENT_ID}&kind=grocery&start=${start}&days=${days}`);
  await expect(page.locator("h1")).toHaveText("Grocery List", { timeout: 60_000 });
  const html = await page.content();

  const expected = buildGroceryList(fixturePlanMeals() as never, { startISO: start, days });
  expect(expected.length).toBeGreaterThanOrEqual(10);
  for (const line of expected) {
    expect(html, `grocery line for ${line.food} should render qty "${line.qty}"`).toContain(esc(line.qty));
    expect(html).toContain(esc(line.food));
  }

  // Hard-coded spot checks so engine + fixture can't drift together unnoticed:
  // Chicken = M2 (6 oz × 7d = 42) + alternation even days (Aug 4,6,8 → 3 × 6 = 18)
  //   = 60 oz cooked → ×4/3 = 80 oz raw = 5 lb.
  expect(html).toContain("5 lb raw (80 oz)");
  // Ground beef = odd days (Aug 3,5,7,9 → 4 × 6 = 24 cooked) → 32 raw = 2 lb.
  expect(html).toContain("2 lb raw (32 oz)");
  // Egg whites stay a count: 8 × 7 = 56.
  expect(html).toContain("56 egg whites");
  // Liquid egg whites stay fl oz with carton math.
  expect(html).toContain(esc("56 fl oz (2 × 32 fl oz cartons)"));
  // Cooked grain → dry ÷3 by volume (7 cups → 2.33 dry) for all three grains.
  expect(html.match(/2\.33 cup dry/g)!.length).toBeGreaterThanOrEqual(3);
  // Salmon 35 oz cooked → 46.67 raw = 2 lb 14.7 oz.
  expect(html).toContain("2 lb 14.7 oz raw (46.67 oz)");
  // Unlimited item renders as-needed.
  expect(html).toContain("as needed");
});

test("alternation split flips when the start date shifts one day", async ({ page }) => {
  const start = "2026-08-04"; // Tue: Aug 4–10 → 4 even / 3 odd
  await page.goto(`/nutrition/print?clientId=${PLAN_CLIENT_ID}&kind=grocery&start=${start}&days=7`);
  await expect(page.locator("h1")).toHaveText("Grocery List", { timeout: 60_000 });
  const html = await page.content();

  const expected = buildGroceryList(fixturePlanMeals() as never, { startISO: start, days: 7 });
  for (const line of expected) expect(html).toContain(esc(line.qty));

  // Chicken now 42 + 4×6 = 66 cooked → 88 raw; beef 3×6 = 18 → 24 raw.
  expect(html).toContain("5 lb 8 oz raw (88 oz)");
  expect(html).toContain("1 lb 8 oz raw (24 oz)");
});

test("prep production sheet renders alternation versions with parity containers", async ({ page }) => {
  await page.goto(`/nutrition/print?clientId=${PLAN_CLIENT_ID}&kind=prep&start=2026-08-03&days=7`);
  await expect(page.locator("h1")).toHaveText("Meal-Prep Production Sheet", { timeout: 60_000 });
  const html = await page.content();

  // Dinner alternation → per-version container counts from real calendar parity.
  expect(html).toContain("CHICKEN BREAST VERSION · MAKE 3 CONTAINERS");
  expect(html).toContain("GROUND BEEF 93/7 VERSION · MAKE 4 CONTAINERS");
  // Batch-cook math for the chicken version: 3 × 6 oz = 18 cooked from 24 raw.
  expect(html).toContain(esc("Chicken Breast — cook 1 lb 2 oz (18 oz) total (from 1 lb 8 oz raw) → 6 oz per container ×3"));
});
