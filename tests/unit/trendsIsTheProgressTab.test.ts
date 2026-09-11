import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TRENDS IS THE PROGRESS TAB, SO IT IS NOT ALSO A SHEET.
 *
 * Dustin, 11 Sep 2026, walking the plan menu: *"Let's remove that altogether.
 * That is essentially the progress tab, so there's really no reason to have
 * that there."*
 *
 * The sheet was a paragraph and a link to /progress. Pinned so it does not
 * quietly come back as "just a shortcut".
 */
const ROOT = process.cwd();
const NUT = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
// Strip comments: the file explains the retirement in prose that names the sheet.
const CODE = NUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("there is no trends sheet kind", () => {
  assert.doesNotMatch(CODE, /kind: "trends"/, "the union must not carry it");
  assert.doesNotMatch(CODE, /case "trends"/, "the router must not render it");
  assert.doesNotMatch(CODE, /TrendsSheetView/, "the component is gone, not orphaned");
});

test("the plan menu has no Trends row", () => {
  const menu = CODE.slice(CODE.indexOf("function MenuSheetView("), CODE.indexOf("function VersionsSheetView("));
  assert.doesNotMatch(menu, /"Trends"/);
});

test("Progress is still one tap away in the bottom nav — that is the replacement", () => {
  const nav = readFileSync(join(ROOT, "src/components/BottomNav.tsx"), "utf8");
  assert.match(nav, /href: "\/progress"/);
});
