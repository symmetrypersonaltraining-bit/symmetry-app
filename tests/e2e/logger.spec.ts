// ============================================================================
// E2E — core one-tap logger flows (plan-mode client "V3 Plan Tester").
// Covers: one-tap log (macro bar + DB row), adherence proration matrix,
// unlog-to-edit-relog, delete + undo, long-press drag reorder vs short press.
// ============================================================================

import { test, expect, Page } from "@playwright/test";
import {
  PLAN_CLIENT_ID, MEAL_IDS, resetLogs, logsToday, logAtPosition,
  waitForDb, muteCoach,
} from "./helpers";
import { STORAGE_STATE } from "./env";

test.use({ storageState: STORAGE_STATE.plan });

// Fixture meal macros (see supamock/seed.ts):
// M1 Breakfast p56 c29 f3 = 367 kcal · M2 Lunch p46 c45 f5 = 409 kcal
// Daily targets 2400 kcal / 190P / 210C / 65F.

async function openLogger(page: Page) {
  await muteCoach(page);
  await page.goto("/nutrition");
  await expect(page.locator('[data-rowkey="p1"]')).toBeVisible({ timeout: 60_000 });
}

async function openMealSheet(page: Page, rowKey: string) {
  await page.locator(`[data-rowkey="${rowKey}"]`).getByLabel("more").click();
  await expect(page.getByRole("button", { name: "Most" })).toBeVisible();
}

test.beforeEach(async () => {
  await resetLogs(PLAN_CLIENT_ID);
});

test("one-tap log updates the macro bar and writes the correct row", async ({ page }) => {
  await openLogger(page);
  await expect(page.getByText("2,400 left")).toBeVisible();

  await page.getByLabel("log M1 full").click();

  // Macro bar: 2400 − 367 = 2033 left; protein pill 56/190 g.
  await expect(page.getByText("2,033 left")).toBeVisible();
  await expect(page.getByText("56/190 g")).toBeVisible();
  await expect(page.getByText("Breakfast logged — Full ✓")).toBeVisible();

  const row = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 1), (r) => !!r?.adherence);
  expect(row).toBeTruthy();
  expect(row!.adherence).toBe("Full");
  expect(row!.meal_id).toBe(MEAL_IDS.breakfast);
  expect(row!.meal_position).toBe(1);
  expect(row!.est_kcal).toBeNull();
  expect(row!.macros_pending).toBeFalsy();

  const all = await logsToday(PLAN_CLIENT_ID);
  expect(all.length).toBe(1); // exactly one write target row
});

test("each adherence level prorates the macro bar and persists", async ({ page }) => {
  await openLogger(page);

  const cases: { button: string; adherence: string; left: string; protein: string }[] = [
    // M1 = 367 kcal / 56P. left = round(2400 − 367×pct), protein pill = round(56×pct).
    { button: "¾ Most", adherence: "3/4", left: "2,125 left", protein: "42/190 g" },
    { button: "½ Half", adherence: "1/2", left: "2,217 left", protein: "28/190 g" },
    { button: "¼ Some", adherence: "1/4", left: "2,308 left", protein: "14/190 g" },
    { button: "— Skipped", adherence: "Skipped", left: "2,400 left", protein: "0/190 g" },
    { button: "✓ Full", adherence: "Full", left: "2,033 left", protein: "56/190 g" },
  ];

  for (const c of cases) {
    await openMealSheet(page, "p1");
    await page.getByRole("button", { name: c.button }).click();
    await expect(page.getByText(c.left)).toBeVisible();
    await expect(page.getByText(c.protein)).toBeVisible();
    const row = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 1), (r) => r?.adherence === c.adherence);
    expect(row!.adherence).toBe(c.adherence);
    expect(row!.est_kcal).toBeNull(); // plan-prorated rows never write est_*
  }
});

