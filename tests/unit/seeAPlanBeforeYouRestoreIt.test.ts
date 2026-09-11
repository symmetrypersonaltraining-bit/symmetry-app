import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SEE A PLAN BEFORE YOU RESTORE IT.
 *
 * Dustin, 11 Sep 2026, on Plan versions: *"It doesn't really tell you a whole
 * lot just in that one tab. We should have a way to tap on that and open up a
 * little more details on exactly what that plan looks like without actually
 * clicking make this my plan again."*
 */
const NUT = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
const CODE = NUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SHEET = CODE.slice(CODE.indexOf("function VersionsSheetView("), CODE.indexOf("function BuildPlanSheetView("));

test("a version's head is a toggle, and it is not the restore button", () => {
  assert.match(SHEET, /onClick=\{\(\) => toggleVersion\(v\.id\)\}/, "tapping the head opens it");
  assert.match(SHEET, /aria-expanded=\{openVersion === v\.id\}/);
  assert.match(SHEET, /Make this my plan again/, "restoring is still there, separately");
  const head = SHEET.slice(SHEET.indexOf("toggleVersion(v.id)"), SHEET.indexOf("</button>"));
  assert.doesNotMatch(head, /plan-restore/, "the head must never restore");
});

test("the detail is the plan's own meals and items, read from the database", () => {
  const loader = CODE.slice(CODE.indexOf("async function toggleVersion("), CODE.indexOf("function VersionsSheetView("));
  assert.match(loader, /from\("meals"\)/);
  assert.match(loader, /\.eq\("meal_plan_id", planId\)/, "this version's meals, not the live plan's");
  assert.match(loader, /from\("meal_items"\)/);
  assert.match(loader, /it\.kcal != null \? Number\(it\.kcal\) \|\| 0 : kcalOf\(p, c, f\)/,
    "kcal is the row's own, or 4/4/9 from its own macros — never invented");
});

test("it shows what he asked for: meals in order, items with amounts, kcal per meal, a day total", () => {
  assert.match(SHEET, /M\{i \+ 1\} \{m\.name/, "meals numbered in order");
  assert.match(SHEET, /it\.amount != null \? ` — \$\{it\.amount\}/, "every item with its amount");
  assert.match(SHEET, /\{Math\.round\(mk\)\} cal/, "kcal per meal");
  assert.match(SHEET, /per day<\/p>/, "a day total");
});

test("opening a version loads it once and keeps it", () => {
  const loader = CODE.slice(CODE.indexOf("async function toggleVersion("), CODE.indexOf("function VersionsSheetView("));
  assert.match(loader, /if \(versionMeals\[planId\]\) return;/, "a second open is free");
});
