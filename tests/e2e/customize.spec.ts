// ============================================================================
// E2E — day customization + AI-backed flows with the AI routes MOCKED
// (no ANTHROPIC key in this environment; interception at the browser layer).
// Covers: copy-to-slot, add-meal-anywhere (typed parse), quick-add extra
// (typed parse → position 6), off-plan photo flow (EST badge + est_* AND
// off_plan_macros written together).
// ============================================================================

import { test, expect, Page } from "@playwright/test";
import {
  PLAN_CLIENT_ID, resetLogs, logsToday, logAtPosition, waitForDb,
  muteCoach, mockParseRoute, mockAnalyzePhotoRoute, TINY_JPEG,
} from "./helpers";
import { STORAGE_STATE } from "./env";

test.use({ storageState: STORAGE_STATE.plan });

async function openLogger(page: Page) {
  await muteCoach(page);
  await page.goto("/nutrition");
  await expect(page.locator('[data-rowkey="p1"]')).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(async () => {
  await resetLogs(PLAN_CLIENT_ID);
});

test("copy-to-slot: plan meal copies to end of day as an unlogged custom", async ({ page }) => {
  await openLogger(page);

  await page.locator('[data-rowkey="p1"]').getByLabel("more").click();
  await page.getByRole("button", { name: "Copy to slot…" }).click();
  await page.getByRole("button", { name: "After M5 (end of day)" }).click();
  await expect(page.getByText("Copied ✓ — meals renumbered")).toBeVisible();

  // New custom row rendered with the copy name + CUSTOM badge.
  const copyRow = page.locator('[data-rowkey="c21"]');
  await expect(copyRow).toBeVisible();
  await expect(copyRow.getByText("Breakfast (copy)")).toBeVisible();
  await expect(copyRow.getByText("CUSTOM")).toBeVisible();

  // DB: inserted-meals band (21–40), unlogged copy, zero effect on totals.
  const row = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 21), (r) => !!r);
  expect(row!.adherence).toBe("Skipped");
  const meta = row!.item_overrides?.__custom;
  expect(meta?.kind).toBe("copy");
  expect(meta?.unlogged).toBe(true);
  expect(meta?.items?.length).toBe(3); // Egg Whites + Oatmeal + Liquid Egg Whites
  await expect(page.getByText("2,400 left")).toBeVisible();

  // One tap on the copy logs it (custom → Off-plan + est_* = item totals 367).
  await page.locator('[data-rowkey="c21"] button').first().click();
  await expect(page.getByText("2,033 left")).toBeVisible();
  const logged = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 21), (r) => r?.adherence === "Off-plan");
  expect(logged!.adherence).toBe("Off-plan");
  expect(Number(logged!.est_kcal)).toBe(367);
});

test("add-meal-anywhere: ＋ line → typed parse (mocked) → logged meal in place", async ({ page }) => {
  await openLogger(page);
  await mockParseRoute(page, [
    { name: "Chicken breast", amount: 8, unit: "oz", kcal: 250, p: 50, c: 0, f: 5 },
    { name: "Jasmine rice", amount: 1, unit: "cup", kcal: 205, p: 4, c: 45, f: 0 },
  ]);

  // The ＋ line between M1 and M2 (index 1 of the insert lines).
  await page.getByLabel("add a meal here").nth(1).click();
  await page.getByRole("button", { name: "Type what you ate (with amounts)" }).click();
  await page.getByPlaceholder(/Type items with amounts/).fill("8 oz chicken, 1 cup jasmine rice");
  await page.getByRole("button", { name: "AI parse items →" }).click();

  // Parsed items listed with EST marker, then log.
  await expect(page.getByText("Chicken breast", { exact: true })).toBeVisible();
  await expect(page.getByText("Jasmine rice", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log it ✓" }).click();
  await expect(page.getByText("Logged ✓ — totals updated")).toBeVisible();

  // Row lands BETWEEN M1 and (old) M2, i.e. second in the list, renumbered M2.
  const keys = await page.locator("[data-rowkey]").evaluateAll((els) => els.map((e) => e.getAttribute("data-rowkey")));
  expect(keys).toEqual(["p1", "c21", "p2", "p3", "p4", "p5"]);

  // Macro bar: custom totals from p/c/f = 54P/45C/5F → 441 kcal → 1,959 left.
  await expect(page.getByText("1,959 left")).toBeVisible();

  const row = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 21), (r) => r?.adherence === "Off-plan");
  expect(row!.adherence).toBe("Off-plan");
  expect(Number(row!.est_kcal)).toBe(441);
  expect(Number(row!.est_protein)).toBe(54);
  expect(row!.item_overrides?.__custom?.kind).toBe("insert");
  expect(row!.item_overrides?.__ord).toBe(5); // midpoint between M1 (0) and M2 (10)
});