test("unlog-to-edit-relog: unlog, adjust an amount, relog keeps the override", async ({ page }) => {
  await openLogger(page);

  // Log M2 full → 2400 − 409 = 1991 left.
  await page.getByLabel("log M2 full").click();
  await expect(page.getByText("1,991 left")).toBeVisible();

  // Unlog to edit.
  await openMealSheet(page, "p2");
  await page.getByRole("button", { name: "Unlog to edit" }).click();
  await expect(page.getByText("Unlogged — edit items, then relog ✓")).toBeVisible();
  await expect(page.getByText("2,400 left")).toBeVisible();
  // A bare one-tap log carries no overrides → the row is deleted outright.
  await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 2), (r) => r === null);
  expect(await logAtPosition(PLAN_CLIENT_ID, 2)).toBeNull();

  // Edit: chicken 6 oz → 3 oz via the adjust steppers (step for oz = 1).
  await openMealSheet(page, "p2");
  await page.getByRole("button", { name: "Adjust / edit this meal" }).click();
  // The adjust sheet item rows are div.rounded-xl siblings — scope tight.
  const chickenRow = page
    .locator("div.rounded-xl")
    .filter({ hasText: "Chicken Breast" })
    .filter({ has: page.getByRole("button", { name: "−" }) })
    .last(); // innermost matching row (ancestors don't carry the .rounded-xl class)
  for (let i = 0; i < 3; i++) await chickenRow.getByRole("button", { name: "−" }).click();
  // Live preview: p 25 / c 45 / f 2.5 → 303 cal.
  await expect(page.getByText("303 cal · 25P / 45C / 3F")).toBeVisible();
  await page.getByRole("button", { name: "Save — totals update ✓" }).click();

  // Saved as an unlogged edit → still nothing consumed.
  await expect(page.getByText("2,400 left")).toBeVisible();
  const placeholder = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 2), (r) => !!r);
  expect(placeholder!.item_overrides?.__unlogged).toBe(true);
  expect(placeholder!.item_overrides?.["ee130000-0000-4000-8000-000000000021"]).toEqual({ amount: 3 });

  // Relog full — the edited amounts stick: 302.5 kcal → 2,098 left.
  await page.getByLabel("log M2 full").click();
  await expect(page.getByText("2,098 left")).toBeVisible();
  const relogged = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 2), (r) => r?.adherence === "Full");
  expect(relogged!.adherence).toBe("Full");
  expect(relogged!.item_overrides?.__unlogged).toBeUndefined();
  expect(relogged!.item_overrides?.["ee130000-0000-4000-8000-000000000021"]).toEqual({ amount: 3 });
});

test("delete meal (today only) + undo restores it", async ({ page }) => {
  await openLogger(page);
  await expect(page.locator('[data-rowkey="p3"]')).toBeVisible();

  await openMealSheet(page, "p3");
  await page.getByRole("button", { name: "Delete meal" }).click();

  // Row disappears; DB row is a __removed marker (plan untouched).
  await expect(page.locator('[data-rowkey="p3"]')).toHaveCount(0);
  const removed = await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 3), (r) => !!r?.item_overrides?.__removed);
  expect(removed!.item_overrides?.__removed).toBe(true);
  expect(removed!.adherence).toBe("Skipped");

  // Undo from the toast.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Restored ✓")).toBeVisible();
  await expect(page.locator('[data-rowkey="p3"]')).toBeVisible();
  // Nothing was logged before the delete → restore removes the marker row.
  await waitForDb(() => logAtPosition(PLAN_CLIENT_ID, 3), (r) => r === null);
  expect(await logAtPosition(PLAN_CLIENT_ID, 3)).toBeNull();
});

test("short press on the handle does NOT reorder; a ~450ms hold + drag does", async ({ page }) => {
  await openLogger(page);

  const rowKeys = () => page.locator("[data-rowkey]").evaluateAll((els) => els.map((e) => e.getAttribute("data-rowkey")));
  expect(await rowKeys()).toEqual(["p1", "p2", "p3", "p4", "p5"]);

  // --- short press + move (scroll intent) → lift cancelled, no reorder ---
  const handle1 = page.getByLabel("hold to move M1");
  const hb = (await handle1.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 60, { steps: 4 }); // fast move < 400ms
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await rowKeys()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  await expect(page.getByText("Reordered — renumbered ✓")).toHaveCount(0);
  expect((await logsToday(PLAN_CLIENT_ID)).length).toBe(0); // nothing persisted

  // --- press-and-hold ≥450ms, then drag M1 below M2 → reorder persists ---
  const hb2 = (await handle1.boundingBox())!;
  const startX = hb2.x + hb2.width / 2;
  const startY = hb2.y + hb2.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(600); // > 400ms lift threshold — the row lifts
  // Drag down in small steps until the live preview order shows p1 in slot 2
  // (the list reorders under the pointer, so poll instead of aiming blind).
  for (let dy = 10; dy <= 220; dy += 10) {
    await page.mouse.move(startX, startY + dy, { steps: 2 });
    const order = await rowKeys();
    if (order[0] === "p2" && order[1] === "p1") break;
  }
  await page.mouse.up();

  // NOTE: React StrictMode (next dev) can double-fire the toast — match .first().
  await expect(page.getByText("Reordered — renumbered ✓").first()).toBeVisible();
  expect(await rowKeys()).toEqual(["p2", "p1", "p3", "p4", "p5"]);

  // __ord placeholders persisted for the affected rows (Skipped + __unlogged → 0 consumed).
  const rows = await waitForDb(() => logsToday(PLAN_CLIENT_ID), (r) => r.length >= 2);
  const ordOf = (pos: number) => rows.find((r) => r.meal_position === pos)?.item_overrides?.__ord;
  expect(ordOf(2)).toBe(0);
  expect(ordOf(1)).toBe(1);
  await expect(page.getByText("2,400 left")).toBeVisible(); // ordering never affects totals

  // Reload — order survives (server renders from __ord).
  await page.reload();
  await expect(page.locator('[data-rowkey="p1"]')).toBeVisible({ timeout: 60_000 });
  expect(await rowKeys()).toEqual(["p2", "p1", "p3", "p4", "p5"]);
});
