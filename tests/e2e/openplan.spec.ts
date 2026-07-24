// ============================================================================
// E2E — open-plan mode ("V3 Open Tester", no live plan, no targets).
// Covers: building a slot from the real food_catalog search (seeded ~20 rows)
// and save-day-as-plan creating meal_plans + meals + meal_items + macro_targets.
//
// NOTE (RLS): clients have SELECT-only policies on meal_plans/meals/meal_items/
// macro_targets in BOTH dev and prod, so the save-day-as-plan inserts only
// succeed for the trainer (is_trainer()). The save test therefore runs as the
// trainer viewing the open client (/nutrition?clientId=…) — flagged in
// BUILD_NOTES follow-ups as an app-level RLS gap for client-side saves.
// ============================================================================

import { test, expect, Page } from "@playwright/test";
import {
  OPEN_CLIENT_ID, resetLogs, resetOpenClientPlans, logAtPosition,
  waitForDb, muteCoach, dbTrainer,
} from "./helpers";
import { STORAGE_STATE } from "./env";

async function buildBreakfastSlot(page: Page) {
  // Tap the Breakfast slot circle → slot sheet → food DB search.
  await page.getByLabel("log Breakfast full").click();
  await page.getByRole("button", { name: "＋ Build from the food database" }).click();
  await page.getByPlaceholder(/Search foods/).fill("chicken breast");
  await page.getByRole("button", { name: /Chicken Breast, cooked/ }).click();
  await page.getByRole("button", { name: "Add it ✓" }).click();
  await expect(page.getByText("Chicken Breast, cooked added ✓")).toBeVisible();

  // Second item — jasmine rice.
  await page.getByRole("button", { name: "＋ Build from the food database" }).click();
  await page.getByPlaceholder(/Search foods/).fill("jasmine");
  await page.getByRole("button", { name: /Jasmine Rice, cooked/ }).click();
  await page.getByRole("button", { name: "Add it ✓" }).click();
  await expect(page.getByText("Jasmine Rice, cooked added ✓")).toBeVisible();
  await page.getByLabel("Close").click();
}

test.beforeEach(async () => {
  await resetLogs(OPEN_CLIENT_ID);
  await resetOpenClientPlans(); // keep the client in open-plan mode
});

test.describe("as the open-plan client", () => {
  test.use({ storageState: STORAGE_STATE.open });

  test("build a slot from food_catalog search — logs Off-plan with itemized est_*", async ({ page }) => {
    await muteCoach(page);
    await page.goto("/nutrition");
    await expect(page.getByText("Open plan:")).toBeVisible({ timeout: 60_000 });

    await buildBreakfastSlot(page);

    // Row shows built state: 2 items, itemized macros (kcal from p/c/f):
    // chicken 35P/0C/4F=176 + rice 4P/45C/0F=196 → 372 cal · 39P/45C/4F.
    const row = page.locator('[data-rowkey="s1"]');
    await expect(row.getByText("2 items")).toBeVisible();
    await expect(row.getByText("372", { exact: false })).toBeVisible();

    // Macro bar (no targets in open mode): "372 cal eaten".
    await expect(page.getByText("cal eaten")).toBeVisible();

    const dbRow = await waitForDb(() => logAtPosition(OPEN_CLIENT_ID, 1), (r) => !!r);
    expect(dbRow!.adherence).toBe("Off-plan");
    expect(Number(dbRow!.est_kcal)).toBe(372);
    expect(Number(dbRow!.est_protein)).toBe(39);
    const meta = dbRow!.item_overrides?.__custom;
    expect(meta?.kind).toBe("slot");
    expect(meta?.items?.length).toBe(2);
    expect(meta?.items?.[0]?.food_id).toBeTruthy(); // came from the catalog
  });
});

test.describe("as the trainer (save-day-as-plan needs is_trainer() for the inserts)", () => {
  test.use({ storageState: STORAGE_STATE.trainer });

  test("save-day-as-plan creates plan v1 + meals + items + macro_targets", async ({ page }) => {
    await muteCoach(page);
    await page.goto(`/nutrition?clientId=${OPEN_CLIENT_ID}`);
    await expect(page.getByText("Open plan:")).toBeVisible({ timeout: 60_000 });

    await buildBreakfastSlot(page);

    await page.getByRole("button", { name: /Save my built day as the plan/ }).click();
    // Computed targets from the built day: 372 cal · 39P / 45C / 4F
    // (shown in the SavePlanSheet next to "Daily targets").
    await expect(page.locator("span").filter({ hasText: "372 cal · 39P / 45C / 4F" })).toBeVisible();
    await page.getByRole("button", { name: "Make it my ongoing plan ✓" }).click();
    await expect(page.getByText(/is live \(v1\)/)).toBeVisible();

    const db = await dbTrainer();
    const plan = await waitForDb(
      async () => (await db.from("meal_plans").select("*").eq("client_id", OPEN_CLIENT_ID).eq("status", "live").maybeSingle()).data,
      (p) => !!p
    );
    expect(plan).toBeTruthy();
    expect(plan!.version_number).toBe(1);
    expect(plan!.status).toBe("live");

    const { data: meals } = await db.from("meals").select("*, meal_items(*)").eq("meal_plan_id", plan!.id);
    expect(meals!.length).toBe(1);
    expect(meals![0].name).toBe("Breakfast");
    expect(meals![0].position).toBe(1);
    const items = meals![0].meal_items;
    expect(items.length).toBe(2);
    const chicken = items.find((i: { food: string }) => /Chicken/.test(i.food));
    expect(Number(chicken.protein)).toBe(35);

    const { data: target } = await db
      .from("macro_targets").select("*").eq("client_id", OPEN_CLIENT_ID)
      .order("effective_date", { ascending: false }).limit(1).maybeSingle();
    expect(Number(target!.calories)).toBe(372);
    expect(Number(target!.protein)).toBe(39);
    expect(Number(target!.carbs)).toBe(45);
    expect(Number(target!.fats)).toBe(4);
  });
});