test("quick-add extra via typed parse (mocked) → extras band position 6", async ({ page }) => {
  await openLogger(page);
  await mockParseRoute(page, [
    { name: "Protein bar", amount: 1, unit: "bar", kcal: 210, p: 20, c: 24, f: 6 },
  ]);

  await page.getByRole("button", { name: /Quick-add an extra/ }).click();
  await page.getByRole("button", { name: "Type foods with amounts" }).click();
  await page.getByPlaceholder(/Type items with amounts/).fill("1 protein bar");
  await page.getByRole("button", { name: "AI parse items →" }).click();
  await expect(page.getByText("Protein bar").first()).toBeVisible();
  await page.getByRole("button", { name: "Log it — totals update ✓" }).click();
  await expect(page.getByText("Added to your day ✓")).toBeVisible();

  // Extras section shows the entry with an EST badge and its macros.
  await expect(page.getByText("EST", { exact: true })).toBeVisible();
  // kcal recomputed from p/c/f: 4·20 + 4·24 + 9·6 = 230 → 2,170 left.
  await expect(page.getByText("2,170 left")).toBeVisible();

  const row = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 6), (r) => !!r);
  expect(row!.meal_position).toBe(6); // extras band — never 101
  expect(row!.meal_id).toBeNull();
  expect(row!.adherence).toBe("Off-plan");
  expect(Number(row!.est_kcal)).toBe(230);
  expect(row!.item_overrides?.__custom?.kind).toBe("extra");
  const all = await logsToday(PLAN_CLIENT_ID);
  expect(all.every((r) => r.meal_position < 101)).toBe(true);
});

test("off-plan photo flow (mocked analyze): EST in UI, est_* + off_plan_macros written together", async ({ page }) => {
  await openLogger(page);
  await mockAnalyzePhotoRoute(page, {
    description: "Chipotle bowl, double chicken",
    calories: 650, protein_g: 45, carbs_g: 60, fat_g: 22,
  });

  await page.locator('[data-rowkey="p2"]').getByLabel("more").click();
  await page.getByRole("button", { name: /Off-plan \(photo \/ text\)/ }).click();

  // Feed the hidden file input directly (capture=environment input).
  await page.setInputFiles('input[type="file"]', {
    name: "meal.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG,
  });

  // AI estimate card with the EST badge, then commit.
  await expect(page.getByText("Chipotle bowl, double chicken")).toBeVisible();
  await expect(page.getByText("~650 cal")).toBeVisible();
  await page.getByRole("button", { name: "Log it — totals update ✓" }).click();
  await expect(page.getByText("Logged off-plan ✓ — totals updated")).toBeVisible();

  // Row shows the Off-plan tag + EST badge + description; bar prorates est_*.
  const row2 = page.locator('[data-rowkey="p2"]');
  await expect(row2.getByText("Off-plan")).toBeVisible();
  await expect(row2.getByText("EST", { exact: true })).toBeVisible();
  await expect(row2.getByText("Chipotle bowl, double chicken")).toBeVisible();
  await expect(page.getByText("1,750 left")).toBeVisible(); // 2400 − 650

  // DB: est_* and off_plan_macros written TOGETHER on the same row.
  const row = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 2), (r) => r?.adherence === "Off-plan");
  expect(row!.adherence).toBe("Off-plan");
  expect(Number(row!.est_kcal)).toBe(650);
  expect(Number(row!.est_protein)).toBe(45);
  expect(Number(row!.est_carbs)).toBe(60);
  expect(Number(row!.est_fats)).toBe(22);
  expect(row!.macros_pending).toBeFalsy();
  expect(row!.off_plan_details).toBe("Chipotle bowl, double chicken");
  expect(row!.off_plan_macros).toMatchObject({
    kcal: 650, protein: 45, carbs: 60, fats: 22, estimated: true,
  });
});
